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

/**
 * IMPORTANT DESIGN DECISION:
 * The editor defaults to LIGHT theme (white background).
 * All generated XML must use DARK text (#1a1a1a or similar) so labels are visible.
 * Edges use dark gray (#555555) strokes — visible on white canvas.
 * Container groups use a light tinted fill with a colored border.
 *
 * The cloud icons are outline/color shapes — they show their own color correctly.
 * We only control fontColor and strokeColor on edges/labels.
 */

// Complete, production-ready shape styles for draw.io (light background)
// Keys are service names the AI will use. Values are the EXACT style strings.
const PROVIDER_SHAPES: Record<string, Record<string, { style: string; w: number; h: number; label: string }>> = {
  AWS: {
    // Compute
    users:         { label: 'Users',         w: 78, h: 78, style: 'shape=mxgraph.aws4.users;fillColor=#232F3E;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    ec2:           { label: 'EC2',           w: 78, h: 78, style: 'shape=mxgraph.aws4.ec2;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    auto_scaling:  { label: 'Auto Scaling',  w: 78, h: 78, style: 'shape=mxgraph.aws4.autoscaling;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    lambda:        { label: 'Lambda',        w: 78, h: 78, style: 'shape=mxgraph.aws4.lambda_function;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    ecs:           { label: 'ECS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.ecs;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    eks:           { label: 'EKS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.eks;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    fargate:       { label: 'Fargate',       w: 78, h: 78, style: 'shape=mxgraph.aws4.fargate;fillColor=#ED7100;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    // Networking
    route53:       { label: 'Route 53',      w: 78, h: 78, style: 'shape=mxgraph.aws4.route_53;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    cloudfront:    { label: 'CloudFront',    w: 78, h: 78, style: 'shape=mxgraph.aws4.cloudfront;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    alb:           { label: 'App Ldr Balancer', w: 78, h: 78, style: 'shape=mxgraph.aws4.application_load_balancer;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    elb:           { label: 'Load Balancer', w: 78, h: 78, style: 'shape=mxgraph.aws4.traditional_server;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    api_gateway:   { label: 'API Gateway',   w: 78, h: 78, style: 'shape=mxgraph.aws4.api_gateway;fillColor=#E7157B;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    vpc:           { label: 'VPC',           w: 78, h: 78, style: 'shape=mxgraph.aws4.vpc;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    // Storage
    s3:            { label: 'S3',            w: 78, h: 78, style: 'shape=mxgraph.aws4.s3;fillColor=#3F8624;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    efs:           { label: 'EFS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.efs;fillColor=#3F8624;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    // Database
    rds:           { label: 'RDS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.rds;fillColor=#C925D1;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    dynamodb:      { label: 'DynamoDB',      w: 78, h: 78, style: 'shape=mxgraph.aws4.dynamodb;fillColor=#C925D1;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    aurora:        { label: 'Aurora',        w: 78, h: 78, style: 'shape=mxgraph.aws4.aurora;fillColor=#C925D1;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    elasticache:   { label: 'ElastiCache',   w: 78, h: 78, style: 'shape=mxgraph.aws4.elasticache;fillColor=#C925D1;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    // Messaging
    sqs:           { label: 'SQS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.sqs;fillColor=#E7157B;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    sns:           { label: 'SNS',           w: 78, h: 78, style: 'shape=mxgraph.aws4.sns;fillColor=#E7157B;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    eventbridge:   { label: 'EventBridge',   w: 78, h: 78, style: 'shape=mxgraph.aws4.eventbridge;fillColor=#E7157B;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    // Security
    cognito:       { label: 'Cognito',       w: 78, h: 78, style: 'shape=mxgraph.aws4.cognito;fillColor=#DD344C;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    iam:           { label: 'IAM',           w: 78, h: 78, style: 'shape=mxgraph.aws4.role;fillColor=#DD344C;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    waf:           { label: 'WAF',           w: 78, h: 78, style: 'shape=mxgraph.aws4.waf;fillColor=#DD344C;strokeColor=none;fontColor=#232F3E;fontSize=11;fontStyle=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;' },
    // Monitor
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
};

// Edge style — dark stroke so visible on white/light canvas
const EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#555555;strokeWidth=2;fontColor=#333333;fontSize=10;';

// Container/group style for VPC, Subnet, etc — light tinted background with colored border
const CONTAINER_STYLE = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;strokeWidth=2;dashed=1;dashPattern=8 4;fontSize=13;fontColor=#333333;fontStyle=1;verticalAlign=top;spacingTop=8;arcSize=3;container=1;collapsible=0;';

function buildShapeReference(provider: string): string {
  const shapes = PROVIDER_SHAPES[provider] || PROVIDER_SHAPES.AWS;
  return Object.entries(shapes)
    .map(([key, s]) => `  key="${key}" → label: "${s.label}", width=${s.w}, height=${s.h}\n    style: ${s.style}`)
    .join('\n\n');
}

function buildExample(provider: string): string {
  const shapes = PROVIDER_SHAPES[provider] || PROVIDER_SHAPES.AWS;
  const entries = Object.values(shapes);
  const s0 = entries[0]; // users
  const s1 = entries[9] || entries[1]; // load balancer typically
  const s2 = entries[2]; // compute

  return `<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- User icon -->
    <mxCell id="2" value="${s0.label}" style="${s0.style}" vertex="1" parent="1">
      <mxGeometry x="361" y="40" width="${s0.w}" height="${s0.h}" as="geometry"/>
    </mxCell>
    <!-- Container group example -->
    <mxCell id="grp1" value="AWS VPC (10.0.0.0/16)" style="${CONTAINER_STYLE}" vertex="1" parent="1">
      <mxGeometry x="200" y="200" width="400" height="320" as="geometry"/>
    </mxCell>
    <!-- Load Balancer inside container -->
    <mxCell id="3" value="${s1.label}" style="${s1.style}" vertex="1" parent="grp1">
      <mxGeometry x="161" y="40" width="${s1.w}" height="${s1.h}" as="geometry"/>
    </mxCell>
    <!-- Compute inside container -->
    <mxCell id="4" value="${s2.label} 1" style="${s2.style}" vertex="1" parent="grp1">
      <mxGeometry x="80" y="190" width="${s2.w}" height="${s2.h}" as="geometry"/>
    </mxCell>
    <!-- Edge from User to Load Balancer (cross-parent: use parent="1") -->
    <mxCell id="e1" style="${EDGE_STYLE}" edge="1" source="2" target="3" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <!-- Edge inside container: parent can be "1" too (safest) -->
    <mxCell id="e2" style="${EDGE_STYLE}" edge="1" source="3" target="4" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, provider = "GCP" } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const shapeRef = buildShapeReference(provider);
    const exampleXml = buildExample(provider);

    const model = getVertexAI().getGenerativeModel({
      model: DEFAULT_GEMINI_MODEL,
      generationConfig: {
        maxOutputTokens: 16384,
        temperature: 0.1,
      },
    });

    const prompt_text = `You are an expert ${provider} cloud architect generating professional draw.io architecture diagrams.

THE CANVAS IS WHITE/LIGHT. All text must be dark and clearly visible.

SHAPE REFERENCE — Available ${provider} shapes (use the EXACT style string, do NOT modify it):
${shapeRef}

EDGE STYLE (use exactly this for ALL connections):
${EDGE_STYLE}

CONTAINER STYLE (use exactly this for VPC, Subnet, Availability Zone, Region grouping boxes):
${CONTAINER_STYLE}

=== STRICT RULES ===

1. ICON NODES must:
   - Use EXACT style strings from the shape reference above
   - Have vertex="1" and a unique numeric id starting from 2
   - Have <mxGeometry x="..." y="..." width="..." height="..." as="geometry"/>
   - Use the width/height values from the shape reference (usually 78x78)

2. CONTAINER GROUPS (VPC, Subnet, AZ, Region):
   - Use the CONTAINER_STYLE above exactly
   - Set container="1" collapsible="0"
   - Make them LARGE enough: minimum 500x400 for VPCs, 380x280 for subnets
   - Icons INSIDE a group: set parent="<group_id>"
   - Use descriptive labels like "AWS VPC (10.0.0.0/16)" or "Public Subnet (AZ-1a)"

3. EDGES:
   - Use EXACT EDGE_STYLE above
   - Always set parent="1" regardless of source/target containers (safest)
   - source and target must reference valid node IDs

4. LAYOUT — top-to-bottom flow:
   - Start with Users/Internet at y≈40
   - DNS/CDN layer at y≈160
   - Load Balancer at y≈300
   - Web/App tier within subnet containers starting at y≈400
   - Database tier at the bottom
   - Space icons 160-200px apart horizontally, 140px apart vertically WITHIN containers
   - Start containers at x≈80, y≈220 with plenty of space

5. IDs: id="0" and id="1" reserved for root. Nodes start at id="2". Containers can use id="grp1","grp2". Edges use id="e1","e2",...

6. OUTPUT: Return ONLY raw XML starting <mxGraphModel> ending </mxGraphModel>. No markdown, no backticks.

=== EXAMPLE (follow this structure exactly) ===
${exampleXml}

=== YOUR TASK ===
Generate a COMPLETE, DETAILED ${provider} architecture diagram for: ${prompt}

Include ALL relevant services. Use container groups for VPC/Subnets/AZs. Connect all services with edges. The diagram should be production-ready and comprehensive.`;

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: prompt_text }],
      }],
    });

    let xml = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Strip markdown fences if any
    xml = xml.replace(/^```(?:xml)?\s*/i, "").replace(/\s*```$/i, "").trim();

    // Extract if wrapped in explanation text
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
    console.error("Diagram generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate diagram" },
      { status: 500 }
    );
  }
}
