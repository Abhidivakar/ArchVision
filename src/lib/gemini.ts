import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const INTERACTIVE_PROMPT = `
You are an expert Cloud Architect. Analyze this architecture diagram.
Extract the architecture details into a STRICT JSON payload.

Your task is to locate EVERY single GCP service icon with PIXEL-PERFECT ACCURACY.

GROUNDING RULES (MANDATORY):
- Use your native [ymin, xmin, ymax, xmax] spatial grounding scale [0-1000].
- 0 is the ABSOLUTE LEFT EDGE of the image file.
- 1000 is the ABSOLUTE RIGHT EDGE of the image file.
- The [ymin, xmin, ymax, xmax] box must surround ONLY the square/rectangular icon of the resource.
- DO NOT include labels or text in the boxes.
- CALIBRATION: If there is white space on the left, account for it. 0 is the start of the white space, not the start of the icons.

Structure:
{
  "cost_estimate": "Concise monthly cost range (e.g., '$150 - $250')",
  "cost_details": "Paragraph explaining the main cost drivers.",
  "security_score": 85,
  "security_summary": "A 2-3 sentence summary of the security posture.",
  "terraform_skeleton": "Valid HCL code for the main resources.",
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
      "service_type": "GCP icon type",
      "description": "Short purpose or function of this component.",
      "cost": "Rough cost estimate for this specific item (e.g. $20)",
      "security": "Security capabilities or requirements for this item.",
      "box_2d": [ymin, xmin, ymax, xmax]
    }
  ]
}

CRITICAL: The 'simulation_parameters' array should contain 3 to 5 relevant metrics that would stress-test THIS specific architecture (e.g., Active Users, Database Queries/sec, Payload Size(MB), Data Ingestion Rate).
`;

export async function analyzeArchitecture(imageBuffer: Buffer, mimeType: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent([
    INTERACTIVE_PROMPT,
    {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType,
      },
    },
  ]);

  const response = await result.response;
  let text = response.text();

  // Clean up potential markdown formatting
  text = text.replace(/^```json\s*/, "").replace(/```$/, "").trim();

  return JSON.parse(text);
}

export async function simulateWorkload(architectureJson: any, simulationState: any, options: {
  scenarioPreset?: string,
  failureSimulation?: string[],
  isMultiRegion?: boolean
}) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

  const prompt = `
You are an expert Site Reliability Engineer and Cloud Architect.

Here is an architecture composed of the following services:
${archServices.join(", ")}

The user is running a traffic simulation with the following workload parameters:
${stateStr}

ADVANCED CONFIGURATION:
${contextStr}

Analyze the Infrastructure Impact of this specific workload and configuration on this architecture.
Return a STRICT JSON response exactly matching this structure (fill in the data realistically based on the provided workload):

{
  "impact_summary": "A high-level 2-3 sentence summary of how the architecture handles this load.",
  "bottlenecks": [
    "A specific bottleneck or point of failure (e.g., 'Cloud SQL read replica might lag behind primary due to high write volume.')"
  ],
  "bottleneck_components": [
    "component-slug-id"  // IDs of components that are stressed (must map to actual components in the architecture)
  ],
  "cost_impact": "Explain how this workload affects the monthly bill (e.g., 'Expect a 3x increase in network egress costs.')",
  "scaling_suggestions": [
    "A concrete actionable step to handle this load (e.g., 'Increase the max instances of the App Engine frontend from 10 to 50.')"
  ],
  "scaling_result": [
    { "service": "App Engine", "previous_instances": 4, "new_instances": 18 }
  ],
  "latency_prediction": [
    { "tier": "Frontend", "latency_ms": 120 },
    { "tier": "Database", "latency_ms": 70 }
  ],
  "cost_breakdown": [
    { "service": "Compute Engine", "monthly_cost": 2800 },
    { "service": "Network Egress", "monthly_cost": 3200 }
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
  ]
}
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  let text = response.text();

  text = text.replace(/^```json\s*/, "").replace(/```$/, "").trim();

  return JSON.parse(text);
}
