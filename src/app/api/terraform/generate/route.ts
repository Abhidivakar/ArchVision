import { NextRequest, NextResponse } from "next/server";

import { generateFullTerraform, fixTerraform, extractTfConfigs, generateFinalPlanSummary } from "@/lib/gemini";
import { runTerraformSandbox, cleanupSandbox } from "@/lib/terraform";


export async function POST(request: NextRequest) {
  try {
    const { architectureJson, simulationState, simulationReport, errorContext, files } = await request.json();



    if (!architectureJson) {
      return NextResponse.json({ detail: "No architecture data provided" }, { status: 400 });
    }

    let finalFiles = files || {};
    let finalSummary = "";
    let finalWarnings: string[] = [];
    let finalLastError: string | undefined = undefined;

    // Phase 1: Initial Generation or Repair
    if (errorContext && files && Object.keys(files).length > 0) {
      console.log("[TF-Route] Repair mode triggered from UI context.");
      // If we are repairing, we start the loop with the provided files
      // BUT we need an initial summary, so let's call fixTerraform once to get started
      const repairResult = await fixTerraform(architectureJson, simulationState, files, errorContext, simulationReport);
      finalFiles = repairResult.files;
      finalSummary = repairResult.summary;
    } else {
      console.log("[TF-Route] Initial generation triggered.");
      const result = await generateFullTerraform(architectureJson, simulationState || {}, simulationReport);
      finalFiles = result.files;
      finalSummary = result.summary;
    }


    // Phase 2: Internal Verification Loop (Up to 2 retries)
    let attempts = 0;
    while (attempts < 2) {
      console.log(`[TF-Verify] Attempt ${attempts + 1} starting...`);

      const verifyResult = await runTerraformSandbox(finalFiles, "plan");

      if (verifyResult.sandboxPath) {
        await cleanupSandbox(verifyResult.sandboxPath);
      }


      if (verifyResult.success) {
        console.log(`[TF-Verify] Success on attempt ${attempts + 1}`);
        // If successful, update finalFiles and finalSummary from the successful result
        // (though in this path, result.files and result.summary would already be the successful ones)
        break; // Exit loop on success
      }

      console.warn(`[TF-Verify] Failure on attempt ${attempts + 1}. Error: ${verifyResult.stderr || verifyResult.error}`);

      // If failed, try to fix
      attempts++;
      if (attempts < 2) {
        const errorMsg = verifyResult.stderr || verifyResult.error || "Unknown plan error";
        const repairResult = await fixTerraform(architectureJson, simulationState, finalFiles, errorMsg, simulationReport);
        finalFiles = repairResult.files; // Update files for next attempt
        finalSummary = repairResult.summary;
    } else {
        // Final attempt failed, capture warnings and last error
        finalWarnings.push("Internal verification failed. Please check the code for potential syntax or resource errors.");
        finalLastError = verifyResult.stderr || verifyResult.error;
        break; // Exit loop after final failed attempt
      }
    }

    // After successful generation/fix, or after exhausting retries, extract concise component configs for the UI
    const componentConfigs = await extractTfConfigs(finalFiles, architectureJson);

    // Final Synthesis: If we had a successful plan, generate a final production-ready summary
    // This ensures we don't show "Validation failed" if it was eventually fixed.
    try {
      const finalVerify = await runTerraformSandbox(finalFiles, "plan");
      if (finalVerify.success && finalVerify.stdout) {
        finalSummary = await generateFinalPlanSummary(
          architectureJson, 
          finalVerify.stdout,
          simulationState,
          componentConfigs
        );
      }

      if (finalVerify.sandboxPath) await cleanupSandbox(finalVerify.sandboxPath);
    } catch (e) {
      console.error("Final Summary Synthesis Error:", e);
    }

    return NextResponse.json({
      files: finalFiles,
      summary: finalSummary,
      componentConfigs,
      warnings: finalWarnings.length > 0 ? finalWarnings : undefined,
      lastError: finalLastError
    });
  } catch (error: any) {
    console.error("Terraform Generate API Error:", error);
    return NextResponse.json({ detail: `Terraform generation failed: ${error.message}` }, { status: 500 });
  }
}
