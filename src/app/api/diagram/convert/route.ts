import { NextRequest, NextResponse } from "next/server";
import { VertexAI } from "@google-cloud/vertexai";

let _vertexInstance: VertexAI | null = null;

function getVertexAI(): VertexAI {
  if (!_vertexInstance) {
    let credentials;
    if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
      try {
        const parsed = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
        credentials = {
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, '\n'),
        };
      } catch (error: any) {
        throw new Error(`Invalid GCP_SERVICE_ACCOUNT_KEY: ${error.message}`);
      }
    }
    const settings: any = {
      project: process.env.GCP_PROJECT_ID || "build-time-fallback-project",
      location: process.env.GCP_LOCATION || "us-central1",
    };
    if (credentials) settings.googleAuthOptions = { credentials };
    _vertexInstance = new VertexAI(settings);
  }
  return _vertexInstance;
}

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const PROVIDER_SHAPES: Record<string, Record<string, { style: string; w: number; h: number; label: string }>> = {
  AWS: {
    users:         { label: 'Users',         w: 78, h: 78, style: 'shape=mxgraph.aws4.users;fillColor=#232F3E;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    ec2:           { label: 'EC2',           w: 78, h: 78, style: 'shape=mxgraph.aws4.ec2;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    auto_scaling:  { label: 'Auto Scaling',  w: 78, h: 78, style: 'shape=mxgraph.aws4.autoscaling;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    lambda:        { label: 'Lambda',        w: 78, h: 78, style: 'shape=mxgraph.aws4.lambda_function;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    ecs:           { label: 'ECS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.ecs;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    eks:           { label: 'EKS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.eks;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    fargate:       { label: 'Fargate',       w: 78, h: 78, style: 'shape=mxgraph.aws4.fargate;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    route53:       { label: 'Route 53',      w: 78, h: 78, style: 'shape=mxgraph.aws4.route_53;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloudfront:    { label: 'CloudFront',    w: 78, h: 78, style: 'shape=mxgraph.aws4.cloudfront;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    alb:           { label: 'App Ldr Balancer', w: 78, h: 78, style: 'shape=mxgraph.aws4.application_load_balancer;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    elb:           { label: 'Load Balancer', w: 78, h: 78, style: 'shape=mxgraph.aws4.traditional_server;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    api_gateway:   { label: 'API Gateway',   w: 78, h: 78, style: 'shape=mxgraph.aws4.api_gateway;fillColor=#E7157B;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    vpc:           { label: 'VPC',           w: 78, h: 78, style: 'shape=mxgraph.aws4.vpc;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    s3:            { label: 'S3',            w: 78, h: 78, style: 'shape=mxgraph.aws4.s3;fillColor=#3F8624;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    efs:           { label: 'EFS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.efs;fillColor=#3F8624;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    rds:           { label: 'RDS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.rds;fillColor=#C925D1;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    dynamodb:      { label: 'DynamoDB',      w: 78, h: 78, style: 'shape=mxgraph.aws4.dynamodb;fillColor=#C925D1;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    aurora:        { label: 'Aurora',        w: 78, h: 78, style: 'shape=mxgraph.aws4.aurora;fillColor=#C925D1;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    elasticache:   { label: 'ElastiCache',   w: 78, h: 78, style: 'shape=mxgraph.aws4.elasticache;fillColor=#C925D1;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    sqs:           { label: 'SQS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.sqs;fillColor=#E7157B;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    sns:           { label: 'SNS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.sns;fillColor=#E7157B;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    eventbridge:   { label: 'EventBridge',   w: 78, h: 78, style: 'shape=mxgraph.aws4.eventbridge;fillColor=#E7157B;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cognito:       { label: 'Cognito',       w: 78, h: 78, style: 'shape=mxgraph.aws4.cognito;fillColor=#DD344C;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    iam:           { label: 'IAM',           w: 78, h: 78, style: 'shape=mxgraph.aws4.role;fillColor=#DD344C;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    waf:           { label: 'WAF',           w: 78, h: 78, style: 'shape=mxgraph.aws4.waf;fillColor=#DD344C;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloudwatch:    { label: 'CloudWatch',    w: 78, h: 78, style: 'shape=mxgraph.aws4.cloudwatch;fillColor=#E7157B;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
  },
  GCP: {
    users:            { label: 'Users',            w: 78, h: 78, style: 'shape=mxgraph.gcp2.google_my_business;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    compute_engine:   { label: 'Compute Engine',   w: 78, h: 78, style: 'shape=mxgraph.gcp2.compute_engine;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloud_run:        { label: 'Cloud Run',        w: 78, h: 78, style: 'shape=mxgraph.gcp2.cloud_run;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloud_functions:  { label: 'Cloud Functions',  w: 78, h: 78, style: 'shape=mxgraph.gcp2.cloud_functions;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    gke:              { label: 'GKE',              w: 78, h: 78, style: 'shape=mxgraph.gcp2.google_kubernetes_engine;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloud_sql:        { label: 'Cloud SQL',        w: 78, h: 78, style: 'shape=mxgraph.gcp2.cloud_sql;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloud_storage:    { label: 'Cloud Storage',    w: 78, h: 78, style: 'shape=mxgraph.gcp2.cloud_storage;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloud_lb:         { label: 'Cloud Load Bal.',  w: 78, h: 78, style: 'shape=mxgraph.gcp2.cloud_load_balancing;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloud_cdn:        { label: 'Cloud CDN',        w: 78, h: 78, style: 'shape=mxgraph.gcp2.cloud_cdn;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloud_pubsub:     { label: 'Pub/Sub',          w: 78, h: 78, style: 'shape=mxgraph.gcp2.cloud_pubsub;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloud_memorystore:{ label: 'Memorystore',      w: 78, h: 78, style: 'shape=mxgraph.gcp2.cloud_memorystore;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloud_dns:        { label: 'Cloud DNS',        w: 78, h: 78, style: 'shape=mxgraph.gcp2.cloud_dns;fillColor=#4285F4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
  },
  Azure: {
    users:             { label: 'Users',            w: 78, h: 78, style: 'shape=mxgraph.azure.user;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    virtual_machine:   { label: 'Virtual Machine',  w: 78, h: 78, style: 'shape=mxgraph.azure.virtual_machine;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    app_service:       { label: 'App Service',      w: 78, h: 78, style: 'shape=mxgraph.azure.app_service;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    functions:         { label: 'Functions',        w: 78, h: 78, style: 'shape=mxgraph.azure.azure_functions;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    kubernetes:        { label: 'AKS',              w: 78, h: 78, style: 'shape=mxgraph.azure.kubernetes_services;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    sql_database:      { label: 'SQL Database',     w: 78, h: 78, style: 'shape=mxgraph.azure.sql_database_sql_azure;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cosmos_db:         { label: 'Cosmos DB',        w: 78, h: 78, style: 'shape=mxgraph.azure.cosmosdb;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    redis:             { label: 'Redis Cache',      w: 78, h: 78, style: 'shape=mxgraph.azure.cache_redis;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    storage:           { label: 'Blob Storage',     w: 78, h: 78, style: 'shape=mxgraph.azure.storage;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    load_balancer:     { label: 'Load Balancer',    w: 78, h: 78, style: 'shape=mxgraph.azure.azure_load_balancer;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    api_management:    { label: 'API Management',   w: 78, h: 78, style: 'shape=mxgraph.azure.api_management;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cdn:               { label: 'CDN',              w: 78, h: 78, style: 'shape=mxgraph.azure.content_delivery_network;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    service_bus:       { label: 'Service Bus',      w: 78, h: 78, style: 'shape=mxgraph.azure.service_bus;fillColor=#0078D4;strokeColor=none;fontColor=#1a1a1a;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
  },
  Generic: {
    mobile:      { label: 'Mobile Client', w: 45, h: 70, style: 'shape=mxgraph.ios7.icons.smartphone;fillColor=#ffffff;strokeColor=#1a1a1a;strokeWidth=2;fontColor=#1a1a1a;verticalLabelPosition=bottom;verticalAlign=top;align=center;' },
    web:         { label: 'Web Browser',   w: 78, h: 55, style: 'shape=mxgraph.ios7.icons.globe;fillColor=#ffffff;strokeColor=#1a1a1a;strokeWidth=2;fontColor=#1a1a1a;verticalLabelPosition=bottom;verticalAlign=top;align=center;' },
    database:    { label: 'Database',      w: 60, h: 70, style: 'shape=mxgraph.flowchart.database;fillColor=#ffffff;strokeColor=#1a1a1a;strokeWidth=2;fontColor=#1a1a1a;verticalLabelPosition=bottom;verticalAlign=top;align=center;' },
    server:      { label: 'Server',        w: 60, h: 70, style: 'shape=mxgraph.rack.general.server_2u;fillColor=#ffffff;strokeColor=#1a1a1a;strokeWidth=2;fontColor=#1a1a1a;verticalLabelPosition=bottom;verticalAlign=top;align=center;' },
    users:       { label: 'Users',         w: 60, h: 60, style: 'shape=mxgraph.ios7.icons.user;fillColor=#ffffff;strokeColor=#1a1a1a;strokeWidth=2;fontColor=#1a1a1a;verticalLabelPosition=bottom;verticalAlign=top;align=center;' },
    boundary:    { label: '',              w: 400,h: 400, style: 'rounded=1;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#666666;strokeWidth=2;dashed=1;dashPattern=8 4;fontSize=16;fontColor=#333333;fontStyle=1;verticalAlign=top;spacingTop=12;spacingLeft=12;align=left;container=1;collapsible=0;' },
  }
};

const PROVIDER_FULL_NAMES: Record<string, string> = {
  AWS: 'Amazon Web Services',
  GCP: 'Google Cloud Platform',
  Azure: 'Microsoft Azure'
};

const EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#555555;strokeWidth=2;fontColor=#333333;fontSize=10;';

function buildShapeReference(provider: string): string {
  const shapes = PROVIDER_SHAPES[provider] || PROVIDER_SHAPES.AWS;
  const genericShapes = PROVIDER_SHAPES.Generic;
  
  const providerStr = Object.entries(shapes)
    .map(([key, s]) => `  key="${key}" → label: "${s.label}", width=${s.w}, height=${s.h}\n    style: ${s.style}`)
    .join('\n\n');
    
  const genericStr = Object.entries(genericShapes)
    .map(([key, s]) => `  key="generic_${key}" → label: "${s.label}", width=${s.w}, height=${s.h}\n    style: ${s.style}`)
    .join('\n\n');
    
  return `=== ${provider} SHAPES ===\n${providerStr}\n\n=== GENERIC SHAPES ===\n${genericStr}`;
}

export async function POST(request: NextRequest) {
  try {
    const { targetProvider, sourceXml, architectureJson } = await request.json();

    if (!targetProvider) {
      return NextResponse.json({ error: "targetProvider is required" }, { status: 400 });
    }

    if (!sourceXml && !architectureJson) {
      return NextResponse.json({ error: "Either sourceXml or architectureJson is required" }, { status: 400 });
    }

    const shapeRef = buildShapeReference(targetProvider);

    const model = getVertexAI().getGenerativeModel({
      model: DEFAULT_GEMINI_MODEL,
      generationConfig: {
        maxOutputTokens: 16384,
        temperature: 0.1,
      },
    });

    let prompt_text = "";

    if (sourceXml) {
       prompt_text = `You are an expert cloud architect. You have been given a draw.io XML diagram from a source cloud provider.
       Your task is to convert this XML into the target provider: ${targetProvider}.
       
       Here is the source XML:
       \`\`\`xml
       ${sourceXml}
       \`\`\`

       === REPLACEMENT INSTRUCTIONS ===
       1. Keep the EXACT identical <mxGeometry> (x, y, width, height) and identical dependencies/edges for every shape so the layout doesn't break.
       2. Keep the EXACT SAME edge connections and styles.
       3. TRANSLATE terminology: Replace the <mxCell> style string AND the value (label).
          - Map the original service to its best equivalent in ${targetProvider} (e.g., if target is AWS, 'App Engine' label must become 'AWS Lambda').
          - Specifically, if you find a boundary box labeled 'Google Cloud Platform' (or Azure/AWS), translate that label to '${PROVIDER_FULL_NAMES[targetProvider]}'.
       4. Use the following SHAPE REFERENCE for ${targetProvider} exclusively (DO NOT invent shapes):
       ${shapeRef}
       
       OUTPUT: Return ONLY raw XML starting <mxGraphModel> ending </mxGraphModel>. No markdown, no backticks.`;
    } else if (architectureJson) {
       prompt_text = `You are an expert cloud architect generating professional draw.io architecture diagrams.
       You have been provided with an architecture JSON payload from an analyzed image. 
       Your task is to mathematically reconstruct this layout as a Draw.io XML using ${targetProvider} shapes.
       
       Here is the Architecture JSON:
       \`\`\`json
       ${JSON.stringify(architectureJson.components, null, 2)}
       \`\`\`
       
       === SERVICE TRANSLATION GUIDE (Source -> ${targetProvider}) ===
       - "Google Cloud Platform" / "Microsoft Azure" → "${PROVIDER_FULL_NAMES[targetProvider] || targetProvider}"
       - "Cloud SQL" / "SQL Database" → "${targetProvider === 'AWS' ? 'Amazon RDS' : targetProvider === 'Azure' ? 'Azure SQL' : 'Cloud SQL'}"
       - "Compute Engine" / "Virtual Machine" → "${targetProvider === 'AWS' ? 'EC2' : targetProvider === 'Azure' ? 'Virtual Machine' : 'Compute Engine'}"
       - "Instance Group" / "Auto Scaling Group" → "${targetProvider === 'AWS' ? 'Auto Scaling Group' : targetProvider === 'Azure' ? 'VM Scale Set' : 'Managed Instance Group'}"
       - "Cloud Load Balancing" / "Application Gateway" → "${targetProvider === 'AWS' ? 'App Ldr Balancer' : targetProvider === 'Azure' ? 'Load Balancer' : 'Cloud Load Bal.'}"
       - "Cloud Storage" / "Blob Storage" → "${targetProvider === 'AWS' ? 'S3' : targetProvider === 'Azure' ? 'Blob Storage' : 'Cloud Storage'}"
       - "Zone" / "Region" → "Availability Zone / Region" (Use ${targetProvider} terminology)
       
       === SHAPE REFERENCE (use the EXACT style string) ===
       ${shapeRef}
       
       EDGE STYLE (use this for dependencies):
       ${EDGE_STYLE}
       
       === INSTRUCTIONS ===
       1. Reconstruct every component in the JSON.
       2. Map its "service" or "service_type" to the MOST APPROPRIATE shape in the ${targetProvider} SHAPES or GENERIC SHAPES.
          - CRITICAL: All labels (value) MUST be translated to ${targetProvider} equivalents as per the guide.
          - If the component is a cloud service icon, use its specific shape style.
          - If the component has "is_boundary": true, use the "generic_boundary" shape.
       3. GEOMETRY & LAYOUT (FLAT CANVAS):
          - Canvas Size: 1000 x 1000 pixels.
          - box_2d coordinate format is [ymin, xmin, ymax, xmax] (0 to 1000 scale).
          - Calculate: x = xmin, y = ymin, width = xmax - xmin, height = ymax - ymin.
          - CRITICAL: Use parent="1" for EVERY component and edge. Do NOT use nested parenthood. This ensures absolute coordinate stability.
          - Ensure boundary boxes (like VPCs/AZs) are rendered FIRST. (In XML, components appearing earlier in <root> are rendered lower).
          - AVOID OVERLAPPING boundary boxes unless one specifically contains the other.
       4. CONNECTIONS: Use the EDGE STYLE. Set "source" and "target" to the source_id and target_id.
       
       === STRICT XML RULES ===
       1. MUST include standard root:
          <root>
            <mxCell id="0"/>
            <mxCell id="1" parent="0"/>
            ... components ...
          </root>
       2. Give every component and edge a unique ID (e.g., "node_2", "edge_3").
       3. NEVER use id="0" or id="1" for your components.
       4. Return ONLY the raw XML starting with <mxGraphModel> and ending with </mxGraphModel>. No markdown fences!`;
    }

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: prompt_text }],
      }],
    });

    let xml = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    xml = xml.replace(/^```(?:xml)?\s*/i, "").replace(/\s*```$/i, "").trim();

    if (!xml.startsWith('<mxGraphModel')) {
      const match = xml.match(/<mxGraphModel[\s\S]*<\/mxGraphModel>/);
      if (match) {
        xml = match[0];
      } else {
        throw new Error("AI did not return valid draw.io XML");
      }
    }

    return NextResponse.json({ xml });
  } catch (error: any) {
    console.error("Diagram convert error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to convert diagram" },
      { status: 500 }
    );
  }
}
