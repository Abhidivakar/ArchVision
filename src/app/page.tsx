"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { generateDoc, generateInteractive } from "@/lib/api";
import { playSuccessSound } from "@/lib/audio";
import { requestNotificationPermission, sendNotification } from "@/lib/notifications";
import { useEffect } from "react";


const DOC_TYPES = ["Standard", "Business", "Technical", "Executive"];
const ENVIRONMENTS = ["Development", "Staging", "Production"];

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [docType, setDocType] = useState("Standard");
  const [environment, setEnvironment] = useState("Development");
  const [loading, setLoading] = useState<"docx" | "interactive" | null>(null);
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

  const handleGenerateDoc = async () => {
    if (!file) return;
    setLoading("docx");
    setError(null);
    try {
      const blob = await generateDoc(file, docType, environment);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `Architecture_${docType}_${environment}.docx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      sendNotification("Document Generated", `Your ${docType} documentation is ready for download.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate document");
    } finally {
      setLoading(null);
    }
  };

  const handleInteractive = async () => {
    if (!file) return;
    setLoading("interactive");
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
      const data = await generateInteractive(file);
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
        JSON.stringify({ data, imageUrl, filename: file.name })
      );
      playSuccessSound();
      sendNotification("Analysis Complete", `Architecture analysis for ${file.name} is finished.`);
      router.push("/dashboard");

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to analyze diagram");
      setLoading(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <div className="text-center mb-12 animate-slide-up">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-4 py-1.5 text-blue-400 text-xs font-semibold uppercase tracking-widest mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Powered by Gemini 2.5 Flash Vision
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4 bg-gradient-to-br from-white via-blue-100 to-blue-400 bg-clip-text text-transparent">
          ArchVision
        </h1>
        <p className="text-slate-400 text-lg max-w-lg mx-auto leading-relaxed">
          Upload your cloud architecture diagram and instantly unlock cost
          analysis, security scoring, interactive hotspots, and Terraform
          skeletons.
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-2xl glass rounded-2xl p-8 shadow-2xl animate-fade-in">
        {/* File Drop Zone */}
        <div
          className={`
            border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer
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

        {/* Options */}
        <div className="grid grid-cols-2 gap-6 mt-8">
          {/* Doc Type */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-3">
              Document Type
            </label>
            <div className="flex flex-wrap gap-2">
              {DOC_TYPES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDocType(d)}
                  className={`select-btn ${docType === d ? "active" : ""}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Environment */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-3">
              Environment
            </label>
            <div className="flex gap-2">
              {ENVIRONMENTS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEnvironment(e)}
                  className={`select-btn ${environment === e ? "active" : ""}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
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

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button
            onClick={handleInteractive}
            disabled={!file || loading !== null}
            className="flex-1 relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg group"
            style={{
              boxShadow:
                file && !loading
                  ? "0 0 30px rgba(59,130,246,0.3)"
                  : undefined,
            }}
          >
            {loading === "interactive" ? (
              <>
                <Spinner />
                <span>Analyzing diagram...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <span>Interactive Dashboard</span>
              </>
            )}
          </button>

          <button
            onClick={handleGenerateDoc}
            disabled={!file || loading !== null}
            className="flex-1 btn-secondary disabled:opacity-40 disabled:cursor-not-allowed py-4"
          >
            {loading === "docx" ? (
              <>
                <Spinner />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>Generate .docx</span>
              </>
            )}
          </button>
        </div>

        {/* Footer hint */}
        <p className="text-center text-slate-500 text-xs mt-6">
          Your diagrams are analyzed privately. No data is stored.
        </p>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-3 mt-10 animate-fade-in">
        {[
          "💰 Cost Analysis",
          "🛡️ Security Scoring",
          "🗺️ Interactive Hotspots",
          "🏗️ Terraform Skeletons",
          "📄 Word Documentation",
        ].map((f) => (
          <span
            key={f}
            className="text-xs text-slate-400 bg-white/5 border border-white/10 rounded-full px-3 py-1.5"
          >
            {f}
          </span>
        ))}
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
