import { NextRequest, NextResponse } from "next/server";
import { simulateWorkload } from "@/lib/gemini";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { architectureJson, simulationState, scenarioPreset, failureSimulation, isMultiRegion, serviceConfigs, provider } = payload;

    if (!architectureJson) {
      return NextResponse.json({ detail: "Missing architecture JSON" }, { status: 400 });
    }

    const data = await simulateWorkload(architectureJson, simulationState, {
      scenarioPreset,
      failureSimulation,
      isMultiRegion,
      serviceConfigs,
      provider
    });

    const enrichedReport = {
      ...data,
      simulation_mode: serviceConfigs && serviceConfigs.length > 0 ? "manual" : "auto",
      used_configs: serviceConfigs || null
    };

    return NextResponse.json({ report: enrichedReport });
  } catch (error: any) {
    console.error("Simulation API Error:", error);
    return NextResponse.json(
      { detail: `Simulation failed: ${error.message}` },
      { status: 500 }
    );
  }
}
