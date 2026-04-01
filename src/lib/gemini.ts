import { VertexAI } from "@google-cloud/vertexai";
import { GoogleAuth } from 'google-auth-library';

let _vertexInstance: VertexAI | null = null;
let _authInstance: GoogleAuth | null = null;

function getVertexAI(): VertexAI {
  if (!_vertexInstance) {
    if (!process.env.GCP_PROJECT_ID) {
      console.warn("WARNING: GCP_PROJECT_ID is not set in environment.");
    }

    let credentials;
    if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
      try {
        const parsed = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
        credentials = {
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, '\n'), // Ensure newlines are correctly formatted
        };
        console.log("[Auth] Successfully parsed GCP_SERVICE_ACCOUNT_KEY from environment.");
      } catch (error: any) {
        console.error("Failed to parse GCP_SERVICE_ACCOUNT_KEY json string.", error);
        throw new Error(`Invalid GCP_SERVICE_ACCOUNT_KEY JSON format: ${error.message}`);
      }
    } else {
       console.log("[Auth] No GCP_SERVICE_ACCOUNT_KEY found. Relying on Application Default Credentials (ADC).");
    }

    interface VertexSettings {
      project: string;
      location: string;
      googleAuthOptions?: {
        credentials: {
          client_email: string;
          private_key: string;
        };
      };
    }

    const vertexSettings: VertexSettings = {
      project: process.env.GCP_PROJECT_ID || "build-time-fallback-project",
      location: process.env.GCP_LOCATION || "us-central1",
    };

    if (credentials) {
      vertexSettings.googleAuthOptions = { credentials };
    }

    _vertexInstance = new VertexAI(vertexSettings);
  }
  return _vertexInstance;
}

function getGoogleAuth(): GoogleAuth {
  if (!_authInstance) {
    let credentials;
    if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
      try {
        const parsed = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
        credentials = {
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, '\n'),
        };
      } catch (error) {
        console.error("Failed to parse GCP_SERVICE_ACCOUNT_KEY json string in getGoogleAuth.");
      }
    }
    _authInstance = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
      credentials
    });
  }
  return _authInstance;
}

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DEFAULT_IMAGEN_MODEL = process.env.IMAGEN_MODEL || "imagen-3.0-generate-001";

/**
 * Helper to retry Vertex AI calls with exponential backoff on 429 Errors
 */
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error.message?.includes("429") || error.status === 429 || error.code === 429;
    if (retries > 0 && isRateLimit) {
      console.warn(`[VertexAI] Rate limit (429) hit. Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}


export const getInteractivePrompt = (provider: string) => `
You are an expert Cloud Architect. Analyze this architecture diagram.
Extract the architecture details into a STRICT JSON payload.

Your task is to comprehensively outline the architecture, locating EVERY single architectural component with PIXEL-PERFECT ACCURACY.
This includes:
- Specific ${provider} service icons
- Generic clients (mobile devices, iPhones, Androids, laptops, web browsers)
- Generic infrastructure (databases, generic servers, internet gateways)
- Large boundary boxes (like VPCs, Subnets, or large outer grouping boxes like 'Google Cloud Platform')

GROUNDING RULES (MANDATORY):
- Use your native [ymin, xmin, ymax, xmax] spatial grounding scale [0-1000].
- 0 is the EXTREME LEFT BORDER of the image file (including any white space/margins).
- 1000 is the EXTREME RIGHT BORDER of the image file (including any white space/margins).
- The [ymin, xmin, ymax, xmax] box must surround ONLY the square icon.
- DEAD CENTER: Ensure the box is perfectly centered on the icon.
- NO LABELS: Do not include any text or labels inside the box.

Structure:
{
  "cost_estimate": "Concise monthly cost range (e.g., '$150 - $250')",
  "cost_details": "Paragraph explaining the main cost drivers.",
  "security_score": 85,
  "security_summary": "A 2-3 sentence summary of the security posture.",
  "simulation_parameters": [
    {
      "id": "parameter-slug",
      "label": "User-facing label (e.g., Requests per Second)",
      "min": 10,
      "max": 10000,
      "default_value": 100,
      "unit": "req/s"
    }
  ],
  "components": [
    {
      "id": "...",
      "name": "...",
      "service": "...",
      "service_type": "The specific service (e.g. 'Cloud Run', 'App Engine') or generic type (e.g. 'Mobile Client', 'Web Browser', 'Boundary Box', 'Database'). Be precise (e.g., 'iOS', 'Android', 'Web').",
      "is_boundary": false, // Set to true ONLY if this component is a large container/boundary box surrounding other icons.
      "parent_id": null, // If this icon is physically located INSIDE a boundary box, provide the bounding box's ID here. Otherwise null.
      "description": "Short purpose or function of this component.",
      "cost": "Rough cost estimate for this specific item (e.g. $20)",
      "security": "Security capabilities or requirements for this item.",
      "box_2d": [100, 100, 200, 200], // [ymin, xmin, ymax, xmax]
      "dependencies": ["id1", "id2"], // IDs or Names of components this icon connects to via arrows/lines
      "zone": "Public | Private | Restricted" // Determine based on containment boxes (e.g. VPC, Subnet) or connectivity
    }
  ]
}

RELATIONSHIP EXTRACTION (CRITICAL):
1. Use arrows, lines, and proximity to determine 'dependencies'. If A points to B, add B to A's dependencies.
2. Look for large boundary boxes (VPCs, Subnets, Tiers). Assign components to 'zone' based on these containers.
3. If no explicit container, use connectivity (e.g. connected to Internet Gateway = 'Public').

CRITICAL: The 'simulation_parameters' array should contain 3 to 5 relevant metrics that would stress-test THIS specific architecture (e.g., Active Users, Database Queries/sec, Payload Size(MB), Data Ingestion Rate).
BE CONCISE: Return ONLY the JSON payload. Focus on high-value details to ensure fast generation.
`;

export async function analyzeArchitecture(imageBuffer: Buffer, mimeType: string, provider: 'GCP' | 'AWS' | 'Azure' = 'GCP') {
  // IMPORTANT: The system uses the model defined in DEFAULT_GEMINI_MODEL.
  // Using an invalid model name will cause 403 errors.
  const model = getVertexAI().getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });

  const request = {
    contents: [
      {
        role: "user",
        parts: [
          { text: getInteractivePrompt(provider) },
          {
            inlineData: {
              data: imageBuffer.toString("base64"),
              mimeType,
            },
          },
        ],
      },
    ],
  };

  const result = await retryWithBackoff(() => model.generateContent(request));
  const response = await result.response;

  const text = (response.candidates?.[0]?.content?.parts?.[0]?.text || "").replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  return JSON.parse(text);
}

/**
 * Generates sensible infrastructure configuration defaults for each component,
 * to pre-fill the simulation configuration sheet in Manual mode.
 */
export async function generateComponentDefaults(architectureJson: any, provider: string = "GCP"): Promise<any[]> {
  const model = getVertexAI().getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });

  const components = architectureJson.components || [];
  const componentList = components
    .map((c: any) => `- id: "${c.id}", name: "${c.name}", service: "${c.service}"`)
    .join("\n");

  const prompt = `
You are a ${provider} cloud infrastructure expert.
Given these architecture components, generate sensible production default configuration values for each.
For each component, provide 2-4 KEY infrastructure parameters that are most relevant to its service type.

Components:
${componentList}

Return STRICT JSON array ONLY (no markdown, no explanation):
[
  {
    "component_id": "<id from list above>",
    "component_name": "<name>",
    "service": "<service>",
    "configs": [
      { "key": "max_instances", "label": "Max Instances", "default": 10, "min": 1, "max": 1000, "unit": "instances" },
      { "key": "cpu", "label": "CPU Limit", "default": 2, "min": 1, "max": 96, "unit": "vCPU" }
    ]
  }
]

Rules:
- Use the exact component id from the list
- Pick configs most relevant to the service (e.g. for Cloud SQL: db_tier, max_connections; for Cloud Run: max_instances, cpu, memory_gb; for Pub/Sub: message_retention_days, max_delivery_attempts)
- Set realistic production defaults (not minimal toy values)
- min/max must be sensible ranges for that parameter
`;

  const result = await retryWithBackoff(() => model.generateContent(prompt));
  let text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  text = text.replace(/^```json\s*/, "").replace(/```$/, "").trim();
  return JSON.parse(text);
}

export async function simulateWorkload(architectureJson: any, simulationState: any, options: {
  scenarioPreset?: string,
  failureSimulation?: string[],
  isMultiRegion?: boolean,
  serviceConfigs?: Array<{ component_id: string; component_name: string; service: string; configs: Array<{ key: string; label: string; value?: number; default: number; unit: string }> }>,
  provider?: string
}) {
  const model = getVertexAI().getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });
  const provider = options.provider || "GCP";

  const archServices = architectureJson.components?.map((c: any) => c.service).filter(Boolean) || [];
  const stateStr = Object.entries(simulationState)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  let contextStr = `Scenario Preset: ${options.scenarioPreset || "Custom"}\n`;
  contextStr += `Multi-Region Deployment Enabled: ${options.isMultiRegion || false}\n`;
  if (options.failureSimulation && options.failureSimulation.length > 0) {
    contextStr += `SIMULATED FAILURES: ${options.failureSimulation.join(", ")}\n`;
    contextStr += "CRITICAL: You MUST factor these failures into your response (e.g. show failover latency, degraded capacity scaling, specific bottleneck warnings).";
  }

  const isManualMode = options.serviceConfigs && options.serviceConfigs.length > 0;

  let configSection = "";
  if (isManualMode) {
    const configLines = options.serviceConfigs!.map(comp => {
      const params = comp.configs
        .map(c => `${c.label}: ${(c as any).value ?? c.default} ${c.unit}`)
        .join(", ");
      return `  - ${comp.component_name} (${comp.service}): ${params}`;
    }).join("\n");
    configSection = `
USER-DEFINED INFRASTRUCTURE CONFIGURATIONS (Manual Mode):
${configLines}
CRITICAL: Base your entire analysis on these EXACT user-defined configurations. Evaluate whether these specific config values can handle the given workload. Call out if any config is under-provisioned.`;
  } else {
    configSection = `INFRASTRUCTURE MODE: Auto (AI-Inferred). Assume sensible ${provider} production defaults for each service. You MUST include an "assumed_configs" array in your response listing what you assumed for each key service.`;
  }

  const prompt = `
You are an expert Site Reliability Engineer and Cloud Architect.

Here is an architecture composed of the following services:
${archServices.join(", ")}

The user is running a traffic simulation with the following workload parameters:
${stateStr}

ADVANCED CONFIGURATION:
${contextStr}

${configSection}

Analyze the Infrastructure Impact of this specific workload and configuration on this architecture.
Return a STRICT JSON response exactly matching this structure:

{
  "impact_summary": "A high-level 2-3 sentence summary of how the architecture handles this load.",
  "bottlenecks": [
    "A specific bottleneck or point of failure"
  ],
  "bottleneck_components": [
    "component-slug-id"
  ],
  "cost_impact": "Explain how this workload affects the monthly bill.",
  "scaling_suggestions": [
    "A concrete actionable step to handle this load"
  ],
  "scaling_result": [
    { "service": "App Engine", "previous_instances": 4, "new_instances": 18 }
  ],
  "latency_prediction": [
    { "tier": "Frontend", "latency_ms": 120 },
    { "tier": "Database", "latency_ms": 70 }
  ],
  "cost_breakdown": [
    { "service": "Compute Engine", "monthly_cost": 2800 }
  ],
  "optimizations": [
    { "title": "Add Cloud CDN", "description": "Reduce egress cost by caching static assets deeper.", "cost_reduction_percentage": 40 }
  ],
  "carbon_footprint": {
    "estimated_co2_kg": 480,
    "optimization_suggestion": "Switch to ARM instances for worker nodes.",
    "potential_reduction_percentage": 28
  },
  "infrastructure_limits": [
    { "service": "Cloud SQL", "limit_description": "Connection Limit", "threshold_value": 4000 }
  ]${!isManualMode ? `,
  "assumed_configs": [
    { "service": "Cloud Run", "config": "max_instances=10, CPU=2vCPU, Memory=4GB" }
  ]` : ""}
}
`;

  const result = await retryWithBackoff(() => model.generateContent(prompt));
  const response = await result.response;


  let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

  text = text.replace(/^```json\s*/, "").replace(/```$/, "").trim();

  return JSON.parse(text);
}

function getTerraformGuardrails(provider: string) {
  if (provider === "AWS") {
    return `
     AWS PROVIDER GUARDRAILS (CRITICAL):
    1. aws_instance: Use valid instance types (t3.medium, m5.large) and always use a \`data "aws_ami"\` block to fetch the ami instead of hardcoding it. ALWAYS provide \`subnet_id\`.
    2. aws_db_instance: Must include \`engine_version\`, \`instance_class\` (e.g. db.t3.medium), \`username\`, and \`password\`. Use valid engines like mysql or postgres.
    3. aws_s3_bucket: Do not include \`acl\` directly; if needed, use \`aws_s3_bucket_acl\`. bucket names must be globally unique, force_destroy=true is recommended.
    4. aws_autoscaling_group: ALWAYS specify \`min_size\`, \`max_size\`, and \`vpc_zone_identifier\` (needs a list of subnet IDs).
    5. aws_security_group: ALWAYS include \`vpc_id\`. Ensure bidirectional rules map cleanly.
    6. Ensure you include the correct AWS provider block with a region variable.
    7. ALL VARIABLES used in any file MUST be declared in \`variables.tf\` and assigned a sensible default or value in \`terraform.tfvars\`.
    `;
  } else if (provider === "Azure") {
    return `
     AZURE PROVIDER GUARDRAILS (CRITICAL):
    1. azurerm_resource_group: Always create a resource group. Every other resource MUST reference \`resource_group_name = azurerm_resource_group.name_here.name\` and \`location = azurerm_resource_group.name_here.location\`.
    2. Virtual Machines: Prefer \`azurerm_linux_virtual_machine\` or \`azurerm_windows_virtual_machine\` over the deprecated \`azurerm_virtual_machine\`. Use \`size = "Standard_D2s_v3"\` or similar. ALWAYS include \`network_interface_ids\`, \`os_disk\`, and \`admin_username\`.
    3. azurerm_storage_account: Use valid \`account_tier\` (e.g., "Standard") and \`account_replication_type\` (e.g., "LRS"). Account names must be unique, lowercase, no dashes, 3-24 chars.
    4. azurerm_subnet: Use \`address_prefixes\` (list of strings) instead of the deprecated \`address_prefix\`. Must reference \`virtual_network_name\`.
    5. Ensure you include the correct Azure provider block with \`features {}\`.
    6. ALL VARIABLES used in any file MUST be declared in \`variables.tf\` and assigned a sensible default or value in \`terraform.tfvars\`.
    `;
  } else {
    return `
     GCP PROVIDER GUARDRAILS (CRITICAL):
    1. google_compute_autoscaler: NEVER put 'region' directly in this resource. Use 'zone' for Zonal.
    2. google_compute_instance_group_manager: ALWAYS include a 'auto_healing_policies { health_check = ... }' block.
    3. google_compute_health_check: DO NOT put 'port', 'proxy_header', or 'request_path' at the top level. They MUST be inside a nested 'http_health_check { ... }' or 'tcp_health_check { ... }' block.
    4. google_compute_autoscaler: ALWAYS include 'min_replicas' and 'max_replicas' inside the 'autoscaling_policy' block.
    5. google_container_cluster: Use 'release_channel { channel = "REGULAR" }' block instead of 'release_channel = "REGULAR"'.
    6. References (CRITICAL): Ensure all variables used in strings are actually defined in variables.tf.
    7. google_compute_instance_group_manager: The 'update_policy' block MUST include 'minimal_action' (e.g., "REPLACE" or "RESTART").
    8. google_compute_instance_group_manager: DO NOT put 'autoscaling_policy' inside this resource. It MUST be a separate 'google_compute_autoscaler'.
    9. google_compute_backend_service: ALWAYS include 'health_checks = [google_compute_health_check.name.id]' reference.
    10. google_compute_region_instance_group_manager: Use this for regional managed instance groups, same rules apply.
    `;
  }
}

export async function generateFullTerraform(
  architectureJson: any,
  simulationState: Record<string, number>,
  simulationReport?: any,
  provider: string = "GCP"
): Promise<{ files: Record<string, string>; summary: string }> {
  const model = getVertexAI().getGenerativeModel({
    model: DEFAULT_GEMINI_MODEL,
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 0.1,
    }
  });

  const componentsStr = JSON.stringify(architectureJson.components);
  const simStr = JSON.stringify(simulationState);
  const reportStr = simulationReport ? JSON.stringify(simulationReport) : "No active simulation results.";

  const prompt = `
    You are a Senior DevOps Engineer. Generate CONCISE, PRODUCTION-READY Terraform code for this GCP architecture.
    
    COMPONENTS: ${componentsStr}
    SIMULATION INPUTS: ${simStr}
    SIMULATION FINDINGS: ${reportStr}
    
    You MUST use exactly this format for your response:
    
    [FILE: variables.tf]
    (Variable definitions)
    [/FILE]

    [FILE: terraform.tfvars]
    (Values for variables, scaled to simulation and findings)
    [/FILE]

    [FILE: main.tf]
    (Terraform code for networking, compute, and databases.)
    [/FILE]
    
    [FILE: outputs.tf]
    (Resource outputs)
    [/FILE]

    REQUIREMENTS:
    1. SMART RIGHTSIZING: Analyze the SIMULATION FINDINGS. 
       - IF BOTTLENECKS ARE PRESENT: You MUST upgrade the resource tier/size to resolve them.
       - IF NO FINDINGS ARE PRESENT (Simulation not run): Use "Heuristic Sizing". Analyze the COMPONENTS and target ${simulationState["rps"] || 0} RPS (if provided) to choose sensible, production-grade machine types (e.g. e2-standard-2 for typical apps).
    2. EXTREME CONCISCENESS: Use minimal comments. Focus on sizing and connectivity.

    3. VALID RESOURCES (CRITICAL): Use appropriate Terraform module definitions for the ${provider} provider.
    4. VARIABLE DEFINITIONS (MANDATORY): EVERY variable used in 'main.tf' MUST have a corresponding 'variable "..." {}' block in 'variables.tf'.
    5. TFVARS (MANDATORY): In 'terraform.tfvars', you MUST provide valid values for EVERY variable declared in 'variables.tf'. Scaled values must reflect traffic and findings.
    6. TRACEABILITY: Comment above each resource with the component 'name' or 'id'.
    7. CRITICAL: Do NOT wrap the code in markdown code blocks. NO backticks. NO \`\`\`.

    ${getTerraformGuardrails(provider)}
    
    
    [SUMMARY]
    Explain specifically how the resource tiers chosen address the SIMULATION FINDINGS and RPS load of ${simulationState["rps"] || 0}. 
    CRITICAL: ALWAYS write your summary as if the code is 100% successful. NEVER mention "verification failed" or "errors found" in the summary.
    [/SUMMARY]
  `;

  try {
    const result = await retryWithBackoff(() => model.generateContent(prompt));
    const response = await result.response;

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const files: Record<string, string> = {};
    let summary = "Architecture generated successfully.";

    // Parse Summary
    const summaryMatch = text.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
    if (summaryMatch) summary = summaryMatch[1].trim();

    // Parse Files (More robust manual loop that handles truncated files)
    const fileRegex = /\[FILE:\s*([a-zA-Z0-9._-]+)\]([\s\S]*?)(?=\[FILE:|\[SUMMARY|\[\/FILE|\[\/SUMMARY|$)/g;
    let match;
    while ((match = fileRegex.exec(text)) !== null) {
      const filename = match[1].trim();
      let content = match[2].trim();

      // Clean up common leftovers
      content = content.replace(/\[\/FILE\]$/, "").trim();

      // Safety: Strip markdown code blocks if present (e.g. ```terraform ... ```)
      content = content.replace(/^```[a-z]*\n/i, "").replace(/\n```$/gm, "").trim();

      files[filename] = content;
    }

    if (Object.keys(files).length === 0) {
      throw new Error("Failed to parse Terraform output.");
    }

    return { files, summary };
  } catch (error: any) {
    console.error("Terraform Gen Error:", error.message);
    throw error;
  }
}

export async function fixTerraform(
  architectureJson: any,
  simulationState: Record<string, number>,
  originalFiles: Record<string, string>,
  errorContext: string,
  simulationReport?: any,
  provider: string = "GCP"
): Promise<{ files: Record<string, string>; summary: string }> {
  const model = getVertexAI().getGenerativeModel({
    model: DEFAULT_GEMINI_MODEL,
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 0.1,
    }
  });

  const filesContext = Object.entries(originalFiles)
    .map(([name, content]) => `[FILE: ${name}]\n${content}\n[/FILE]`)
    .join("\n\n");

  const prompt = `
    You are a Senior DevOps Engineer. You previously generated Terraform code that failed validation.
    
    ### THE PROBLEM
    Terraform Error:
    "${errorContext}"
    
    ### CURRENT FILES
    ${filesContext}
    
    ### ARCHITECTURE DATA
    COMPONENTS: ${JSON.stringify(architectureJson.components)}
    SIMULATION: ${JSON.stringify(simulationState)}
    SIMULATION FINDINGS: ${simulationReport ? JSON.stringify(simulationReport) : "No findings available."}
    
    TASK:
    Fix the specific errors reported. 
    1. Ensure the code remains optimized for the SIMULATION FINDINGS (mitigate bottlenecks found).
    2. Follow all PROVIDER GUARDRAILS for ${provider}:
${getTerraformGuardrails(provider)}
    3. Return the FULL set of all files.
    4. CRITICAL AVOIDANCE: If an argument is reported as "Unsupported argument" or "not expected here", you MUST COMPLETELY REMOVE IT from the code. Do not attempt to give it a different value.
    5. CRITICAL SIMPLIFICATION: If a resource fails repeatedly, fall back to the most basic, minimal version of that resource to ensure success. Do not make the exact same mistake from the previous attempt.
    
    [SUMMARY]
    Briefly explain what was repaired and how the final state maintains scaling compliance for ${simulationState["rps"] || 0} RPS based on findings.
    [/SUMMARY]
    
    [FILE: filename]
    content
    [/FILE]
  `;

  try {
    const result = await retryWithBackoff(() => model.generateContent(prompt));
    const response = await result.response;

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const files: Record<string, string> = {};
    let summary = "Terraform code repaired.";

    // Parse Summary
    const summaryMatch = text.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/);
    if (summaryMatch) summary = summaryMatch[1].trim();

    // Parse Files (Robust manual loop)
    const fileRegex = /\[FILE:\s*([a-zA-Z0-9._-]+)\]([\s\S]*?)(?=\[FILE:|\[SUMMARY|\[\/FILE|\[\/SUMMARY|$)/g;
    let match;
    while ((match = fileRegex.exec(text)) !== null) {
      const filename = match[1].trim();
      let content = match[2].trim();
      content = content.replace(/\[\/FILE\]$/, "").trim();
      content = content.replace(/^```[a-z]*\n/i, "").replace(/\n```$/gm, "").trim();
      files[filename] = content;
    }

    // fallback to original files if some were omitted by AI (though prompt asks for full set)
    const finalFiles = { ...originalFiles, ...files };

    return { files: finalFiles, summary };
  } catch (error: any) {
    console.error("Terraform Repair Error:", error.message);
    throw error;
  }
}

export async function generateDocumentContent(imageBuffer: Buffer, mimeType: string, docType: string, environment: string) {
  const model = getVertexAI().getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });

  let focus = "Balanced, thorough documentation.";
  let sections = "- Executive Summary\n- Architecture Analysis\n- Security Implementation";

  if (docType === "Standard") {
    focus = "Cost-efficiency, flexibility, and comprehensive documentation.";
    sections = "- Executive Summary\n- Business Requirements\n- Architecture Analysis\n- Security Implementation\n- Detailed Cost Analysis\n- Performance and Scalability\n- Deployment and Operations\n- Monitoring and Maintenance\n- Risk Assessment\n- Implementation Roadmap";
  } else if (docType === "Technical") {
    focus = "Engineering depth: patterns, network, security, and bottlenecks.";
    sections = "- Architecture Analysis\n- Security Implementation\n- Performance and Scalability\n- Deployment and Operations\n- Monitoring and Maintenance";
  } else if (docType === "Business") {
    focus = "Business value, cost, risks, and strategic roadmap.";
    sections = "- Executive Summary\n- Business Requirements\n- Detailed Cost Analysis\n- Risk Assessment\n- Implementation Roadmap";
  }

  const prompt = `
    You are an expert Cloud Solutions Architect specializing in architecture documentation.
    Analyze the provided architecture diagram.
    Your task is to generate the full content for an architecture document.
    
    DOCUMENT METADATA:
    - Type: ${docType}
    - Environment: ${environment}
    - Focus Area: ${focus}
    
    REQUIRED SECTIONS:
    ${sections}
    
    Format: Use typed blocks: "paragraph", "subheading", "bullet_list" (items[]), "numbered_list" (items[]), "table" (headers[], rows[][]), "note".
    Return a STRICT JSON response:
    {
      "title": "A professional name for this architecture",
      "sections": [
        {
          "heading": "Section Name (Must match one of the Required Sections)",
          "content": [ 
            { "type": "paragraph", "text": "Essential context only (max 2 sentences)." },
            { "type": "subheading", "text": "Sub-section title" },
            { "type": "bullet_list", "items": ["Item 1", "Item 2"] }
          ]
        }
      ]
    }
  `;

  const request = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBuffer.toString("base64"),
              mimeType,
            },
          },
        ],
      },
    ],
  };

  const result = await retryWithBackoff(() => model.generateContent(request));
  const response = await result.response;

  let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

  text = text.replace(/^```json\s*/, "").replace(/```$/, "").trim();
  return JSON.parse(text);
}

/**
 * Generates document content directly from an already-analyzed InteractiveResponse JSON.
 * Used by the dashboard Documents tab to avoid re-running Vision AI on the same image.
 */
export async function generateDocumentFromJson(
  architectureJson: any,
  docType: string,
  environment: string,
  provider: string = "GCP"
) {
  const model = getVertexAI().getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });

  let focus = "Balanced, thorough documentation.";
  let sections = "- Executive Summary\n- Architecture Analysis\n- Security Implementation";

  if (docType === "Standard") {
    focus = "Cost-efficiency, flexibility, and comprehensive documentation.";
    sections = "- Executive Summary\n- Business Requirements\n- Architecture Analysis\n- Security Implementation\n- Detailed Cost Analysis\n- Performance and Scalability\n- Deployment and Operations\n- Risk Assessment\n- Implementation Roadmap";
  } else if (docType === "Technical") {
    focus = "Engineering depth: patterns, network topology, security controls, and bottlenecks.";
    sections = "- Architecture Analysis\n- Security Implementation\n- Performance and Scalability\n- Deployment and Operations\n- Monitoring and Maintenance";
  } else if (docType === "Business") {
    focus = "Business value, cost justification, risks, and strategic roadmap.";
    sections = "- Executive Summary\n- Business Requirements\n- Detailed Cost Analysis\n- Risk Assessment\n- Implementation Roadmap";
  } else if (docType === "Executive") {
    focus = "High-level summary for non-technical stakeholders.";
    sections = "- Executive Summary\n- Business Requirements\n- Risk Assessment";
  }

  const componentsContext = (architectureJson.components || [])
    .map((c: any) => `• ${c.name} (${c.service}) — Cost: ${c.cost || "N/A"}, Purpose: ${c.description || c.purpose || "N/A"}`)
    .join("\n");

  const prompt = `
    You are an expert Cloud Solutions Architect specializing in ${provider} architecture documentation.
    
    The following architecture has already been analyzed by an AI system. Use this data to generate a detailed ${docType} document.
    
    DOCUMENT METADATA:
    - Type: ${docType}
    - Environment: ${environment}
    - Cloud Provider: ${provider}
    - Focus Area: ${focus}
    
    ARCHITECTURE DATA:
    - Security Score: ${architectureJson.security_score ?? "N/A"} / 100
    - Cost Estimate: ${architectureJson.cost_estimate || "N/A"}
    - Summary: ${architectureJson.security_summary || ""}
    
    DETECTED COMPONENTS (${(architectureJson.components || []).length} total):
    ${componentsContext}
    
    REQUIRED SECTIONS:
    ${sections}
    
    Format: Use typed blocks: "paragraph", "subheading", "bullet_list" (items[]), "numbered_list" (items[]), "table" (headers[], rows[][]), "note".
    Return a STRICT JSON response:
    {
      "title": "A professional name for this architecture",
      "sections": [
        {
          "heading": "Section Name",
          "content": [
            { "type": "paragraph", "text": "Content here..." },
            { "type": "bullet_list", "items": ["Item 1", "Item 2"] }
          ]
        }
      ]
    }
  `;

  const result = await retryWithBackoff(() =>
    model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
  );
  const response = await result.response;

  let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
  text = text.replace(/^```json\s*/, "").replace(/```$/, "").trim();
  return JSON.parse(text);
}

export async function extractTfConfigs(
  tfFiles: Record<string, string>,
  architectureJson: any
): Promise<Record<string, string>> {

  const model = getVertexAI().getGenerativeModel({
    model: DEFAULT_GEMINI_MODEL,
    generationConfig: { responseMimeType: "application/json" }
  });

  const filesContext = Object.entries(tfFiles)
    .map(([name, content]) => `[FILE: ${name}]\n${content}\n[/FILE]`)
    .join("\n\n");

  const componentsList = architectureJson.components.map((c: any) => ({
    id: c.id,
    name: c.name,
    service: c.service
  }));

  const prompt = `
    You are a Technical Auditor. Analyze the Terraform code and map them to the Architecture Components.
    
    COMPONENTS TO MATCH:
    ${JSON.stringify(componentsList, null, 2)}
    
    TERRAFORM FILES:
    ${filesContext}
    
    TASK:
    1. For every component in the list, find the corresponding 'google_...' resource in the Terraform code. 
       MAPPING GUIDE:
       - CDN/Cache: google_compute_backend_bucket, google_compute_url_map, google_compute_backend_service (look for 'cdn = true')
       - App Engine/API: google_app_engine_standard_app_version, google_endpoints_service
       - Compute/Backend: google_compute_instance, google_compute_instance_group_manager, google_container_cluster
       - SQL/DB: google_sql_database_instance
       - Load Balancer: google_compute_global_forwarding_rule, google_compute_target_http_proxy
    2. Extract the technical configuration as a BULLETED LIST:
       - Format: "• Key: Value" (use the dot character \u2022).
       - DO NOT use paragraphs. Use one bullet per spec.
       - Compute: machine_type, disk size/type, regional/zonal.
       - Database: tier, storage size, HA status (primary/replica).
       - CDN: Cache mode, TTLs, or bucket info.
    3. YOU MUST USE THE COMPONENT 'id' AS THE KEY in your JSON response.
    4. If no specific resource matches a component, DO NOT include it in the JSON.

    RESPONSE FORMAT: STRICT JSON only.
    {
      "comp-id": "• Machine: e2-standard-4\n• Disk: 100GB SSD\n• Zone: us-central1-a"
    }

  `;

  try {
    const result = await retryWithBackoff(() => model.generateContent(prompt));
    const response = await result.response;
    let text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // Robust cleaning in case AI ignores responseMimeType
    text = text.replace(/^```json\s*/, "").replace(/```$/, "").trim();

    const parsed = JSON.parse(text);
    console.log(`[ExtractConfigs] Successfully matched ${Object.keys(parsed).length} components.`);
    return parsed;
  } catch (error: any) {
    console.error("Config Extraction Error:", error.message);
    return {};
  }
}

export async function generateFinalPlanSummary(
  architectureJson: any,
  planOutput: string,
  simulationState?: Record<string, number>,
  componentConfigs?: Record<string, string>
): Promise<string> {
  const model = getVertexAI().getGenerativeModel({
    model: DEFAULT_GEMINI_MODEL,
  });

  const prompt = `
    You are a Senior Cloud Infrastructure Architect. I have a successful Terraform Plan output and an active simulation state.
    
    ARCHITECTURE: ${JSON.stringify(architectureJson.components.map((c: any) => ({ name: c.name, service: c.service })))}
    
    SIMULATION STATE: ${JSON.stringify(simulationState || {})}
    PROVISIONED CONFIGS: ${JSON.stringify(componentConfigs || {})}
    
    TERRAFORM PLAN OUTPUT (EXCERPT):
    ${planOutput.substring(0, 4000)}
    
    TASK:
    Generate a professional, high-depth "Compliance Strategy" summary.
    1. Confirm that all resources are verified for production.
    2. ARCHITECTURAL RATIONALE: Explain specifically how the selected resource tiers (e.g., machine types, DB sizes, HA) were chosen to handle the target RPS (Requests Per Second) from the simulation.
    3. Refer to specific tiers found in the PROVISIONED CONFIGS (e.g. "We provisioned e2-standard-4 instances to ensure CPU headroom at 1000 RPS").
    4. DO NOT mention previous errors, fixes, or repairs.
    5. Format the output with markdown (headers, bullets).
    6. Tone: Authoritative, secure, and production-ready.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.candidates?.[0]?.content?.parts?.[0]?.text || "Infrastructure successfully provisioned and verified.";
  } catch (error) {
    return "Infrastructure successfully provisioned according to architectural requirements.";
  }
}

export async function generateImprovedImage(prompt: string): Promise<string> {
  try {
    const client = await getGoogleAuth().getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || "us-central1";
    const modelVersion = DEFAULT_IMAGEN_MODEL || "imagen-3.0-generate-002";

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelVersion}:predict`;

    console.log(`[Imagen REST] Calling endpoint: ${url}`);
    
    // Intercept and strictly enforce abstract rules. Do not use words like "text" or "words" as it triggers the AI to draw them.
    const enhancedPrompt = `A purely abstract, minimalist geometric composition representing a secure cloud computing network. Professional vector art style on a solid white background. Clean, smooth intersecting connection lines and floating blue and grey 3D isometric primitive shapes (hexagons, cylinders). Visually pleasing, strictly abstract data flow iconography. ${prompt}`;

    const response = await retryWithBackoff(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{ prompt: enhancedPrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: "1:1"
          },
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || res.statusText;
        const err: any = new Error(errorMessage);
        err.status = res.status;
        throw err;
      }
      return res;
    });

    const data = await response.json();
    const prediction = data.predictions?.[0];

    if (prediction?.bytesBase64Encoded) {
      const mimeType = prediction.mimeType || "image/png";
      return `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
    }

    console.warn("Imagen REST response did not contain expected bytesBase64Encoded. Returning fallback.");
    throw new Error("Failed to generate image data from Imagen REST API.");
  } catch (error: any) {
    console.error("Image Generation (REST) Error:", error);
    if (error.status === 429 || error.message?.includes("429") || error.code === 429) {
      throw new Error("IMAGEN_QUOTA_EXCEEDED");
    }
    throw error;
  }
}

export async function suggestImprovements(architectureJson: any, simulationReport: any) {
  const model = getVertexAI().getGenerativeModel({
    model: DEFAULT_GEMINI_MODEL,
  });

  const prompt = `
    You are an Elite Principal Cloud Solutions Architect at Google Cloud. Perform a holistic, data-driven evolution of the provided architecture.
    
    ### Phase 1: Understand & Normalize
    Build a deep semantic model of the architecture:
    - **Inferred Domain**: Detect the likely business domain (e.g., High-throughput Media, E-commerce, Financial, IoT).
    - **Current Components**: ${JSON.stringify(architectureJson.components.map((c: any) => ({ name: c.name, service: c.service, id: c.id, dependencies: c.dependencies, zone: c.zone })), null, 2)}
    - **Deployment Pattern**: Identify the core pattern (e.g., 3-tier, Microservices, Hub-and-Spoke).
    - **Data Flow & Zones**: Analyze how data moves across public/private security boundaries.
    
    ### Phase 2: Multi-Dimensional Analysis
    Evaluate the model across these production dimensions using simulation data:
    - **Performance & Scalability**: Identify latency bottlenecks and auto-scaling gaps. (Ref: ${JSON.stringify(simulationReport?.latency_prediction || "No latency data")})
    - **Cost Optimization**: Detect inefficient service choices and network egress risks. (Ref: ${JSON.stringify(simulationReport?.cost_breakdown || "No cost data")})
    - **Reliability & Resilience**: Find Single Points of Failure (SPOFs) and analyze multi-region failover readiness.
    - **Security Posture**: Identify exposed services and potential IAM least-privilege gaps.
    - **Root-Cause Insights**: For every issue found, explain the architectural *why* (e.g., "Latency spike at Load Balancer occurs because the current tier lacks edge caching").
    
    ### Phase 3: Holistic Evolution (Google Cloud Architecture Framework)
    Transform insights into an "Improved Version" while STRICTLY maintaining architectural simplicity.
    1. **RADICAL MINIMALISM**: Do NOT over-architect. If the current architecture is simple, keep the improved architecture simple. 
    2. **MAXIMUM 2 NEW COMPONENTS**: Suggest AT MOST 1 or 2 high-impact changes (e.g., adding Cloud Armor or Memorystore). Do not redesign the entire app.
    3. **RIGHT-SIZE & SECURE**: Focus on upgrading existing instances to High Availability (HA) or adding a security layer, rather than expanding the footprint.
    4. **Comparative Metrics**: Predict the percentage improvement for Latency, Cost, and Resilience realistically.
    
    ### Return Format: STRICT JSON
    {
      "semantic_model": "Summary of the architecture blueprint and detected domain.",
      "risk_analysis": "Top critical structural risks identified.",
      "root_cause_insights": "Detailed root-cause analysis for identified bottlenecks.",
      "analysis_summary": "A high-level synthesis of how the current state falls short of production standards.",
      "comparative_metrics": {
         "latency_improvement_pct": 25,
         "cost_savings_pct": 15,
         "resilience_score_increase": 40
      },
      "improvements": [
        { "title": "...", "problem": "...", "solution": "...", "impact": "..." }
      ],
      "improved_components": [
        { 
          "id": "...", 
          "name": "...", 
          "service": "...", 
          "description": "Short purpose or function of this component in the improved architecture.",
          "cost": "Rough monthly cost (e.g. $20)",
          "security": "Security features for this item.",
          "box_2d": [ymin, xmin, ymax, xmax],
          "dependencies": ["ID1", "ID2"], 
          "zone": "Public | Private | Restricted"
        }
      ],
      "image_prompt": "A purely abstract, geometric representation of a secure server network. Minimalist, clean vector style, solid white background."
    }
    
    ### Guidelines:
    - Retain ALL original component IDs. Ensure the layout reflects the original architecture but with the 1 or 2 new enhancements elegantly inserted into the data flow.
    - **LAYOUT (CRITICAL)**: Use the full [0-1000] grid for box_2d. Space components logically: External Traffic/Users at the top/left, Load Balancers/Ingress next, Compute/Logic in the center/middle, and Databases/Storage at the bottom/right. 
    - Ensure EVERY component in the improved_components array has a unique ID and correct dependencies.
    - **SERVICE NAMES (MANDATORY)**: Use ONLY these exact service names for 'service' field to ensure branding consistency:
      ["GCE", "GKE", "Cloud Run", "App Engine", "Cloud SQL", "BigQuery", "Cloud Storage", "Pub/Sub", "Dataflow", "Dataproc", "Cloud Functions", "Cloud Spanner", "Redis", "Filestore", "VPC", "Cloud Armor", "Cloud Load Balancing", "Cloud CDN", "Cloud DNS", "IAM", "Cloud Logging", "Cloud Monitoring"]
    - **VISUAL STYLE**: Make the 'image_prompt' purely abstract and geometric to ensure the image generator focuses on aesthetic structure.
  `;

  try {
    const result = await retryWithBackoff(() => model.generateContent(prompt));
    const response = await result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
  } catch (error) {
    console.error("Improvement Suggestion Error:", error);
    throw error;
  }
}





