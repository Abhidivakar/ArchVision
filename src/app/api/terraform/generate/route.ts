import { NextRequest, NextResponse } from "next/server";

import { generateFullTerraform, fixTerraform, extractTfConfigs, generateFinalPlanSummary } from "@/lib/gemini";
import { runTerraformSandbox, cleanupSandbox, deterministicTerraformFix } from "@/lib/terraform";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { architectureJson, simulationState, simulationReport, errorContext, files, provider } = await request.json();

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
      const repairResult = await fixTerraform(architectureJson, simulationState, files, errorContext, simulationReport, provider);
      finalFiles = repairResult.files;
      finalSummary = repairResult.summary;
    } else {
      console.log("[TF-Route] Initial generation triggered.");
      const result = await generateFullTerraform(architectureJson, simulationState || {}, simulationReport, provider);
      finalFiles = result.files;
      finalSummary = result.summary;
    }


    // Phase 2: Hybrid Verification Loop (Up to 4 total iterations, max 2 LLM calls)
    let attempts = 0;
    let llmAttempts = 0;
    const MAX_ITERATIONS = 4;
    const MAX_LLM_CALLS = 2;
    while (attempts < MAX_ITERATIONS) {
      console.log(`[TF-Verify] Attempt ${attempts + 1} starting...`);

      const verifyResult = await runTerraformSandbox(finalFiles, "plan");

      if (verifyResult.sandboxPath) {
        await cleanupSandbox(verifyResult.sandboxPath);
      }

      if (verifyResult.success) {
        console.log(`[TF-Verify] Success on attempt ${attempts + 1}`);
        break;
      }

      console.warn(`[TF-Verify] Failure on attempt ${attempts + 1}. Error: ${verifyResult.stderr || verifyResult.error}`);
      attempts++;

      // Step 1: DETERMINISTIC FIX - uses exact line numbers from Terraform. No LLM cost.
      const errorMsg = verifyResult.stderr || verifyResult.error || "Unknown plan error";
      const { files: deterFiles, fixesApplied } = deterministicTerraformFix(finalFiles, errorMsg);
      if (fixesApplied.length > 0) {
        console.log(`[DeterministicFix] Applied ${fixesApplied.length} fix(es): ${fixesApplied.join(" | ")}`);
        finalFiles = deterFiles;
        // Immediately continue to re-verify the patched files without an LLM call
        continue;
      }

      // Step 2: LLM FIX - for complex/semantic errors the deterministic layer can't handle
      if (llmAttempts < MAX_LLM_CALLS) {
        llmAttempts++;
        console.log(`[TF-Verify] No deterministic fix available. Calling LLM (attempt ${llmAttempts}/${MAX_LLM_CALLS})...`);
        const repairResult = await fixTerraform(architectureJson, simulationState, finalFiles, errorMsg, simulationReport, provider);
        finalFiles = repairResult.files;
        finalSummary = repairResult.summary;
      } else {
        // Exhausted all LLM calls
        console.warn(`[TF-Verify] Exhausted all LLM repair attempts. Returning best-effort code.`);
        finalWarnings.push("Internal verification failed after maximum repair attempts. Please review the code manually.");
        finalLastError = errorMsg;
        break;
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
