import type { InteractiveResponse } from "./types";

const API_BASE = "/api";

export async function generateDoc(
  file: File,
  docType: string,
  environment: string
): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("docType", docType);
  form.append("environment", environment);

  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `Error ${res.status}`;
    try {
      msg = JSON.parse(text).detail || msg;
    } catch {
      msg = text || msg;
    }
    throw new Error(msg);
  }

  return res.blob();
}

export async function generateInteractive(
  file: File
): Promise<InteractiveResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/interactive`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `Error ${res.status}`;
    try {
      msg = JSON.parse(text).detail || msg;
    } catch {
      msg = text || msg;
    }
    throw new Error(msg);
  }

  return res.json() as Promise<InteractiveResponse>;
}

export async function runSimulation(
  architectureJson: InteractiveResponse,
  simulationState: Record<string, number>,
  scenarioPreset: string = "custom",
  failureSimulation: string[] = [],
  isMultiRegion: boolean = false
) {
  const payload = {
    architectureJson,
    simulationState,
    scenarioPreset,
    failureSimulation,
    isMultiRegion,
  };

  const res = await fetch(`${API_BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `Error ${res.status}`;
    try {
      msg = JSON.parse(text).detail || msg;
    } catch {
      msg = text || msg;
    }
    throw new Error(msg);
  }

  return res.json();
}
