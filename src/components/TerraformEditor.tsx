"use client";

import { useState, useEffect, useRef } from "react";

interface TerraformEditorProps {
  initialFiles: Record<string, string>;
  onSave: (files: Record<string, string>) => void;
  onClose: () => void;
  logs: string[];
  onPlan: (files: Record<string, string>) => void;
  onClearLogs: () => void;
  isVerifying: boolean;
}

export default function TerraformEditor({
  initialFiles,
  onSave,
  onClose,
  logs,
  onPlan,
  onClearLogs,
  isVerifying,
}: TerraformEditorProps) {
  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [activeFile, setActiveFile] = useState<string>(Object.keys(initialFiles)[0] || "main.tf");
  const [isDirty, setIsDirty] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const handleFileChange = (content: string) => {
    setFiles((prev) => ({ ...prev, [activeFile]: content }));
    setIsDirty(true);
  };

  const handleSaveAndPlan = () => {
    onSave(files);
    onPlan(files);
    setIsDirty(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 animate-fade-in">
      <div className="w-full h-full max-w-7xl bg-[#0d1117] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
        {/* IDE Header */}
        <div className="h-14 bg-[#161b22] border-b border-white/5 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="h-4 w-px bg-white/10 mx-2" />
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <span className="text-blue-400">Terraform IDE</span>
              <span className="text-slate-500 font-normal"> — Production Sandbox</span>
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onPlan(files)}
              disabled={isVerifying}
              className={`flex items-center gap-2 h-9 px-5 rounded-xl text-xs font-bold transition-all shadow-lg ${
                isDirty 
                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20" 
                : "bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30"
              }`}
            >
              {isVerifying ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="text-sm">⚡</span>
              )}
              {isDirty ? "Save & Plan" : "Run Plan"}
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
            >
              <span className="text-2xl font-light">×</span>
            </button>
          </div>
        </div>

        {/* IDE Layout */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar / Explorer */}
          <div className="w-64 bg-[#0d1117] border-r border-white/5 flex flex-col shrink-0">
            <div className="p-4">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Explorer</h3>
              <div className="space-y-1">
                {Object.keys(files).map((filename) => (
                  <button
                    key={filename}
                    onClick={() => setActiveFile(filename)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all group ${
                      activeFile === filename
                        ? "bg-blue-600/10 text-blue-400 border border-blue-500/20"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    <span className={activeFile === filename ? "text-blue-400" : "text-slate-500 group-hover:text-slate-400"}>
                      {filename.endsWith(".tfvars") ? "⚙️" : "📄"}
                    </span>
                    <span className="truncate">{filename}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Editor & Terminal Area */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117]">
            {/* Editor */}
            <div className="flex-1 relative flex flex-col min-h-0">
              <div className="flex items-center gap-1 bg-[#161b22] px-3 border-b border-white/5 overflow-x-auto shrink-0">
                {Object.keys(files).map((filename) => (
                  <div
                    key={filename}
                    className={`relative group h-10 flex items-center min-w-[120px] px-4 cursor-pointer text-xs font-mono transition-all border-b-2 ${
                      activeFile === filename
                        ? "text-blue-400 border-blue-500 bg-[#0d1117]"
                        : "text-slate-500 border-transparent hover:text-slate-300"
                    }`}
                    onClick={() => setActiveFile(filename)}
                  >
                    <span>{filename}</span>
                    {activeFile === filename && isDirty && (
                      <span className="ml-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </div>
                ))}
              </div>
              <textarea
                value={files[activeFile]}
                onChange={(e) => handleFileChange(e.target.value)}
                spellCheck={false}
                className="flex-1 bg-[#0d1117] text-slate-300 p-6 font-mono text-[13px] leading-relaxed resize-none focus:outline-none scrollbar-thin scrollbar-thumb-white/10"
                placeholder="# Edit your Terraform HCL here..."
              />
            </div>

            {/* Bottom Terminal */}
            <div className="h-64 bg-black border-t border-white/10 flex flex-col shrink-0">
              <div className="h-10 bg-[#161b22] border-b border-white/5 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Output / Terminal</span>
                  <div className="flex items-center gap-2 h-6 px-2 bg-emerald-500/10 rounded border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-tight">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </div>
                </div>
                <button 
                   onClick={onClearLogs}
                   className="text-[9px] font-bold text-slate-500 hover:text-slate-300 uppercase underline decoration-slate-600 underline-offset-4"
                >
                  Clear Terminal
                </button>
              </div>
              <div 
                ref={terminalRef}
                className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed space-y-1.5 scrollbar-thin scrollbar-thumb-white/10"
              >
                {logs.length === 0 ? (
                  <div className="text-slate-700 italic">Waiting for command output...</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="flex gap-4">
                      <span className="text-slate-600 shrink-0 select-none">[{i + 1}]</span>
                      <span className={log.includes("Error") ? "text-red-400" : log.includes("Success") || log.includes("successful") ? "text-emerald-400" : "text-slate-300 opacity-80"}>
                        {log}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* IDE Footer */}
        <div className="h-8 bg-blue-600 flex items-center justify-between px-4 text-[10px] text-white/90 shrink-0">
          <div className="flex items-center gap-6">
            <span className="font-bold tracking-tight flex items-center gap-1.5">
              <span className="text-xs">✓</span> Ready
            </span>
            <span className="opacity-70">Region: us-central1</span>
            <span className="opacity-70">Provider: google v4.50.0</span>
          </div>
          <div className="flex items-center gap-6">
            <span>UTF-8</span>
            <span>Terraform HCL</span>
            <span className="font-bold">ArchVision Sync v1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
