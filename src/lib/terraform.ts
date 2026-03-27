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

/**
 * Parses a Terraform error string and extracts structured error details.
 */
export interface TerraformErrorInfo {
  file: string;
  line: number;
  errorType: string;
  offendingCode: string;
}

function parseTerraformErrors(errorOutput: string): TerraformErrorInfo[] {
  const errors: TerraformErrorInfo[] = [];
  // Match Terraform error blocks like:
  //   │ Error: Unsupported argument
  //   │
  //   │   on main.tf line 62, in resource "aws_eip" "nat":
  //   │   62:   vpc   = true
  const blockRegex = /│ Error: ([^\n]+)\n│\n│\s+on ([^\s]+) line (\d+)[^\n]*\n│\s+\d+:\s+([^\n]+)/g;
  let match;
  while ((match = blockRegex.exec(errorOutput)) !== null) {
    errors.push({
      errorType: match[1].trim(),
      file: match[2].trim(),
      line: parseInt(match[3], 10),
      offendingCode: match[4].trim(),
    });
  }
  return errors;
}

/**
 * Attempts to fix Terraform files deterministically by parsing error messages
 * and applying surgical code changes. This runs BEFORE the LLM to reliably fix
 * well-understood error classes like "Unsupported argument".
 */
export function deterministicTerraformFix(
  files: Record<string, string>,
  errorOutput: string
): { files: Record<string, string>; fixesApplied: string[] } {
  const fixesApplied: string[] = [];
  const errors = parseTerraformErrors(errorOutput);

  if (errors.length === 0) {
    return { files, fixesApplied };
  }

  const updatedFiles = { ...files };

  for (const err of errors) {
    const filename = err.file;
    if (!updatedFiles[filename]) continue;

    const lines = updatedFiles[filename].split("\n");
    const lineIdx = err.line - 1; // Convert to 0-indexed

    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    const errLower = err.errorType.toLowerCase();

    const isUnsupportedArg =
      errLower.includes("unsupported argument") ||
      errLower.includes("unknown argument") ||
      errLower.includes("invalid argument name");

    const isInvalidValue =
      errLower.includes("invalid value") ||
      errLower.includes("inappropriate value");

    const isInvalidRef =
      errLower.includes("reference to undeclared resource") ||
      errLower.includes("reference to undeclared module") ||
      errLower.includes("reference to undeclared variable");

    if (isUnsupportedArg || isInvalidValue || isInvalidRef) {
      const originalLine = lines[lineIdx];
      // Comment out the offending line - 100% deterministic, uses exact line number from Terraform
      lines[lineIdx] = `  # [AUTO-REMOVED] ${originalLine.trim()}`;
      updatedFiles[filename] = lines.join("\n");
      fixesApplied.push(`[${err.errorType}] Removed line ${err.line} in ${filename}: \`${originalLine.trim()}\``);
      console.log(`[DeterministicFix] ${err.errorType} -> Commented out ${filename}:${err.line}`);
    }
    // Note: "Missing required argument" and other complex errors are intentionally
    // left for the LLM, as they require semantic understanding to fix.
  }

  return { files: updatedFiles, fixesApplied };
}
