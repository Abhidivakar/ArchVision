import { exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface TerraformResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  sandboxPath: string;
}

/**
 * Runs a terraform command in a temporary sandbox.
 * @param files A record of filename -> content
 * @param command The command to run (e.g. "init", "plan")
 * @returns Results with stdout and stderr
 */
export async function runTerraformSandbox(
  files: Record<string, string>,
  command: "init" | "validate" | "plan"
): Promise<TerraformResult> {
  const sandboxId = `tf-verify-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const sandboxPath = path.join(os.tmpdir(), sandboxId);

  try {
    // 1. Create sandbox directory
    await fs.promises.mkdir(sandboxPath, { recursive: true });

    // 2. Write all files to sandbox
    for (const [filename, content] of Object.entries(files)) {
      await fs.promises.writeFile(path.join(sandboxPath, filename), content);
    }

    // 3. Define command string
    let cmd = "";
    if (command === "init") {
      cmd = "terraform init -backend=false";
    } else if (command === "validate") {
      cmd = "terraform init -backend=false && terraform validate";
    } else if (command === "plan") {
      // Note: we run init first even for plan because every call is a fresh sandbox
      cmd = "terraform init -backend=false && terraform plan -input=false";
    }

    const { stdout, stderr } = await execAsync(cmd, { cwd: sandboxPath });

    return {
      success: true,
      stdout,
      stderr,
      sandboxPath
    };
  } catch (error: any) {
    return {
      success: false,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      error: error.message,
      sandboxPath
    };
  }
}

/**
 * Cleans up a sandbox directory.
 */
export async function cleanupSandbox(sandboxPath: string) {
  try {
    if (fs.existsSync(sandboxPath)) {
      await fs.promises.rm(sandboxPath, { recursive: true, force: true });
    }
  } catch (e) {
    console.error("Terraform Sandbox Cleanup Error:", e);
  }
}
