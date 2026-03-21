import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const { files, architectureJson } = await req.body ? await req.json() : {};

    if (!files || !architectureJson) {
      return NextResponse.json({ error: "Missing required data" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const prompt = `
      You are an expert Cloud Architect. I have a set of Terraform files that have been manually edited by a user.
      I need you to look at these files and the original architecture JSON, and extract the specific HCL configuration blocks that correspond to each architectural component.

      ### Architecture Components:
      ${JSON.stringify(architectureJson.components.map((c: any) => ({ id: c.id, name: c.name, service: c.service })), null, 2)}

      ### Terraform Files:
      ${Object.entries(files).map(([name, content]) => `--- FILE: ${name} ---\n${content}\n`).join("\n")}

      ### Instructions:
      1. For each component listed in the architecture, find the most relevant resource blocks, modules, or variable definitions in the Terraform code.
      2. Return a JSON object where keys are the Component IDs and values are the corresponding HCL code blocks.
      3. If a component is spread across multiple blocks (e.g., a compute instance and its disk), include both in the value.
      4. Ensure the output is valid JSON.

      Example output:
      {
        "comp-1": "resource \\"google_compute_instance\\" \\"app\\" { ... }",
        "comp-2": "resource \\"google_sql_database_instance\\" \\"db\\" { ... }"
      }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Failed to parse AI response as JSON");
    }

    const componentConfigs = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ componentConfigs });
  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
