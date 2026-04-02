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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    requestNotificationPermission();
    // Check initial theme
    if (document.documentElement.classList.contains("dark")) {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    setTheme(newTheme);
  };

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
      }

      const data = await generateInteractive(file, provider);
      const reader = new FileReader();
      const imageUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      if (isVector && vectorNodes.length > 0) {
        data.components = data.components.map(comp => {
          const match = vectorNodes.find(vn =>
            vn.name.toLowerCase().includes(comp.name.toLowerCase()) ||
            comp.name.toLowerCase().includes(vn.name.toLowerCase()) ||
            vn.id.toLowerCase() === comp.id.toLowerCase()
          );

          if (match) {
            return {
              ...comp,
              box_2d: match.box_2d,
              id: match.id || comp.id
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
    <div className="min-h-screen bg-grid flex flex-col relative w-full overflow-hidden">
      {/* Minimal Header */}
      <header className="w-full h-16 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-[1.5px] border-primary flex items-center justify-center relative">
            <div className="w-2 h-2 bg-primary"></div>
            {/* Tech accents */}
            <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-foreground opacity-50"></div>
            <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-foreground opacity-50"></div>
          </div>
          <span className="font-mono font-medium text-lg tracking-tight">ArchVision</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="p-2 text-slate-500 hover:text-foreground transition-colors rounded-md border border-transparent hover:border-border">
            {theme === "dark" ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
             )}
          </button>
          <Link href="/builder" className="btn-secondary py-1.5 px-4 text-sm code-block">
            /dev/builder
          </Link>
        </div>
      </header>

      {/* Main Content Area - True Landscape First */}
      <main className="flex-1 flex flex-col lg:flex-row w-full items-stretch relative">
        {/* Left Side: Copy & Actions */}
        <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-center px-8 lg:px-16 xl:px-24 py-12 lg:py-0 border-b lg:border-b-0 lg:border-r border-border bg-background/50 z-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 border border-primary/30 text-primary bg-primary/5 rounded-full px-3 py-1 text-xs font-mono font-medium uppercase tracking-wider mb-6 w-fit">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            AI Infrastructure Engine
          </div>
          <h1 className="text-4xl md:text-5xl xl:text-6xl font-semibold tracking-tight mb-4 leading-[1.1]">
            Deploy with <br/> Absolute Precision.
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg md:text-xl font-light mb-8 max-w-lg">
            Upload architecture diagrams. Instantly generate cost models, security overlays, and production-ready Terraform.
          </p>
          
          {/* Tech Spec List */}
          <div className="flex flex-col gap-2 font-mono text-sm text-slate-500 dark:text-slate-400 mb-6 border-l border-border pl-4">
            <div className="flex items-center gap-2"><span className="text-primary">&gt;</span> Cost Analysis Engine v2</div>
            <div className="flex items-center gap-2"><span className="text-primary">&gt;</span> Security Posture Scoring</div>
            <div className="flex items-center gap-2"><span className="text-primary">&gt;</span> Diagram to Terraform Compiler</div>
          </div>


        </div>

        {/* Right Side: The Engine / Dropzone */}
        <div className="w-full lg:w-[55%] xl:w-[60%] flex items-center justify-center p-4 md:p-8 xl:p-12 relative bg-surface/30 z-10">
           {/* Tech Corners */}
           <div className="absolute top-8 left-8 w-4 h-4 border-t border-l border-primary/40 hidden md:block"></div>
           <div className="absolute top-8 right-8 w-4 h-4 border-t border-r border-primary/40 hidden md:block"></div>
           <div className="absolute bottom-8 left-8 w-4 h-4 border-b border-l border-primary/40 hidden md:block"></div>
           <div className="absolute bottom-8 right-8 w-4 h-4 border-b border-r border-primary/40 hidden md:block"></div>

           <div className="w-full max-w-2xl bg-surface border border-border shadow-sm p-4 md:p-5 animate-slide-up relative">
             {/* Fake window controls to look like a terminal/tool */}
             <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-border"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-border"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-border"></div>
                <div className="ml-auto text-xs font-mono text-slate-400 uppercase tracking-widest">Input.sys</div>
             </div>

             {/* File Drop Zone */}
             <div
              className={`
              relative w-full border border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-colors overflow-hidden
              ${dragOver
                  ? "border-primary bg-primary/5 p-6 md:p-8"
                  : file
                    ? "border-emerald-500/40 bg-emerald-500/5 p-1"
                    : "border-border hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 p-6 md:p-8"
                }
            `}
              style={{ minHeight: file ? '200px' : 'auto' }}
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
                <div className="flex flex-col items-center justify-center animate-fade-in w-full h-[15rem] relative group">
                  {file.type.startsWith("image/") ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-contain p-2" />
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-background/90 via-background/60 to-transparent flex flex-col items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="font-bold text-emerald-400 text-sm font-mono truncate max-w-[90%]">{file.name}</p>
                        <p className="text-slate-300 text-[10px] uppercase mt-1 font-mono">
                          {formatSize(file.size)} &middot; Click to replace
                        </p>
                      </div>
                      
                      {/* Always visible label on top */}
                      <div className="absolute top-2 left-2 bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-md px-2 py-1 flex items-center gap-1.5 rounded-sm">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span className="text-[9px] uppercase font-mono tracking-widest text-emerald-500 font-bold">Image Verified</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full">
                      <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center relative">
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500"></div>
                        <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm font-mono truncate max-w-[200px]">{file.name}</p>
                        <p className="text-slate-500 text-[10px] uppercase mt-1 font-mono">
                          {formatSize(file.size)} &middot; Click to replace
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border border-slate-300 dark:border-slate-600 flex items-center justify-center relative">
                    <div className="absolute top-0 w-1 h-full bg-background hidden"></div>
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                   </div>
                  <div>
                    <p className="text-foreground font-medium text-sm font-mono mb-1">
                      Drag Architecture File
                    </p>
                    <p className="text-slate-500 text-xs font-mono">
                       PNG, JPG, SVG, Draw.io (.xml)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 p-3 text-xs font-mono">
                <span>[ERROR]</span> {error}
              </div>
            )}

            {/* Cloud Provider Select */}
            <div className="mt-4 flex flex-col gap-2">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                Target Environment
              </label>
              <div className="grid grid-cols-3 gap-3">
                {CLOUD_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    className={`relative flex items-center justify-center gap-3 px-4 py-3.5 rounded-lg border font-mono transition-all cursor-pointer overflow-hidden group
                      ${provider === p 
                          ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(37,99,235,0.15)]" 
                          : "border-border bg-surface text-slate-500 dark:text-slate-400 hover:border-slate-400 hover:text-foreground hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }
                    `}
                  >
                    <div className="bg-white rounded-md border border-slate-200/50 p-2 flex items-center justify-center shrink-0 w-10 h-10 overflow-hidden shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/${p.toLowerCase()}.png`} alt={p} className="w-full h-full object-contain transition-transform group-hover:scale-110" />
                    </div>
                    <span className="font-bold tracking-widest text-sm">{p}</span>
                    
                    {provider === p && (
                       <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_var(--primary-glow)]"></div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleInteractive}
              disabled={!file || loading}
              className="mt-6 w-full btn-primary h-12 font-mono uppercase tracking-widest text-sm relative overflow-hidden flex items-center justify-center shadow-[0_0_15px_var(--primary-glow)] group"
            >
              {loading ? (
                <>
                  <Spinner />
                  <span className="opacity-90">Executing Analysis...</span>
                </>
              ) : (
                <>
                  <span>Initialize Compilation</span>
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
           </div>
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 shrink-0 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
