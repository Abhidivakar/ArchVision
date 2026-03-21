import { NextRequest, NextResponse } from "next/server";
import { runTerraformSandbox, cleanupSandbox } from "@/lib/terraform";

export async function POST(request: NextRequest) {
  try {
    const { files, command } = await request.json(); // command: 'init', 'validate', or 'plan'

    if (!files || typeof files !== "object") {
      return NextResponse.json({ detail: "No files provided for execution" }, { status: 400 });
    }

    if (command !== "init" && command !== "validate" && command !== "plan") {
      return NextResponse.json({ detail: "Invalid command" }, { status: 400 });
    }

    const result = await runTerraformSandbox(files, command as any);
    
    // Cleanup if it was successful (or even if it failed, usually better to clean up)
    if (result.sandboxPath) {
      await cleanupSandbox(result.sandboxPath);
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error(`Terraform Execute API Error:`, error);
    return NextResponse.json({
      success: false,
      message: `Execution failed: ${error.message}`
    }, { status: 500 });
  }
}
