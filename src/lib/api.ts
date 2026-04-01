import type { InteractiveResponse, CloudProvider } from "./types";

const API_BASE = "/api";

export async function generateDoc(
  file: File,
  docType: string,
  environment: string,
  provider: CloudProvider = 'GCP'
): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("docType", docType);
  form.append("environment", environment);
  form.append("provider", provider);

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

export async function generateDocFromJson(
  architectureJson: InteractiveResponse,
  docType: string,
  environment: string,
  provider: CloudProvider = 'GCP'
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      architectureJson,
      docType,
      environment,
      provider,
    }),
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
  file: File,
  provider: CloudProvider = 'GCP'
): Promise<InteractiveResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("provider", provider);

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
  isMultiRegion: boolean = false,
  serviceConfigs?: any[]
) {
  const payload = {
    architectureJson,
    simulationState,
    scenarioPreset,
    failureSimulation,
    isMultiRegion,
    serviceConfigs,
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

export async function convertDiagram(
  targetProvider: CloudProvider,
  sourceXml?: string,
  architectureJson?: any
): Promise<{ xml: string }> {
  const res = await fetch(`${API_BASE}/diagram/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetProvider, sourceXml, architectureJson }),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `Error ${res.status}`;
    try {
      msg = JSON.parse(text).error || msg;
    } catch {
      msg = text || msg;
    }
    throw new Error(msg);
  }

  return res.json();
}
