"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ArchComponent, InteractiveResponse, SimulationReport } from "@/lib/types";
import HotspotLayer from "@/components/HotspotLayer";
import { runSimulation } from "@/lib/api";

type Tab = "overview" | "component" | "simulation" | "terraform";

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

  // Advanced Phase 6 Simulation State
  const [scenarioPreset, setScenarioPreset] = useState<string>("Custom");
  const [failureSimulation, setFailureSimulation] = useState<string[]>([]);
  const [isMultiRegion, setIsMultiRegion] = useState<boolean>(false);

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
  }, [router]);

  const handleSelectComp = (comp: ArchComponent) => {
    setActiveComp(comp);
    setActiveId(comp.id || comp.name);
    setSliderVal(1);
    setActiveTab("component");
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
    if (!data) return;
    setIsSimulating(true);
    try {
      const res = await runSimulation(
        data,
        simulationState,
        scenarioPreset,
        failureSimulation,
        isMultiRegion
      );
      setSimulationReport(res.report);
    } catch (err: any) {
      alert(err.message || "Simulation failed");
    } finally {
      setIsSimulating(false);
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
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 relative">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Architecture Diagram"
              className="block max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
              style={{ userSelect: "none" }}
            />
            <HotspotLayer
              components={data.components}
              imageRef={imageRef}
              onSelect={handleSelectComp}
              activeId={activeId}
              bottleneckIds={simulationReport?.bottleneck_components}
              latencyData={simulationReport?.latency_prediction}
              trafficVolume={
                simulationState["rps"] 
                  ? (simulationState["rps"] - 10) / (5000 - 10) 
                  : 0.1
              }
            />
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
              { key: "simulation", label: "Traffic Simulation" },
              { key: "terraform", label: "Terraform Code" },
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
                    {data.cost_estimate}
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
                  {data.security_summary}
                </p>
                {data.cost_details && (
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
                  Detected Components ({data.components.length})
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
                  <div>
                    <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full">
                      {activeComp.service}
                    </span>
                    <h2 className="text-xl font-bold text-white mt-2">
                      {activeComp.name}
                    </h2>
                    <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                      {activeComp.description || "No description provided."}
                    </p>
                  </div>

                  {/* Cost Calculator */}
                  <div className="glass rounded-xl border border-[var(--border)] p-5 space-y-4">
                    <h3 className="font-semibold text-white flex items-center gap-2 pb-2 border-b border-[var(--border)]">
                      <span>💰</span> Cost Calculator
                    </h3>
                    <div className="flex justify-between items-center text-sm">
                       <span className="text-slate-400">Base Estimate:</span>
                      <span className="font-mono text-white">
                        {activeComp.cost || "N/A"}
                      </span>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-2">
                        <span>Traffic Multiplier</span>
                        <span className="text-emerald-400 font-mono font-semibold">
                          {sliderVal}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={sliderVal}
                        onChange={(e) =>
                          setSliderVal(Number(e.target.value))
                        }
                        className="w-full accent-emerald-500"
                      />
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-emerald-300 text-sm font-semibold">
                      Scaled Cost: {scaledCost(activeComp, sliderVal)}
                    </div>
                  </div>

                  {/* Security */}
                  <div className="glass rounded-xl border border-[var(--border)] p-5">
                    <h3 className="font-semibold text-white flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border)]">
                      <span>🛡️</span> Security Posture
                    </h3>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {activeComp.security || "No security details provided."}
                    </p>
                  </div>
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

                {data.simulation_parameters ? (
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
                        "Run Simulation Request"
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
                      {simulationReport.impact_summary}
                    </p>
                  </div>

                  {/* Infrastructure Scaling Result */}
                  {simulationReport.scaling_result && simulationReport.scaling_result.length > 0 && (
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
                  {simulationReport.latency_prediction && simulationReport.latency_prediction.length > 0 && (
                    <div className="glass rounded-xl p-5 border border-purple-500/30 bg-purple-500/5">
                      <h3 className="font-semibold text-purple-300 mb-3 flex items-center gap-2">
                        <span>⚡</span> Latency Prediction
                      </h3>
                      <div className="space-y-2">
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
                        {simulationReport.cost_impact}
                      </p>
                    </div>
                  </div>

                  {/* Cost Breakdown Bar Chart */}
                  {simulationReport.cost_breakdown && simulationReport.cost_breakdown.length > 0 && (
                    <div className="glass rounded-xl p-5 border border-amber-500/20 bg-amber-500/5">
                      <h3 className="font-semibold text-amber-300 mb-4 flex items-center gap-2">
                        <span>📊</span> Monthly Cost Breakdown
                      </h3>
                      <div className="space-y-3">
                        {simulationReport.cost_breakdown.map((item, i) => (
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
                        ))}
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
                  {simulationReport.infrastructure_limits && simulationReport.infrastructure_limits.length > 0 && (
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
                  {simulationReport.optimizations && simulationReport.optimizations.length > 0 && (
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
            <div className="animate-fade-in h-full flex flex-col">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h3 className="font-semibold text-white">main.tf skeleton</h3>
                <button
                  onClick={copyTerraform}
                  className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-all"
                >
                  {copied ? "✓ Copied!" : "📋 Copy"}
                </button>
              </div>
              <div className="flex-1 border border-[var(--border)] rounded-xl bg-[#0d1117] overflow-hidden min-h-0">
                <pre className="h-full overflow-auto p-4 code-block text-slate-300 leading-relaxed">
                  <code>{data.terraform_skeleton}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
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
