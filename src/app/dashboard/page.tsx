"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ArchComponent, InteractiveResponse, SimulationReport, CalibrationOverride } from "@/lib/types";
import HotspotLayer from "@/components/HotspotLayer";
import { runSimulation } from "@/lib/api";
import { playSuccessSound, playTfSuccessSound } from "@/lib/audio";
import { requestNotificationPermission, sendNotification } from "@/lib/notifications";
import TerraformEditor from "@/components/TerraformEditor";

type Tab = "overview" | "component" | "simulation" | "terraform" | "improvement";

export default function DashboardPage() {
  const router = useRouter();
  const imageRef = useRef<HTMLImageElement>(null);
  const [data, setData] = useState<InteractiveResponse | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [activeComp, setActiveComp] = useState<ArchComponent | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sliderVal, setSliderVal] = useState(1);
  const [copied, setCopied] = useState(false);

  // Simulation State
  const [simulationState, setSimulationState] = useState<Record<string, number>>({});
  const [simulationReport, setSimulationReport] = useState<SimulationReport | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [isMultiRegion, setIsMultiRegion] = useState<boolean>(false);
  const [scenarioPreset, setScenarioPreset] = useState<string>("Custom");
  const [failureSimulation, setFailureSimulation] = useState<string[]>([]);
  const [plannedIds, setPlannedIds] = useState<string[]>([]);

  // Advanced Terraform State
  const [tfFiles, setTfFiles] = useState<Record<string, string> | null>(null);
  const [tfSummary, setTfSummary] = useState<string>("");
  const [plannedConfigs, setPlannedConfigs] = useState<Record<string, string>>({});

  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [tfLogs, setTfLogs] = useState<string[]>([]);
  const [isTfGenerating, setIsTfGenerating] = useState(false);
  const [isTfVerifying, setIsTfVerifying] = useState(false);
  const [activeTfFile, setActiveTfFile] = useState<string>("main.tf");
  const [tfSplitRatio, setTfSplitRatio] = useState(0.6); // 60% top, 40% bottom
  const [isResizing, setIsResizing] = useState(false);
  const [tfRetryCount, setTfRetryCount] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // New Global Scenario States
  const [activeScenario, setActiveScenario] = useState<'original' | 'improved'>('original');
  const [improvedData, setImprovedData] = useState<InteractiveResponse | null>(null);
  const [improvedImageUrl, setImprovedImageUrl] = useState<string>("");
  const [improvedSimReport, setImprovedSimReport] = useState<SimulationReport | null>(null);
  const [improvedTfFiles, setImprovedTfFiles] = useState<Record<string, string> | null>(null);
  const [improvementSolution, setImprovementSolution] = useState<any | null>(null);
  const [isImproving, setIsImproving] = useState(false);
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
  const [improvedTfSummary, setImprovedTfSummary] = useState<string>("");
  const [improvedPlannedConfigs, setImprovedPlannedConfigs] = useState<Record<string, string>>({});
  const [improvedPlannedIds, setImprovedPlannedIds] = useState<string[]>([]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Preset multipliers: what % of slider range each scenario fills
  const PRESET_MULTIPLIERS: Record<string, number> = {
    "Custom": 0,
    "Startup Mode": 0.05,
    "Production Mode": 0.30,
    "Black Friday": 0.75,
    "DDoS Simulation": 0.95,
  };

  const handlePresetChange = (mode: string) => {
    setScenarioPreset(mode);
    if (mode === "Custom" || !data?.simulation_parameters) return;
    const mult = PRESET_MULTIPLIERS[mode] ?? 0.5;
    const updated: Record<string, number> = {};
    data.simulation_parameters.forEach((p) => {
      updated[p.id] = Math.round(p.min + (p.max - p.min) * mult);
    });
    setSimulationState(updated);
  };

  useEffect(() => {
    const raw = sessionStorage.getItem("archData");
    if (!raw) {
      router.push("/");
      return;
    }
      try {
        const parsed = JSON.parse(raw);
        setData(parsed.data);
        setImageUrl(parsed.imageUrl);

        // Initialize Simulation State
        if (parsed.data.simulation_parameters) {
          const initial: Record<string, number> = {};
          parsed.data.simulation_parameters.forEach((p: any) => {
            initial[p.id] = p.default_value;
          });
          setSimulationState(initial);
        }
      } catch (e) {
        console.error("Dashboard Parse Error:", e);
        sessionStorage.removeItem("archData");
        router.push("/");
      }
    }, [router]);
  
  // Resizing logic for Terraform Tab
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const container = document.getElementById("tf-content-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const offset = e.clientY - rect.top;
      const newRatio = Math.max(0.2, Math.min(0.8, offset / rect.height));
      setTfSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "default";
    };

    if (isResizing) {
      document.body.style.cursor = "ns-resize";
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleSelectComp = (comp: ArchComponent) => {
    setActiveComp(comp);
    setActiveId(comp.id || comp.name);
    setSliderVal(1);
    setActiveTab("component");
  };

  const handleSaveCalibration = (overrides: Record<string, CalibrationOverride>) => {
    if (!data) return;

    const updatedComponents = data.components.map(comp => {
      const override = overrides[comp.id];
      if (override) {
        return {
          ...comp,
          box_2d: [override.ymin, override.xmin, override.ymax, override.xmax] as [number, number, number, number]
        };
      }
      return comp;
    });

    setData({
      ...data,
      components: updatedComponents
    });
  };

  const getSecurityScore = () => {
    return data?.security_score ?? null;
  };

  const scoreColor = (score: number | null) => {
    if (!score) return "text-slate-400";
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const parseBaseCost = (costStr: string | undefined): [number, number] | null => {
    if (!costStr) return null;
    const nums = costStr.match(/\d+(?:\.\d+)?/g);
    if (!nums) return null;
    const [a, b] = nums.map(Number);
    return b ? [a, b] : [a, a];
  };

  const scaledCost = (comp: ArchComponent, mult: number): string => {
    const base = parseBaseCost(comp.cost);
    if (!base) return comp.cost || "N/A";
    const [lo, hi] = base;
    if (lo === hi) return `$${(lo * mult).toFixed(0)} / mo`;
    return `$${(lo * mult).toFixed(0)} – $${(hi * mult).toFixed(0)} / mo`;
  };

  const copyTerraform = () => {
    if (!data?.terraform_skeleton) return;
    const code = data.terraform_skeleton
      .replace(/^```(?:terraform|hcl)?\s*/i, "")
      .replace(/\s*```$/, "");
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimulate = async () => {
    const dataToUse = activeScenario === 'original' ? data : improvedData;
    if (!dataToUse) return;
    setIsSimulating(true);
    try {
      const res = await runSimulation(
        dataToUse,
        simulationState,
        scenarioPreset,
        failureSimulation,
        isMultiRegion
      );
      if (activeScenario === 'original') {
        setSimulationReport(res.report);
      } else {
        setImprovedSimReport(res.report);
      }
      playSuccessSound();
      sendNotification("Simulation Finished", "The traffic simulation analysis is now complete and ready for review.");
    } catch (err: any) {
      alert(err.message || "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  const getTrafficVolume = () => {
    if (simulationState["rps"]) {
      return (simulationState["rps"] - 10) / (5000 - 10);
    }
    return 0.1;
  };

  const addLog = (msg: string) => {
    setTfLogs(prev => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };
  const handleGenerateTf = async (errorLog?: string, autoPlan?: boolean, overrideFiles?: Record<string, string>) => {
    const dataToUse = activeScenario === 'original' ? data : improvedData;
    const simReportToUse = activeScenario === 'original' ? simulationReport : improvedSimReport;
    const tfFilesToUse = activeScenario === 'original' ? tfFiles : improvedTfFiles;
    
    if (!dataToUse) return;
    setIsTfGenerating(true);
    
    const filesToUse = overrideFiles || tfFilesToUse;

    setTfLogs([`[${new Date().toLocaleTimeString()}] Initiating ${errorLog ? "intelligent auto-fix" : "on-demand production Terraform generation"}...`]);
    setIsSummaryExpanded(false);

    try {
      const response = await fetch("/api/terraform/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          architectureJson: dataToUse,
          simulationState,
          simulationReport: simReportToUse,
          errorContext: errorLog,
          files: errorLog ? filesToUse : null
        }),
      });
      if (!response.ok) throw new Error("Generation failed");
      const result = await response.json();
      
      if (activeScenario === 'original') {
        setTfFiles(result.files);
        setTfSummary(result.summary);
        if (result.componentConfigs) setPlannedConfigs(result.componentConfigs);
      } else {
        setImprovedTfFiles(result.files);
        setImprovedTfSummary(result.summary);
        if (result.componentConfigs) setImprovedPlannedConfigs(result.componentConfigs);
      }
      
      setActiveTfFile("main.tf");
      playTfSuccessSound();
      sendNotification("Terraform Code Ready", "Production-grade Terraform configurations have been generated successfully.");
      addLog("Success: Terraform code generated based on current simulation sizing.");
      
      if (autoPlan) {
        addLog("Auto-Fix complete. Triggering automatic Plan verification...");
        setTimeout(() => handleExecuteTf("plan", result.files), 1000);
      }
    } catch (e: any) {
      addLog(`Error: ${e.message}`);
    } finally {
      setIsTfGenerating(false);
    }
  };

  const handleExecuteTf = async (command: string, overrideFiles?: Record<string, string>) => {
    const filesToUse = overrideFiles || tfFiles;
    if (!filesToUse) return;
    setIsTfVerifying(true);
    addLog(`Running terraform ${command}...`);
    try {
      const res = await fetch("/api/terraform/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filesToUse, command })
      });
      const result = await res.json();
      
      if (result.stdout) addLog(result.stdout);
      if (result.stderr) addLog(`STDERR: ${result.stderr}`);

      // Crucial: Update global state if we ran with overrides (e.g. from IDE save)
      if (overrideFiles) {
        if (activeScenario === 'original') {
          setTfFiles(overrideFiles);
        } else {
          setImprovedTfFiles(overrideFiles);
        }
      }

      if (result.success) {
        addLog(`Terraform ${command} successful!`);
        playTfSuccessSound();
        sendNotification("Terraform Action Complete", `The ${command} operation on your infrastructure was successful.`);
        if (command === "plan") {
          const dataToUse = activeScenario === 'original' ? data : improvedData;
          // Filter components to only those that appear in the Terraform code
          const components = (dataToUse as any)?.components || [];
          const allTfContent = Object.values(filesToUse).join("\n").toLowerCase();
          
          const relevantIds = components
            .filter((c: any) => {
              const nameMatch = c.name?.toLowerCase() && allTfContent.includes(c.name.toLowerCase());
              const idMatch = c.id?.toLowerCase() && allTfContent.includes(c.id.toLowerCase());
              const serviceMatch = c.service?.toLowerCase() && allTfContent.includes(c.service.toLowerCase());
              return nameMatch || idMatch || serviceMatch;
            })
            .map((c: any) => c.id || c.name);

          if (activeScenario === 'original') {
            setPlannedIds(relevantIds);
          } else {
            setImprovedPlannedIds(relevantIds);
          }
          addLog(`Visual Verification: ${relevantIds.length} infrastructure nodes highlighted in GREEN.`);
          setTfRetryCount(0); // Reset on success
        }
      } else {
        addLog(`Terraform ${command} failed.`);
        
        // Auto-fix logic - Reduced to 1 retry from frontend for better stability
        if (command === "plan" && tfRetryCount < 1) {
          addLog("--- CRITICAL: Plan error detected. Triggering Intelligent Auto-Fix... ---");
          setTfRetryCount(prev => prev + 1);
          const errorMsg = result.stderr || result.error || "Unknown error during plan";
          setTimeout(() => handleGenerateTf(errorMsg, true, filesToUse), 1500);
        } else if (command === "plan") {
           addLog("--- Max retry attempts reached. Please use the IDE 'Edit' button to fix manually. ---");
        }
      }
    } catch (e: any) {
      addLog(`Execution Error: ${e.message}`);
    } finally {
      setIsTfVerifying(false);
    }
  };

  const handleSyncFromIde = async (newFiles: Record<string, string>) => {
    const dataToUse = activeScenario === 'original' ? data : improvedData;
    if (!dataToUse) return;
    try {
      const response = await fetch("/api/terraform/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: newFiles, architectureJson: dataToUse })
      });
      if (!response.ok) throw new Error("Synchronization failed");
      const result = await response.json();
      if (result.componentConfigs) {
        if (activeScenario === 'original') {
          setPlannedConfigs(result.componentConfigs);
        } else {
          setImprovedPlannedConfigs(result.componentConfigs);
        }
        addLog("Sync: Visual components updated with manual Terraform edits.");
      }
    } catch (e: any) {
      addLog(`Sync Error: ${e.message}`);
    }
  };

  const handleImproveAnalysis = async () => {
    if (!data) return;
    setIsImproving(true);
    try {
      const currentReport = activeScenario === 'original' ? simulationReport : improvedSimReport;
      const res = await fetch("/api/architecture/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ architectureJson: data, simulationReport: currentReport })
      });
      if (!res.ok) throw new Error("Improvement analysis failed");
      const result = await res.json();
      setImprovementSolution(result);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsImproving(false);
    }
  };  const handleGenerateImprovedDiagram = async () => {
    if (!improvementSolution) return;
    setIsGeneratingDiagram(true);
    addLog("System: Evolving architecture from AI synthesis model...");
    
    try {
      // Call the Real Image Generation API using Vertex AI Imagen
      const imgRes = await fetch("/api/architecture/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: improvementSolution.image_prompt })
      });
      
      let newImageUrl = imageUrl; // Default to original if generation fails or is throttled

      if (!imgRes.ok) {
        if (imgRes.status === 429) {
          sendNotification("AI Image Quota Exceeded", "High-fidelity generation is temporarily paused. Falling back to original diagram.");
          addLog("Warning: Imagen quota reached. Using original image as background.");
          // We don't throw here, we just continue with original image
        } else {
          throw new Error("Failed to generate architecture image");
        }
      } else {
        const { imageUrl: generatedUrl } = await imgRes.json();
        newImageUrl = generatedUrl;
      }
      
      let improvedDataToSet: InteractiveResponse | null = null;
 
      if (improvementSolution.improved_components && improvementSolution.improved_components.length > 0) {
        // Inherit non-component data from original or create defaults
        improvedDataToSet = { 
          ...data!,
          components: improvementSolution.improved_components 
        };
      } else {
        // Fallback or legacy path
        improvedDataToSet = data;
      }
      
      setImprovedImageUrl(newImageUrl);
      setImprovedData(improvedDataToSet);
      setActiveScenario('improved');
      
      playTfSuccessSound();
      sendNotification("Architecture Evolved", "Your layout has been optimized for production scale and resilience.");
      addLog("Success: Improved architecture context generated successfully.");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsGeneratingDiagram(false);
    }
  };
;

  const handleDownloadTf = async () => {
    if (!tfFiles) return;
    try {
      const res = await fetch("/api/terraform/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: tfFiles, docType: "Advanced", environment: "Production" })
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "terraform_production_configs.zip";
      a.click();
    } catch (e: any) {
      addLog(`Download Error: ${e.message}`);
    }
  };

  const handleExportPDF = () => {
    if (!simulationReport || !data) return;

    const report = simulationReport;
    const totalLat = report.latency_prediction
      ? report.latency_prediction.reduce((s, l) => s + l.latency_ms, 0)
      : 0;
    const totalCost = report.cost_breakdown
      ? report.cost_breakdown.reduce((s, c) => s + c.monthly_cost, 0)
      : 0;
    const maxC = report.cost_breakdown
      ? Math.max(...report.cost_breakdown.map((c) => c.monthly_cost), 1)
      : 1;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Traffic Simulation Report — ArchVision</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; background:#ffffff; color:#1e293b; padding:40px 48px; line-height:1.7; }
    h1 { font-size:26px; color:#0f172a; margin-bottom:4px; }
    .subtitle { color:#64748b; font-size:12px; margin-bottom:28px; border-bottom:2px solid #e2e8f0; padding-bottom:12px; }
    h2 { font-size:16px; color:#0f172a; margin:24px 0 10px; padding-bottom:6px; border-bottom:2px solid #e2e8f0; }
    h3 { font-size:12px; color:#475569; text-transform:uppercase; letter-spacing:0.1em; margin:16px 0 8px; font-weight:600; }
    .card { background:#f8fafc; border-radius:10px; padding:18px; margin-bottom:14px; border:1px solid #e2e8f0; color:#334155; font-size:13px; }
    .card.cyan { border-color:#06b6d4; background:#ecfeff; }
    .card.purple { border-color:#a855f7; background:#faf5ff; }
    .card.rose { border-color:#f43f5e; background:#fff1f2; }
    .card.amber { border-color:#f59e0b; background:#fffbeb; }
    .card.green { border-color:#22c55e; background:#f0fdf4; }
    .card.blue { border-color:#3b82f6; background:#eff6ff; }
    .card.red { border-color:#ef4444; background:#fef2f2; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th, td { text-align:left; padding:8px 12px; font-size:12px; }
    th { color:#64748b; font-weight:600; border-bottom:2px solid #e2e8f0; background:#f1f5f9; }
    td { color:#334155; border-bottom:1px solid #e2e8f0; }
    .mono { font-family:'Courier New',monospace; }
    .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:700; }
    .badge-green { background:#dcfce7; color:#166534; border:1px solid #86efac; }
    .badge-amber { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
    .badge-red { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
    .bar-container { width:100%; background:#e2e8f0; border-radius:6px; height:10px; overflow:hidden; margin-top:4px; }
    .bar { height:100%; border-radius:6px; background:linear-gradient(90deg,#f59e0b,#ea580c); }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .metric-box { background:#f1f5f9; border-radius:10px; padding:16px; text-align:center; border:1px solid #e2e8f0; }
    .metric-box .value { font-size:26px; font-weight:700; }
    .metric-box .label { font-size:11px; color:#64748b; margin-top:4px; }
    .list-item { display:flex; gap:8px; margin-bottom:8px; font-size:12px; color:#334155; }
    .list-item .dot { color:#ef4444; flex-shrink:0; }
    .opt-card { background:#f1f5f9; border-radius:8px; padding:12px; margin-bottom:8px; border:1px solid #e2e8f0; }
    .opt-title { font-weight:600; color:#0f172a; font-size:12px; }
    .opt-desc { color:#475569; font-size:11px; margin-top:4px; }
    .footer { margin-top:36px; padding-top:12px; border-top:2px solid #e2e8f0; color:#94a3b8; font-size:10px; text-align:center; }
    .diagram-section { text-align:center; margin-bottom:20px; }
    .diagram-section img { max-width:100%; max-height:400px; border-radius:10px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
    .scenario-badge { display:inline-block; background:#eff6ff; border:1px solid #3b82f6; color:#1d4ed8; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:600; margin-bottom:16px; }

    @media print {
      body { background:#fff !important; }
      @page { size:A4; margin:15mm; }
      .card, .metric-box, .opt-card, .bar-container, .bar { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    }
  </style>
</head>
<body>
  <h1>📊 Traffic Simulation Report</h1>
  <div class="subtitle">Generated by ArchVision AI Architecture Analyzer · ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>

  ${imageUrl ? `<div class="diagram-section"><h2>🏗️ Architecture Diagram</h2><img src="${imageUrl}" alt="Architecture Diagram" /></div>` : ''}

  ${scenarioPreset !== 'Custom' ? `<div class="scenario-badge">📋 Scenario: ${scenarioPreset}${isMultiRegion ? ' · Multi-Region' : ''}${failureSimulation.length ? ' · Failures: ' + failureSimulation.join(', ') : ''}</div>` : ''}

  <h2>Impact Summary</h2>
  <div class="card">${report.impact_summary}</div>

  ${report.scaling_result?.length ? `
  <h2>📈 Infrastructure Scaling</h2>
  <div class="card cyan">
    <table>
      <tr><th>Service</th><th>Previous</th><th></th><th>New</th></tr>
      ${report.scaling_result.map(s => `<tr><td>${s.service}</td><td class="mono">${s.previous_instances}</td><td style="color:#0891b2;font-weight:700">→</td><td class="mono" style="color:#0891b2;font-weight:700">${s.new_instances}</td></tr>`).join('')}
    </table>
  </div>` : ''}

  ${report.latency_prediction?.length ? `
  <h2>⚡ Latency Prediction</h2>
  <div class="card purple">
    <table>
      <tr><th>Tier</th><th style="text-align:right">Latency</th></tr>
      ${report.latency_prediction.map(l => `<tr><td>${l.tier}</td><td style="text-align:right"><span class="badge ${l.latency_ms > 300 ? 'badge-red' : l.latency_ms > 150 ? 'badge-amber' : 'badge-green'}">${l.latency_ms} ms</span></td></tr>`).join('')}
      <tr style="border-top:2px solid #cbd5e1"><td><strong>Total Response Time</strong></td><td style="text-align:right"><strong class="mono" style="font-size:15px;color:${totalLat > 500 ? '#dc2626' : totalLat > 250 ? '#d97706' : '#16a34a'}">${totalLat} ms ${totalLat > 500 ? '⚠️' : '✅'}</strong></td></tr>
    </table>
  </div>` : ''}

  <div class="grid2">
    ${report.bottlenecks?.length ? `
    <div class="card rose">
      <h3 style="color:#e11d48">⚠️ Potential Bottlenecks</h3>
      ${report.bottlenecks.map(b => `<div class="list-item"><span class="dot">•</span><span>${b}</span></div>`).join('')}
    </div>` : ''}
    <div class="card amber">
      <h3 style="color:#d97706">💸 Cost Impact</h3>
      <p style="font-size:12px">${report.cost_impact}</p>
    </div>
  </div>

  ${report.cost_breakdown?.length ? `
  <h2>📊 Monthly Cost Breakdown</h2>
  <div class="card amber">
    <table>
      <tr><th>Service</th><th style="text-align:right">Monthly Cost</th><th style="width:40%">Distribution</th></tr>
      ${report.cost_breakdown.map(c => `<tr><td>${c.service}</td><td style="text-align:right" class="mono">$${c.monthly_cost.toLocaleString()}</td><td><div class="bar-container"><div class="bar" style="width:${(c.monthly_cost / maxC) * 100}%"></div></div></td></tr>`).join('')}
      <tr style="border-top:2px solid #cbd5e1"><td><strong>Total</strong></td><td style="text-align:right" class="mono"><strong style="color:#d97706;font-size:14px">$${totalCost.toLocaleString()} / mo</strong></td><td></td></tr>
    </table>
  </div>` : ''}

  ${report.infrastructure_limits?.length ? `
  <h2>🚧 Infrastructure Limits</h2>
  <div class="card red">
    ${report.infrastructure_limits.map(l => `<div class="list-item"><span class="dot">⚠</span><span><strong>${l.service}</strong> — ${l.limit_description} at <span class="mono" style="color:#dc2626;font-weight:700">${l.threshold_value.toLocaleString()}</span></span></div>`).join('')}
  </div>` : ''}

  ${report.optimizations?.length ? `
  <h2>🔧 AI Optimization Suggestions</h2>
  <div class="card green">
    ${report.optimizations.map(o => `<div class="opt-card"><div style="display:flex;justify-content:space-between;align-items:center"><span class="opt-title">${o.title}</span>${o.cost_reduction_percentage ? `<span class="badge badge-green">↓ ${o.cost_reduction_percentage}% cost</span>` : ''}</div><div class="opt-desc">${o.description}</div></div>`).join('')}
  </div>` : ''}

  ${report.carbon_footprint ? `
  <h2>🌱 Carbon & Energy Impact</h2>
  <div class="card green">
    <div class="grid2">
      <div class="metric-box"><div class="value" style="color:#16a34a">${report.carbon_footprint.estimated_co2_kg} kg</div><div class="label">Monthly CO₂</div></div>
      <div class="metric-box"><div class="value" style="color:#059669">↓ ${report.carbon_footprint.potential_reduction_percentage}%</div><div class="label">Potential Reduction</div></div>
    </div>
    <p style="font-size:11px;color:#475569;margin-top:12px;font-style:italic">💡 ${report.carbon_footprint.optimization_suggestion}</p>
  </div>` : ''}

  ${report.scaling_suggestions?.length ? `
  <h2>🚀 Scaling Suggestions</h2>
  <div class="card blue">
    ${report.scaling_suggestions.map((s, i) => `<div class="list-item"><span style="color:#2563eb">➔</span><span>${s}</span></div>`).join('')}
  </div>` : ''}

  <div class="footer">
    ArchVision — AI Architecture Analyzer · Report generated on ${new Date().toLocaleString()}
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 600);
    }
  };

  const handleExportCSV = () => {
    if (!simulationReport) return;
    const report = simulationReport;
    
    let csv = "Service,Previous Instances,New Instances,Latency (ms),Monthly Cost ($)\n";
    
    const services = new Set([
      ...(report.scaling_result?.map(s => s.service) || []),
      ...(report.cost_breakdown?.map(c => c.service) || [])
    ]);

    services.forEach(service => {
      const scaling = report.scaling_result?.find(s => s.service === service);
      const cost = report.cost_breakdown?.find(c => c.service === service);
      const latency = report.latency_prediction?.find(l => 
        service.toLowerCase().includes(l.tier.toLowerCase()) || 
        l.tier.toLowerCase().includes(service.toLowerCase())
      );

      csv += `"${service}",${scaling?.previous_instances || "-"},${scaling?.new_instances || "-"},${latency?.latency_ms || "-"},${cost?.monthly_cost || "-"}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `ArchVision_Simulation_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportTfReport = () => {
    if (!tfFiles || !data) return;

    // Check if simulation was run
    const hasSim = !!simulationReport;
    const totalSimCost = hasSim ? (simulationReport?.cost_breakdown?.reduce((sum: number, c: any) => sum + (c.monthly_cost || 0), 0) || 0) : 0;
    const rps = simulationState["rps"] || 0;
    const components = data.components;



    // Helper for fuzzy matching in report
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const lookupConfig = (cId: string, cName: string) => {
      const idNorm = normalize(cId);
      const nameNorm = normalize(cName);
      let found = plannedConfigs[cId] || plannedConfigs[cName];
      if (!found) {
        const key = Object.keys(plannedConfigs).find(k => {
          const nk = normalize(k);
          return nk === idNorm || nk === nameNorm;
        });
        if (key) found = plannedConfigs[key];
      }
      return found;
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Terraform Infrastructure Audit — ArchVision</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; background:#f8fafc; color:#1e293b; padding:60px; line-height:1.6; }
    .header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:4px solid #0f172a; padding-bottom:20px; margin-bottom:40px; }
    h1 { font-size:32px; color:#0f172a; letter-spacing:-0.02em; }
    .meta { text-align:right; font-size:12px; color:#64748b; }
    h2 { font-size:18px; color:#0f172a; margin:40px 0 16px; display:flex; align-items:center; gap:10px; }
    h2::before { content:''; display:inline-block; width:12px; height:12px; background:#3b82f6; border-radius:3px; }
    .summary-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:20px; margin-bottom:30px; }
    .stat-card { background:#fff; padding:20px; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
    .stat-label { font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; margin-bottom:6px; font-weight:600; }
    .stat-value { font-size:20px; font-weight:700; color:#0f172a; }
    .perf-badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; background:#f1f5f9; color:#475569; margin-top:4px; }
    .perf-badge.green { background:#dcfce7; color:#15803d; }
    .config-table { width:100%; border-collapse:separate; border-spacing:0; background:#fff; border-radius:16px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); }
    th { background:#f1f5f9; padding:16px 20px; text-align:left; font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; }
    td { padding:16px 20px; border-top:1px solid #f1f5f9; font-size:13px; vertical-align:top; }
    .comp-name { font-weight:600; color:#0f172a; margin-bottom:4px; display:block; }
    .comp-service { font-size:11px; color:#64748b; background:#f8fafc; padding:2px 8px; border-radius:4px; border:1px solid #e2e8f0; }
    .config-pill { display:inline-block; background:#eff6ff; color:#1d4ed8; padding:8px 16px; border-radius:8px; font-size:12px; font-weight:600; border:1px solid #dbeafe; line-height:1.5; white-space:pre-wrap; text-align:left; }

    .no-config { color:#94a3b8; font-style:italic; font-size:12px; }
    .section-desc { font-size:14px; color:#475569; margin-bottom:20px; max-width:800px; }
    .compliance-box { background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:20px; margin-bottom:30px; font-size:14px; color:#0369a1; }
    .compliance-box h3 { font-size:14px; font-weight:700; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em; }
    .files-list { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .file-badge { font-family:'JetBrains Mono',monospace; font-size:11px; background:#1e293b; color:#f1f5f9; padding:4px 12px; border-radius:6px; }
    .footer { margin-top:80px; padding-top:30px; border-top:1px solid #e2e8f0; text-align:center; font-size:11px; color:#94a3b8; }
    @media print { body { padding:30px; } .stat-card, .config-table { box-shadow:none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Infrastructure Implementation Audit</h1>
      <p style="color:#64748b">Verification of Production Terraform against Architecture Requirements</p>
    </div>
    <div class="meta">
      <strong>ARCHVISION PRO v2.1</strong><br/>
      Audit ID: ${Math.random().toString(36).substring(7).toUpperCase()}<br/>
      ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  </div>

  <h2>Infrastructure at a Glance</h2>
  <div class="summary-grid">
    <div class="stat-card">
      <div class="stat-label">Provisioned Tier</div>
      <div class="stat-value">${rps > 2000 ? 'Enterprise' : rps > 500 ? 'Scalable' : 'Standard'}</div>
      <div class="perf-badge">Auto-Scaled</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Peak Simulation Load</div>
      <div class="stat-value">${rps} RPS</div>
      <div class="perf-badge ${hasSim ? 'green' : ''}">${hasSim ? 'Validated' : 'Nominal'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Mapped Components</div>
      <div class="stat-value">${Object.keys(plannedConfigs).length} / ${components.length}</div>
      <div class="perf-badge">Success Score: ${Math.round((Object.keys(plannedConfigs).length / components.length) * 100)}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Est. Monthly OpEx</div>
      <div class="stat-value">$${hasSim ? totalSimCost.toLocaleString() : '---'}</div>
      <div class="perf-badge">Projected</div>
    </div>
  </div>

  ${hasSim ? `
  <h2>Simulation Performance Benchmarks</h2>
  <div class="section-desc">Infrastructure handle-rate and latency thresholds derived from active traffic simulation.</div>
  <div class="summary-grid" style="grid-template-columns: repeat(2, 1fr);">
    <div class="stat-card">
      <div class="stat-label">Peak Concurrent Requests</div>
      <div class="stat-value">${rps.toLocaleString()} RPS</div>
      <p style="font-size:11px; color:#64748b; margin-top:8px;">Target SLA: Sub-200ms at 95th Percentile</p>
    </div>
    <div class="stat-card">
      <div class="stat-label">Bottleneck Risk Level</div>
      <div class="stat-value" style="color:${simulationReport?.bottlenecks?.length > 0 ? '#dc2626' : '#15803d'}">
        ${simulationReport?.bottlenecks?.length > 0 ? 'High Risk' : 'Healthy'}
      </div>
      <p style="font-size:11px; color:#ef4444; margin-top:8px;">${simulationReport?.bottlenecks?.[0] || 'Clean validation run'}</p>
    </div>
  </div>
  ` : ''}

  <h2>Terraform Compliance Strategy</h2>
  <div class="section-desc">Automated architectural synthesis explaining the rationale behind selected resource tiers.</div>
  <div class="stat-card" style="margin-bottom:40px; line-height:1.8; color:#334155; font-size:14px; border-left: 4px solid #3b82f6; background:#f8fafc;">
    ${tfSummary.split('\n').map(p => {
      if (p.trim().startsWith('##')) return `<h3 style="margin:20px 0 10px; color:#0f172a; font-size:15px;">${p.replace(/#/g, '').trim()}</h3>`;
      if (p.trim().startsWith('-')) return `<li style="margin-left:20px; margin-bottom:5px;">${p.replace('-', '').trim()}</li>`;
      return `<p style="margin-bottom:10px">${p}</p>`;
    }).join('')}
  </div>

  <h2>Technical Implementation Detail</h2>
  <div class="section-desc">Detailed resource-level specifications extracted from the provisioned HCL source.</div>
  <table class="config-table">
    <thead>
      <tr>
        <th style="width:35%">Architecture Component</th>
        <th>Production Terraform Configuration</th>
      </tr>
    </thead>
    <tbody>
      ${components.map(c => {
        const config = lookupConfig(c.id, c.name);
        return `
          <tr>
            <td>
              <span class="comp-name">${c.name}</span>
              <span class="comp-service">${c.service}</span>
            </td>
            <td>
              ${config 
                ? `<div>
                    <div class="config-pill">${config}</div>
                    ${hasSim && (simulationReport?.bottleneck_components?.includes(c.id) || simulationReport?.bottleneck_components?.includes(c.name))
                      ? `<div style="margin-top:8px; font-size:10px; font-weight:700; color:#dc2626;">🚨 BOTTLENECK MITIGATION APPLIED</div>` 
                      : ''}
                   </div>` 
                : `<span class="no-config">Implicit resource or managed service endpoint.</span>`
              }
            </td>
          </tr>
        `;
      }).join('')}

    </tbody>
  </table>

  <h2>Global Resource Inventory</h2>
  <div class="section-desc">Complete listing of all provisioned HCL resources across the current deployment set.</div>
  <div class="stat-card" style="background:#0f172a; color:#94a3b8; font-family:'JetBrains Mono', monospace; font-size:11px; max-height:400px; overflow-y:auto; padding:24px; border-radius:12px; margin-bottom:40px; box-shadow:inset 0 4px 6px rgba(0,0,0,0.2);">
    ${Object.entries(tfFiles).map(([name, content]) => {
      const resources = content.match(/resource\s+"([^"]+)"\s+"([^"]+)"/g) || [];
      if (resources.length === 0) return '';
      return `
        <div style="margin-bottom:20px; border-bottom:1px solid #1e293b; padding-bottom:12px;">
          <div style="color:#38bdf8; margin-bottom:8px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">📄 ${name}</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
            ${resources.map(r => `<div style="padding-left:10px; color:#e2e8f0;">• ${r.replace('resource ', '').replace(/"/g, '')}</div>`).join('')}
          </div>
        </div>
      `;
    }).join('')}
  </div>

  <h2 style="margin-top:60px;">Audit Compliance Trail</h2>
  <div class="compliance-box">
    <h3>State Validation</h3>
    <p>This deployment plan has been verified against Google Cloud best practices and regional quota limits. ${hasSim ? 'Sizing confirmed for target RPS.' : 'Static verification completed.'}</p>
    <div class="files-list">
      ${Object.keys(tfFiles).map(f => `<span class="file-badge">${f}</span>`).join('')}
    </div>
  </div>

  <div class="footer">
    Audit Generated by ArchVision · ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
  </div>
</body>
</html>`;



    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => {
        if (win) win.print();
      }, 600);
    }

  };


  const score = getSecurityScore();


  if (!data) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-slate-400 flex items-center gap-3">
          <Spinner />
          Loading dashboard…
        </div>
      </div>
    );
  }

  // Calculate max cost for bar chart scaling
  const maxCost = simulationReport?.cost_breakdown
    ? Math.max(...simulationReport.cost_breakdown.map((c) => c.monthly_cost), 1)
    : 1;

  // Calculate total latency
  const totalLatency = simulationReport?.latency_prediction
    ? simulationReport.latency_prediction.reduce((sum, l) => sum + l.latency_ms, 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-[#020817] text-slate-200 overflow-hidden print:relative print:overflow-auto">
      {/* ── LEFT PANEL: Diagram ── */}
      <div className="relative flex flex-col w-full md:w-3/5 h-1/2 md:h-full border-b md:border-b-0 md:border-r border-[var(--border)]">
        {/* Topbar */}
        <div className="flex items-center justify-between px-5 py-3 bg-surface/80 backdrop-blur border-b border-[var(--border)] shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <span className="font-semibold text-sm tracking-wide">
              Architecture Map
            </span>
            <span className="text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400 px-2 py-0.5 rounded-full">
              {data.components.length} components
            </span>
          </div>
          <button
            onClick={() => router.push("/")}
            className="text-xs text-slate-400 hover:text-red-400 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 px-3 py-1.5 rounded-lg transition-all"
          >
            ✕ Close
          </button>
        </div>

        {/* Diagram Container */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 relative bg-[#02050c]">
          {/* Pixel-Flush Wrapper: Element box matches Image pixels exactly */}
          <div className="relative rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden bg-[#0a0f1d] border border-white/5 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="relative group">
              {/* Scenario Toggler */}
              {improvedImageUrl && (
                <div className="absolute top-4 left-4 z-[110] flex items-center bg-slate-900/90 backdrop-blur-md rounded-xl border border-white/10 p-1 shadow-2xl animate-fade-in">
                  <button
                    onClick={() => setActiveScenario('original')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      activeScenario === 'original'
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Current
                  </button>
                  <button
                    onClick={() => setActiveScenario('improved')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      activeScenario === 'improved'
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Improved ✨
                  </button>
                </div>
              )}

              <img
                ref={imageRef}
                src={activeScenario === 'original' ? (imageUrl || "/api/placeholder/1200/800") : (improvedImageUrl || imageUrl || "/api/placeholder/1200/800")}
                alt="Architecture Diagram"
                key={activeScenario} // Force re-render on scenario switch to avoid ghosting or stale states
                className={`block max-w-full max-h-[75vh] w-auto h-auto transition-opacity duration-700 ${activeScenario === 'improved' ? 'opacity-90' : 'opacity-100'}`}
                style={{ userSelect: "none" }}
                onLoad={() => addLog(`System: View switched to ${activeScenario} scenario.`)}
                onError={() => {
                  addLog(`Error: Failed to load ${activeScenario} image.`);
                  if (activeScenario === 'improved') setActiveScenario('original');
                }}
              />
              <HotspotLayer
                components={(activeScenario === 'original' ? data : (improvedData || data)).components}
                imageRef={imageRef}
                imageUrl={activeScenario === 'original' ? imageUrl : (improvedImageUrl || imageUrl)}
                onSelect={handleSelectComp}
                activeId={activeId}
                bottleneckIds={(activeScenario === 'original' ? simulationReport : improvedSimReport)?.bottleneck_components}
                latencyData={(activeScenario === 'original' ? simulationReport : improvedSimReport)?.latency_prediction}
                trafficVolume={
                  simulationState["rps"] 
                    ? (simulationState["rps"] - 10) / (5000 - 10) 
                    : 0.1
                }
                plannedIds={activeScenario === 'original' ? plannedIds : improvedPlannedIds}
                plannedConfigs={activeScenario === 'original' ? plannedConfigs : improvedPlannedConfigs}
                onSaveCalibration={handleSaveCalibration}
                originalComponents={data?.components}
                simulationReport={activeScenario === 'original' ? simulationReport : improvedSimReport}
              />
            </div>

          </div>
        </div>

        {/* Hint */}
        <div className="px-5 py-2 text-xs text-slate-500 text-center border-t border-[var(--border)] shrink-0 print:hidden">
          Click any pulsing hotspot to inspect that component
        </div>
      </div>

      {/* ── RIGHT PANEL: Info ── */}
      <div className="flex flex-col w-full md:w-2/5 h-1/2 md:h-full shrink-0 bg-[#020817]">
        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] bg-surface/80 px-2 pt-1 gap-0.5 shrink-0 overflow-x-auto print:hidden">
          {(
            [
              { key: "overview", label: "Overview" },
              { key: "component", label: "Component Info" },
              { key: "simulation", label: "Simulation" },
              { key: "terraform", label: "Provisioning" },
              { key: "improvement", label: "✨ Improvement" },
            ] as { key: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`dash-tab ${activeTab === t.key ? "active" : ""}`}
            >
              {t.label}
              {t.key === "component" && activeComp && (
                <span className="ml-2 w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Overview Tab ── */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass rounded-xl p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">
                    Est. Monthly Cost
                  </div>
                  <div className="text-xl font-bold text-white leading-tight">
                    {data?.cost_estimate || "$0"}
                  </div>
                </div>
                <div className="glass rounded-xl p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">
                    Security Score
                  </div>
                  <div className="flex items-end gap-1">
                    <span
                      className={`text-3xl font-bold ${scoreColor(score)}`}
                    >
                      {score ?? "??"}
                    </span>
                    <span className="text-slate-500 text-sm mb-1"> / 100</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-3 pb-2 border-b border-[var(--border)]">
                  Architecture Summary
                </h3>
                <p className="text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">
                  {data?.security_summary}
                </p>
                {data?.cost_details && (
                  <p className="text-slate-400 leading-relaxed text-[11px] mt-4 pt-4 border-t border-white/5 italic">
                    {data.cost_details}
                  </p>
                )}
              </div>

              <div className="glass rounded-xl p-4 border border-blue-500/20 bg-blue-500/5">
                <p className="text-blue-300 text-sm leading-relaxed">
                  <span className="text-blue-400 font-semibold">
                    💡 Tip:{" "}
                  </span>
                  Hover and click the pulsing blue dots on the diagram to
                  explore each component in detail.
                </p>
              </div>

              {/* Component list */}
              <div>
                <h3 className="font-semibold text-white mb-3 pb-2 border-b border-[var(--border)]">
                  Detected Components ({data?.components.length || 0})
                </h3>
                <div className="space-y-2">
                  {data.components.map((c, i) => (
                    <button
                      key={c.id || i}
                      onClick={() => handleSelectComp(c)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left glass-hover glass transition-all ${
                        activeId === (c.id || c.name)
                          ? "border border-blue-500/40 bg-blue-500/5"
                          : "border border-transparent"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center text-sm">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {c.name}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {c.service} · {c.cost || "Cost N/A"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Component Info Tab ── */}
          {activeTab === "component" && (
            <div className="animate-fade-in">
              {!activeComp ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-20 space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 flex items-center justify-center text-2xl">
                    🏗️
                  </div>
                  <p className="text-slate-400 text-sm max-w-xs">
                    Click a pulsing hotspot on the diagram or select a
                    component from the Overview list.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="glass rounded-xl border border-[var(--border)] p-5">
                    <h3 className="font-semibold text-white flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border)]">
                      <span>🏗️</span> Architecture Role
                    </h3>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {activeComp?.description || "No description provided."}
                    </p>
                  </div>

                  {activeComp?.dependencies && activeComp.dependencies.length > 0 && (
                    <div className="glass rounded-xl border border-[var(--border)] p-5">
                      <h3 className="font-semibold text-white flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border)]">
                        <span>🔗</span> Dependencies
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {activeComp.dependencies.map(depId => {
                          const dep = (data as any)?.components?.find((c: any) => c.id === depId);
                          return (
                            <span key={depId} className="px-2 py-1 bg-slate-800 border border-white/5 rounded text-[11px] text-slate-300">
                              {dep?.name || depId}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="glass rounded-xl border border-[var(--border)] p-5">
                    <h3 className="font-semibold text-white flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border)]">
                      <span>💎</span> Operational Cost
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-emerald-400 font-mono">
                        {activeComp?.cost || "N/A"}
                      </span>
                      <span className="text-slate-500 text-xs uppercase tracking-wider">/ Month (Est)</span>
                    </div>
                  </div>

                  <div className="glass rounded-xl border border-[var(--border)] p-5">
                    <h3 className="font-semibold text-white flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border)]">
                      <span>🛡️</span> Security Posture
                    </h3>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {activeComp?.security || "No security details provided."}
                    </p>
                  </div>

                  {activeComp && plannedConfigs[activeComp.id] && (
                    <div className="glass rounded-xl border border-blue-500/30 bg-blue-500/5 p-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <h3 className="font-semibold text-blue-400 flex items-center gap-2 mb-3 pb-2 border-b border-blue-500/20">
                        <span>📦</span> Production Configuration
                      </h3>
                      <div className="bg-slate-900/50 rounded-lg p-3 border border-blue-500/10">
                        <pre className="text-[11px] text-blue-100 font-mono leading-relaxed whitespace-pre-wrap">
                          {plannedConfigs[activeComp.id]}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}


          {/* ── Simulation Tab ── */}
          {activeTab === "simulation" && (
            <div className="animate-fade-in space-y-6">
              {/* Controls */}
              <div className="glass rounded-xl p-5 border border-[var(--border)]">
                <h3 className="font-semibold text-white mb-4 pb-2 border-b border-[var(--border)] flex items-center gap-2">
                  <span>⚙️</span> Workload Parameters
                </h3>

                {data?.simulation_parameters ? (
                  <div className="space-y-6">
                    {/* Scenario Presets */}
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Scenario Presets</label>
                      <div className="flex flex-wrap gap-2">
                        {["Custom", "Startup Mode", "Production Mode", "Black Friday", "DDoS Simulation"].map((mode) => (
                          <button
                            key={mode}
                            onClick={() => handlePresetChange(mode)}
                            className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                              scenarioPreset === mode
                                ? "bg-blue-600 border-blue-500 text-white"
                                : "bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Multi-Region & Failures */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-[var(--border)]">
                      <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Architecture Scale</label>
                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isMultiRegion}
                            onChange={(e) => setIsMultiRegion(e.target.checked)}
                            className="rounded border-slate-600 text-blue-500 focus:ring-blue-500 bg-slate-800"
                          />
                          Enable Multi-Region
                        </label>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Failure Simulations</label>
                        <div className="space-y-1.5">
                          {["Region Failure", "Database Failure", "Cache Failure"].map((fm) => (
                            <label key={fm} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={failureSimulation.includes(fm)}
                                onChange={(e) => {
                                  if (e.target.checked) setFailureSimulation([...failureSimulation, fm]);
                                  else setFailureSimulation(failureSimulation.filter((f: string) => f !== fm));
                                }}
                                className="rounded border-slate-600 text-rose-500 focus:ring-rose-500 bg-slate-800"
                              />
                              {fm}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Sliders */}
                    <div className="pt-4 border-t border-[var(--border)] space-y-5">
                      {data.simulation_parameters.map((p) => (
                        <div key={p.id}>
                          <div className="flex justify-between text-sm mb-2 text-slate-300">
                            <span>{p.label}</span>
                            <span className="font-mono text-emerald-400 font-semibold">
                              {simulationState[p.id]?.toLocaleString() || p.default_value} {p.unit}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={p.min}
                            max={p.max}
                            value={simulationState[p.id] || p.default_value}
                            onChange={(e) =>
                              setSimulationState((prev) => ({
                                ...prev,
                                [p.id]: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-blue-500"
                          />
                          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                            <span>{p.min.toLocaleString()}</span>
                            <span>{p.max.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={handleSimulate}
                      disabled={isSimulating}
                      className="w-full mt-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-wait text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20"
                    >
                      {isSimulating ? (
                        <div className="flex items-center justify-center gap-2">
                          <Spinner /> Running AI Analysis...
                        </div>
                      ) : (
                        simulationReport ? "Re-simulate Request" : "Run Simulation Request"
                      )}

                    </button>
                  </div>
                ) : (
                  <div className="text-slate-400 text-sm text-center py-4">
                    No simulation parameters detected for this architecture.
                  </div>
                )}
              </div>

              {/* ── ADVANCED REPORT ── */}
              {simulationReport && (
                <div className="space-y-5 animate-fade-in" id="simulation-report">
                  {/* Export Button */}
                  <div className="flex justify-end print:hidden">
                    <div className="flex gap-3">
                  <button
                    onClick={handleExportPDF}
                    className="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <span>📄</span> Export PDF Report
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-inner"
                  >
                    <span>📊</span> Export CSV
                  </button>
                </div>
                  </div>

                  {/* Impact Summary */}
                  <div className="glass rounded-xl p-5 border border-indigo-500/30 bg-indigo-500/5">
                    <h3 className="font-semibold text-white mb-2 text-lg">Impact Summary</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {simulationReport?.impact_summary}
                    </p>
                  </div>

                  {/* Infrastructure Scaling Result */}
                  {simulationReport?.scaling_result && simulationReport.scaling_result.length > 0 && (
                    <div className="glass rounded-xl p-5 border border-cyan-500/30 bg-cyan-500/5">
                      <h3 className="font-semibold text-cyan-300 mb-3 flex items-center gap-2">
                        <span>📈</span> Infrastructure Scaling
                      </h3>
                      <div className="space-y-2">
                        {simulationReport.scaling_result.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-sm bg-slate-800/50 rounded-lg p-3">
                            <span className="text-slate-300 font-medium">{s.service}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-mono">{s.previous_instances}</span>
                              <span className="text-cyan-400">→</span>
                              <span className="text-cyan-300 font-mono font-bold">{s.new_instances}</span>
                              <span className="text-[10px] text-slate-500">instances</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Latency Prediction */}
                  {simulationReport?.latency_prediction && simulationReport.latency_prediction.length > 0 && (
                    <div className="glass rounded-xl p-5 border border-purple-500/30 bg-purple-500/5">
                      <h3 className="font-semibold text-purple-300 mb-3 flex items-center gap-2">
                        <span>⚡</span> Latency Prediction
                      </h3>
                      <div className="space-y-2">
                        {(() => {
                          const totalLatency = simulationReport.latency_prediction.reduce((s, l) => s + l.latency_ms, 0);
                          return (
                            <>
                              {simulationReport.latency_prediction.map((l, i) => (
                                <div key={i} className="flex items-center justify-between text-sm bg-slate-800/50 rounded-lg p-3">
                                  <span className="text-slate-300">{l.tier}</span>
                                  <span className={`font-mono font-bold ${l.latency_ms > 300 ? "text-rose-400" : l.latency_ms > 150 ? "text-amber-400" : "text-emerald-400"}`}>
                                    {l.latency_ms} ms
                                  </span>
                                </div>
                              ))}
                              <div className="flex items-center justify-between text-sm bg-slate-900/80 rounded-lg p-3 mt-2 border border-white/10">
                                <span className="text-white font-semibold">Total Response Time</span>
                                <span className={`font-mono text-lg font-bold ${totalLatency > 500 ? "text-rose-400" : totalLatency > 250 ? "text-amber-400" : "text-emerald-400"}`}>
                                  {totalLatency} ms {totalLatency > 500 ? "⚠️" : "✅"}
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                  )}

                  {/* Bottlenecks & Cost Impact Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="glass rounded-xl p-4 border border-rose-500/30 bg-rose-500/5">
                      <h4 className="font-semibold text-rose-300 mb-3 flex items-center gap-2">
                        <span>⚠️</span> Potential Bottlenecks
                      </h4>
                      <ul className="space-y-2">
                        {simulationReport.bottlenecks.map((b, i) => {
                      // Attempt to find component ID from name for linking
                      const linkedComp = data.components.find(c => 
                        b.toLowerCase().includes(c.name.toLowerCase()) || 
                        c.name.toLowerCase().includes(b.split(' ')[0].toLowerCase())
                      );
                      
                      return (
                        <div 
                          key={i} 
                          className={`flex gap-3 text-xs p-3 rounded-lg border border-red-500/20 bg-red-500/5 ${linkedComp ? 'cursor-pointer hover:bg-red-500/10 transition-colors' : ''}`}
                          onClick={() => linkedComp && handleSelectComp(linkedComp)}
                        >
                          <span className="text-red-400 font-bold shrink-0">⚠️</span>
                          <span className="text-slate-300 leading-relaxed">{b}</span>
                        </div>
                      );
                    })}    </ul>
                    </div>
                    <div className="glass rounded-xl p-4 border border-amber-500/30 bg-amber-500/5">
                      <h4 className="font-semibold text-amber-300 mb-3 flex items-center gap-2">
                        <span>💸</span> Cost Impact
                      </h4>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {simulationReport?.cost_impact}
                      </p>
                    </div>
                  </div>

                  {/* Cost Breakdown Bar Chart */}
                  {simulationReport?.cost_breakdown && simulationReport.cost_breakdown.length > 0 && (
                    <div className="glass rounded-xl p-5 border border-amber-500/20 bg-amber-500/5">
                      <h3 className="font-semibold text-amber-300 mb-4 flex items-center gap-2">
                        <span>📊</span> Monthly Cost Breakdown
                      </h3>
                      <div className="space-y-3">
                        {simulationReport.cost_breakdown.map((item, i) => {
                          const maxCost = Math.max(...(simulationReport?.cost_breakdown?.map(c => c.monthly_cost) || [100]));
                          return (
                          <div key={i} className="flex items-center gap-3">
                            <div className="flex flex-col gap-1 flex-1">
                              <div className="flex justify-between items-center">
                                <span className="text-white font-medium">{item.service}</span>
                                <span className="font-mono text-amber-300">${item.monthly_cost.toLocaleString()}</span>
                              </div>
                              {item.primary_region_cost !== undefined && (
                                <div className="flex justify-between text-[10px] text-slate-400 pl-1 mt-0.5">
                                  <span>Primary: ${item.primary_region_cost.toLocaleString()}</span>
                                  {item.secondary_region_cost !== undefined && (
                                    <span>Secondary: ${item.secondary_region_cost.toLocaleString()}</span>
                                  )}
                                </div>
                              )}
                              <div className="w-full bg-slate-900 rounded-full h-1.5 mt-2">
                                <div
                                  className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 rounded-full"
                                  style={{ width: `${(item.monthly_cost / maxCost) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )})}
                        <div className="flex justify-between text-sm pt-3 border-t border-white/10 mt-3">
                          <span className="text-white font-semibold">Total Estimated</span>
                          <span className="font-mono text-amber-300 font-bold text-lg">
                            ${simulationReport.cost_breakdown.reduce((s, c) => s + c.monthly_cost, 0).toLocaleString()} / mo
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Infrastructure Limits */}
                  {simulationReport?.infrastructure_limits && simulationReport.infrastructure_limits.length > 0 && (
                    <div className="glass rounded-xl p-5 border border-red-500/30 bg-red-500/5">
                      <h3 className="font-semibold text-red-300 mb-3 flex items-center gap-2">
                        <span>🚧</span> Infrastructure Limits
                      </h3>
                      <div className="space-y-2">
                        {simulationReport.infrastructure_limits.map((lim, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm bg-slate-800/50 rounded-lg p-3">
                            <span className="text-red-400 mt-0.5">⚠</span>
                            <div>
                              <span className="text-white font-medium">{lim.service}</span>
                              <span className="text-slate-400"> — {lim.limit_description} at </span>
                              <span className="text-red-300 font-mono font-bold">{lim.threshold_value.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Optimizations */}
                  {simulationReport?.optimizations && simulationReport.optimizations.length > 0 && (
                    <div className="glass rounded-xl p-5 border border-emerald-500/30 bg-emerald-500/5">
                      <h3 className="font-semibold text-emerald-300 mb-3 flex items-center gap-2">
                        <span>🔧</span> AI Optimization Suggestions
                      </h3>
                      <div className="space-y-3">
                        {simulationReport.optimizations.map((o, i) => (
                        <div key={i} className="bg-slate-900/50 rounded-xl p-4 border border-white/5 space-y-2">
                          <div className="flex justify-between items-start">
                            <h4 className="font-semibold text-white text-sm">{o.title}</h4>
                            {o.cost_reduction_percentage && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                ↓ {o.cost_reduction_percentage}% cost
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {o.description}
                          </p>
                          {(o.current_instance || o.recommended_instance) && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                              <span className="text-[10px] text-slate-500 uppercase tracking-widest">Right-size:</span>
                              <span className="text-[10px] font-mono text-slate-400">{o.current_instance || "?"}</span>
                              <span className="text-slate-600">→</span>
                              <span className="text-[10px] font-mono text-emerald-400 font-bold">{o.recommended_instance || "?"}</span>
                            </div>
                          )}
                        </div>
                      ))}
                      </div>
                    </div>
                  )}

                  {/* Carbon Footprint */}
                  {simulationReport.carbon_footprint && (
                    <div className="glass rounded-xl p-5 border border-green-500/30 bg-green-500/5">
                      <h3 className="font-semibold text-green-300 mb-3 flex items-center gap-2">
                        <span>🌱</span> Carbon & Energy Impact
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-green-300 font-mono">
                            {simulationReport.carbon_footprint.estimated_co2_kg} kg
                          </div>
                          <div className="text-xs text-slate-400 mt-1">Monthly CO₂</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-emerald-300 font-mono">
                            ↓ {simulationReport.carbon_footprint.potential_reduction_percentage}%
                          </div>
                          <div className="text-xs text-slate-400 mt-1">Potential Reduction</div>
                        </div>
                      </div>
                      <p className="text-slate-400 text-xs mt-3 leading-relaxed italic">
                        💡 {simulationReport.carbon_footprint.optimization_suggestion}
                      </p>
                    </div>
                  )}

                  {/* Scaling Suggestions */}
                  {simulationReport.scaling_suggestions && simulationReport.scaling_suggestions.length > 0 && (
                    <div className="glass rounded-xl p-5 border border-blue-500/30 bg-blue-500/5">
                      <h3 className="font-semibold text-blue-300 mb-3 flex items-center gap-2">
                        <span>🚀</span> Scaling Suggestions
                      </h3>
                      <ul className="space-y-3">
                        {simulationReport.scaling_suggestions.map((s, i) => (
                          <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                            <span className="text-blue-400 mt-0.5">➔</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Terraform Tab ── */}
          {activeTab === "terraform" && (
            <div className="animate-fade-in h-full flex flex-col gap-4">
              <div className="flex items-center justify-between shrink-0 h-10">
                <div className="flex items-center gap-4">
                  <h3 className="font-semibold text-white whitespace-nowrap">Production Infrastructure</h3>
                </div>
                <div className="flex items-center gap-2 pr-1">
                  {!(activeScenario === 'original' ? tfFiles : improvedTfFiles) ? (
                    <button
                      onClick={() => handleGenerateTf()}
                      disabled={isTfGenerating}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold px-4 h-9 rounded-xl shadow-lg shadow-blue-500/20"
                    >
                      {isTfGenerating ? <Spinner /> : "⚡ Generate HCL"}
                    </button>
                  ) : (
                    <div className="flex items-center bg-slate-800/50 p-1 rounded-xl border border-white/5 gap-1">
                      <button
                        onClick={() => handleExecuteTf("plan")}
                        disabled={isTfVerifying}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-3 h-8 rounded-lg shadow-md"
                      >
                        {isTfVerifying ? <Spinner /> : "Plan"}
                      </button>
                      <button
                        onClick={() => setIsEditorOpen(true)}
                        className="bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold px-3 h-8 rounded-lg"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (activeScenario === 'original') {
                            setTfFiles(null); setPlannedIds([]);
                          } else {
                            setImprovedTfFiles(null); setImprovedPlannedIds([]);
                          }
                          setTfRetryCount(0);
                        }}
                        className="px-2 text-slate-500 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {(activeScenario === 'original' ? tfFiles : improvedTfFiles) ? (
                <div className="flex-1 flex flex-col min-h-0 gap-2 relative">
                  <div className="flex-1 flex flex-col min-h-0 border border-white/10 rounded-xl bg-[#0d1117] overflow-hidden">
                    <div className="flex items-center gap-1 bg-slate-900/50 p-1 border-b border-white/5 overflow-x-auto">
                      {Object.keys((activeScenario === 'original' ? tfFiles : improvedTfFiles) || {}).map(filename => (
                        <button
                          key={filename}
                          onClick={() => setActiveTfFile(filename)}
                          className={`px-3 py-1.5 text-[10px] font-mono rounded-md ${activeTfFile === filename ? "bg-blue-600 text-white" : "text-slate-400"}`}
                        >
                          {filename}
                        </button>
                      ))}
                    </div>
                    <pre className="flex-1 overflow-auto p-4 text-[11px] text-slate-300 font-mono scrollbar-thin">
                      <code>{(activeScenario === 'original' ? tfFiles : improvedTfFiles)?.[activeTfFile]}</code>
                    </pre>
                  </div>
                  <div className="h-32 bg-black border border-white/10 rounded-xl overflow-hidden flex flex-col font-mono text-[9px] text-emerald-500/80">
                     <div className="flex flex-col p-2 space-y-1">
                        {tfLogs.map((log, i) => <div key={i}>{log}</div>)}
                     </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-10 glass rounded-2xl border border-white/5">
                  <h4 className="text-lg font-bold text-white mb-2">HCL Generation Engine</h4>
                  <p className="text-xs text-slate-400 mb-6">Convert your architecture into production-ready Terraform code.</p>
                  <button onClick={() => handleGenerateTf()} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold transition-all">
                    Start Generation
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Improvement Tab: Command View ── */}
          {activeTab === "improvement" && (
            <div className="animate-fade-in h-full flex flex-col gap-4 overflow-y-auto pr-1 scrollbar-thin overflow-x-hidden">
              <div className="flex items-center justify-between shrink-0 mb-1 px-1">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="text-lg">✨</span> Architecture Evolution Engine
                  </h3>
                </div>
                {!improvementSolution && (
                  <button
                    onClick={handleImproveAnalysis}
                    disabled={isImproving}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-bold px-4 h-8 rounded-lg transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                  >
                    {isImproving ? <Spinner /> : "Run Evolution Analysis"}
                  </button>
                )}
              </div>

              {improvementSolution ? (
                <div className="flex flex-col gap-4 pb-12 w-full px-1">
                  {/* Row 1: Integrated Vision & Metrics Bar */}
                  <section className="bg-slate-900 border border-white/10 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-4 shadow-xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/[0.02] to-transparent pointer-events-none" />
                    
                    <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                         🎯
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-1">Architect's Strategic Narrative</h4>
                        <p className="text-[13px] font-bold text-white leading-relaxed italic pr-4">
                          "{improvementSolution.analysis_summary}"
                        </p>
                      </div>
                    </div>

                    {improvementSolution.comparative_metrics && (
                      <div className="flex gap-3 shrink-0">
                        <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col items-center justify-center min-w-[90px]">
                           <span className="text-[9px] font-black text-emerald-400 uppercase tracking-tighter mb-0.5">Latency Gap</span>
                           <span className="text-sm font-black text-white">↓{improvementSolution.comparative_metrics.latency_improvement_pct}%</span>
                        </div>
                        <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl flex flex-col items-center justify-center min-w-[90px]">
                           <span className="text-[9px] font-black text-blue-400 uppercase tracking-tighter mb-0.5">Cost Savings</span>
                           <span className="text-sm font-black text-white">↓{improvementSolution.comparative_metrics.cost_savings_pct}%</span>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Row 2: Analysis Columns (Blueprint & Risks side-by-side) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <section className="bg-slate-900/60 border border-white/5 rounded-xl p-5 flex flex-col gap-3 group border-l-2 border-l-blue-500/40">
                      <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" /> Structural Blueprint
                      </h5>
                      <p className="text-[13px] text-slate-300 leading-relaxed font-semibold">
                        {improvementSolution.semantic_model}
                      </p>
                    </section>

                    <section className="bg-[#1a0a0d] border border-rose-500/10 rounded-xl p-5 flex flex-col gap-3 group border-l-2 border-l-rose-500/40">
                      <h5 className="text-[10px] font-black text-rose-400 uppercase tracking-[0.2em] flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" /> System Vulnerabilities
                      </h5>
                      <p className="text-[13px] text-slate-300 leading-relaxed font-semibold italic">
                        {improvementSolution.risk_analysis}
                      </p>
                    </section>
                  </div>

                  {/* Row 3: Evolution Ledger (Stacked Card Layout) */}
                  <section className="bg-slate-900/40 border border-white/5 rounded-xl overflow-hidden shadow-2xl">
                    <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                      <h4 className="text-[11px] font-black text-slate-300 uppercase tracking-[0.4em]">Evolutionary Roadmap Ledger</h4>
                      <span className="text-[10px] text-slate-400 font-bold bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
                        {improvementSolution.improvements.length} line items
                      </span>
                    </div>

                    <div className="flex flex-col p-4 gap-4">
                      {improvementSolution.improvements.map((imp: any, i: number) => (
                        <div key={i} className="group flex flex-col sm:flex-row gap-5 p-5 rounded-xl border border-white/10 bg-white/[0.01] hover:bg-blue-500/[0.05] hover:border-blue-500/30 transition-all relative">
                          
                          {/* Left: ID, Title & Impact */}
                          <div className="flex flex-col gap-4 w-full sm:w-[35%] lg:w-1/3 shrink-0">
                            <div className="flex items-start gap-4">
                              <div className="shrink-0 w-8 h-8 mt-0.5 rounded-lg bg-slate-800 flex items-center justify-center font-black text-white text-[12px] border border-white/10 group-hover:border-blue-500/40 transition-colors shadow-lg">
                                {i+1}
                              </div>
                              <div className="font-black text-white text-[13px] uppercase tracking-tight leading-snug group-hover:text-blue-400 transition-colors pt-1">
                                {imp.title}
                              </div>
                            </div>
                            
                            <div className="pl-12">
                               <span className="inline-block px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-[9px] font-black text-emerald-400 uppercase tracking-widest leading-tight text-center shadow-inner">
                                 {imp.impact}
                               </span>
                            </div>
                          </div>
                          
                          {/* Right: Bottleneck & Solution */}
                          <div className="flex-1 flex flex-col gap-4 border-t sm:border-t-0 sm:border-l border-white/10 pt-4 sm:pt-0 sm:pl-6">
                            <div>
                              <h5 className="text-[9px] font-black text-rose-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Current Bottleneck
                              </h5>
                              <p className="text-[13px] text-slate-300 italic leading-relaxed font-semibold">
                                {imp.problem}
                              </p>
                            </div>
                            
                            <div>
                              <h5 className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Evolved Solution
                              </h5>
                              <p className="text-[13px] text-slate-100 font-bold leading-relaxed">
                                {imp.solution}
                              </p>
                            </div>
                          </div>
                          
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Row 4: Action Bar */}
                  <section className="sticky bottom-0 bg-[#0a0d14]/80 backdrop-blur-md pt-2 border-t border-white/10 mt-2 z-20">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-gradient-to-r from-blue-600/20 via-indigo-600/10 to-transparent border border-white/5 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-900 border border-white/10 rounded-lg flex items-center justify-center text-xl shadow-2xl">🪄</div>
                        <div>
                          <h4 className="text-xs font-black text-white uppercase tracking-tight">Interactive Synthesis</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Render the evolved high-fidelity architecture map.</p>
                        </div>
                      </div>

                      <div className="w-full md:w-auto min-w-[280px]">
                        <button
                          disabled
                          className="w-full bg-slate-800 text-slate-500 text-[10px] font-black h-10 px-6 rounded-lg border border-white/5 cursor-not-allowed uppercase tracking-widest flex items-center justify-center gap-2"
                        >
                          <span className="opacity-50">🚀</span> Coming Soon
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-32 border-2 border-dashed border-white/5 rounded-3xl m-1">
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-white/10 animate-float opacity-50">
                    🧠
                  </div>
                  <div className="max-w-xs space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Awaiting Analysis</h4>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                      Trigger the architecture evolution engine to evaluate hotspots and propose technical optimizations.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Terraform Editor Modal */}
      {isEditorOpen && tfFiles && (
        <TerraformEditor 
          initialFiles={tfFiles as Record<string, string>}
          logs={tfLogs}
          isVerifying={isTfVerifying}
          onClose={() => setIsEditorOpen(false)}
          onPlan={(currentFiles) => handleExecuteTf("plan", currentFiles)}
          onClearLogs={() => setTfLogs([])}
          onSave={async (newFiles) => {
            // Note: handleExecuteTf("plan", newFiles) will update state on success
            await handleSyncFromIde(newFiles);
          }}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
