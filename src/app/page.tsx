"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateInteractive } from "@/lib/api";
import { playSuccessSound } from "@/lib/audio";
import { requestNotificationPermission, sendNotification } from "@/lib/notifications";
import type { CloudProvider } from "@/lib/types";
import Link from "next/link";

const CLOUD_PROVIDERS: CloudProvider[] = ["GCP", "AWS", "Azure"];

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [provider, setProvider] = useState<CloudProvider>("GCP");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setError(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const handleInteractive = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const isVector = file.name.endsWith(".svg") || file.name.endsWith(".drawio") || file.name.endsWith(".xml");
      let vectorNodes: any[] = [];

      if (isVector) {
        const { parseVectorFile } = await import("@/lib/vectorParser");
        vectorNodes = await parseVectorFile(file);
        console.log("Extracted Vector Nodes:", vectorNodes);
      }

      // Still call Gemini for the "Intelligence" layer
      // For SVG, we can send it as-is or rasterize. generateInteractive handles the file.
      const data = await generateInteractive(file, provider);
      // Convert file to Data URL for persistence across refreshes
      const reader = new FileReader();
      const imageUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // HYBRID MERGE: If we have vector nodes, try to match them with Gemini's components
      // to provide 100% precise coordinates.
      if (isVector && vectorNodes.length > 0) {
        data.components = data.components.map(comp => {
          // Try to find a matching node by name or service type
          const match = vectorNodes.find(vn =>
            vn.name.toLowerCase().includes(comp.name.toLowerCase()) ||
            comp.name.toLowerCase().includes(vn.name.toLowerCase()) ||
            vn.id.toLowerCase() === comp.id.toLowerCase()
          );

          if (match) {
            return {
              ...comp,
              box_2d: match.box_2d,
              id: match.id || comp.id // Use vector ID if available
            };
          }
          return comp;
        });
      }

      sessionStorage.setItem(
        "archData",
        JSON.stringify({ data, imageUrl, filename: file.name, provider })
      );
      playSuccessSound();
      sendNotification("Analysis Complete", `Architecture analysis for ${file.name} is finished.`);
      router.push("/dashboard");

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to analyze diagram");
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 relative overflow-hidden">
      {/* Ambient Deep Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/20 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-emerald-600/20 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />

      {/* Main Split Grid */}
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center z-10">

        {/* Left: The Pitch */}
        <div className="flex flex-col items-start text-left animate-slide-right lg:mt-[-4rem]">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-4 py-1.5 text-blue-400 text-xs font-semibold uppercase tracking-widest mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Powered by Gemini 2.5 Pro
          </div>
          <h1 className="text-6xl md:text-[5.5rem] font-bold tracking-tight mb-6 bg-gradient-to-br from-white via-blue-100 to-blue-400 bg-clip-text text-transparent leading-[1.1]">
            ArchVision
          </h1>
          <p className="text-slate-400 text-xl max-w-xl leading-relaxed mb-8">
            Upload your SaaS diagram and instantly unlock AI-driven cost analysis, security scoring, interactive hotspots, and production-ready Terraform provisioning.
          </p>

          {/* Feature Pills */}
          <div className="flex flex-wrap gap-3 animate-fade-in delay-200">
            {[
              "💰 Cost Analysis",
              "🛡️ Security Scoring",
              "🗺️ Interactive Hotspots",
              "🏗️ Terraform Skeletons",
              "📄 Word Documentation",
            ].map((f) => (
              <span
                key={f}
                className="text-sm font-medium text-slate-300 bg-white/5 border border-white/10 rounded-full px-4 py-2 hover:bg-white/10 transition-colors cursor-default"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Right: The Engine (Main Card) */}
        <div className="w-full glass rounded-3xl p-6 md:p-8 shadow-2xl border border-white/10 bg-slate-900/40 backdrop-blur-2xl animate-slide-left relative overflow-hidden group">
          {/* Subtle card inner glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          {/* File Drop Zone */}
          <div
            className={`
            border-2 border-dashed rounded-xl p-6 md:p-8 flex flex-col items-center justify-center text-center cursor-pointer
            transition-all duration-300
            ${dragOver
                ? "border-blue-400 bg-blue-500/10 scale-[1.01]"
                : file
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-[var(--border)] hover:border-blue-500/40 hover:bg-blue-500/5"
              }
          `}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,application/pdf,.docx,.drawio,.xml"
              className="hidden"
              onChange={onFileChange}
            />

            {file ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-emerald-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-white text-lg">{file.name}</p>
                  <p className="text-slate-400 text-sm mt-1">
                    {formatSize(file.size)} &middot; Click or drag to replace
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-semibold text-lg mb-1">
                    Drag & drop your diagram
                  </p>
                  <p className="text-slate-400 text-sm">
                    Supports PNG, JPG, SVG, and Draw.io (.drawio, .xml)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Global Configuration */}
          <div className="flex flex-col gap-4 mt-6 border-t border-slate-800/60 pt-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest w-36 shrink-0">
                Cloud Provider
              </label>
              <div className="flex flex-wrap gap-2">
                {CLOUD_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`select-btn ${provider === p ? "active" : ""}`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0 p-1 shadow-inner">
                      <img
                        src={`/${p.toLowerCase()}.png`}
                        alt={p}
                        className={`w-full h-full object-contain transition-all duration-300 ${provider === p ? "scale-110" : "opacity-90 hover:opacity-100"}`}
                      />
                    </div>
                    <span className="truncate">{p}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="mt-6 flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-4 text-sm animate-fade-in">
              <svg
                className="w-5 h-5 mt-0.5 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {error}
            </div>
          )}

          {/* Distributed Action Zones */}
          <div className="mt-6 space-y-4">

            {/* Action 1: Interactive Analysis */}
            <div className="p-4 border border-blue-500/20 bg-blue-500/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slide-up">
              <div>
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Interactive Analysis
                </h3>
                <p className="text-slate-400 text-sm mt-1">Unlock AI cost modeling, security hotspots, and Terraform.</p>
              </div>

              <button
                onClick={handleInteractive}
                disabled={!file || loading}
                className="w-full sm:w-auto relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg group shrink-0"
                style={{
                  boxShadow:
                    file && !loading
                      ? "0 0 30px rgba(59,130,246,0.3)"
                      : undefined,
                }}
              >
                {loading ? (
                  <>
                    <Spinner />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2-2h-2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Launch Dashboard</span>
                  </>
                )}
              </button>
            </div>

            {/* Action 2: Diagram Builder */}
            <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div>
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Diagram Builder
                </h3>
                <p className="text-slate-400 text-sm mt-1">Design with a professional draw.io editor, generate diagrams with AI, then analyze.</p>
              </div>

              <Link
                href="/builder"
                className="w-full sm:w-auto relative overflow-hidden bg-white/5 hover:bg-white/10 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg group shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Open Builder</span>
              </Link>
            </div>

          </div>

          {/* Footer hint */}
          <p className="text-center text-slate-500 text-xs mt-6">
            Your diagrams are analyzed privately. No data is stored.
          </p>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-4 h-4 shrink-0"
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
