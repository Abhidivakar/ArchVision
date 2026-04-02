"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import DiagramEditor, { DiagramEditorHandle } from '@/components/builder/DiagramEditor';
import { generateInteractive, convertDiagram } from "@/lib/api";
import { useRouter } from 'next/navigation';
import { playSuccessSound } from "@/lib/audio";
import { sendNotification } from "@/lib/notifications";
import Link from 'next/link';
import Image from 'next/image';
import type { CloudProvider } from "@/lib/types";

const CLOUD_PROVIDERS: CloudProvider[] = ["GCP", "AWS", "Azure"];

export default function BuilderPage() {
  const router = useRouter();
  const editorRef = useRef<DiagramEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [provider, setProvider] = useState<CloudProvider>("GCP");
  const [currentXml, setCurrentXml] = useState<string>('');
  const [editorReady, setEditorReady] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [pendingExportAction, setPendingExportAction] = useState<'analyze' | 'download-png' | 'download-svg' | null>(null);
  const [editorTheme, setEditorTheme] = useState<'light' | 'dark'>('light');
  const [isConverting, setIsConverting] = useState(false);
  const [migrationTarget, setMigrationTarget] = useState<CloudProvider | null>(null);
  const [conversionFile, setConversionFile] = useState<File | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Show toast with auto-dismiss
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleEditorReady = useCallback(() => {
    setEditorReady(true);
  }, []);

  // Auto-save XML to sessionStorage
  useEffect(() => {
    if (!currentXml) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem('archvision_diagram_xml', currentXml);
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentXml]);

  // Load saved XML on mount
  useEffect(() => {
    const savedXml = sessionStorage.getItem('archvision_diagram_xml');
    if (savedXml) {
      setCurrentXml(savedXml);
    }

    const rawData = sessionStorage.getItem("archData");
    if (rawData) {
      try {
        const parsed = JSON.parse(rawData);
        if (parsed.provider) {
          setProvider(parsed.provider as CloudProvider);
        }
      } catch (e) {
        console.error("Failed to parse archData for provider", e);
      }
    }
    
    setIsInitializing(false);
  }, []);

  const handleXmlChange = useCallback((xml: string) => {
    setCurrentXml(xml);
  }, []);

  const handleExport = useCallback((data: string, format: string) => {
    if (pendingExportAction === 'analyze') {
      setPendingExportAction(null);
      handleAnalyzeWithImage(data);
    } else if (pendingExportAction === 'download-png' || pendingExportAction === 'download-svg') {
      setPendingExportAction(null);
      const link = document.createElement('a');
      link.download = `archvision-diagram.${format}`;
      link.href = data;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported as ${format.toUpperCase()}`, 'success');
    }
  }, [pendingExportAction]);

  const handleAnalyzeWithImage = async (dataUrl: string) => {
    setLoading(true);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "diagram.png", { type: "image/png" });
      const data = await generateInteractive(file, provider);
      sessionStorage.setItem("archData", JSON.stringify({ data, imageUrl: dataUrl, filename: "Custom Architecture", provider }));
      playSuccessSound();
      sendNotification("Analysis Complete", "Architecture diagram analysis is finished.");
      router.push("/dashboard");
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'Failed to analyze diagram', 'error');
      setLoading(false);
    }
  };

  const handleAnalyze = () => {
    if (!editorRef.current) return;
    setPendingExportAction('analyze');
    editorRef.current.exportPng();
  };

  const handleExportPng = () => {
    if (!editorRef.current) return;
    setPendingExportAction('download-png');
    editorRef.current.exportPng();
  };

  const handleExportSvg = () => {
    if (!editorRef.current) return;
    setPendingExportAction('download-svg');
    editorRef.current.exportSvg();
  };

  const handleConvertImageClick = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setConversionFile(file);
    setMigrationTarget(provider); 
  };

  const processDirectConversion = async (targetProvider: CloudProvider) => {
    if (!conversionFile) return;
    setLoading(true);
    setLoadingText("Analyzing Image...");
    setProvider(targetProvider);
    try {
      const archData = await generateInteractive(conversionFile, targetProvider);
      setLoadingText(`Translating to ${targetProvider} Diagram...`);
      const { xml } = await convertDiagram(targetProvider, undefined, archData);
      
      if (xml && editorRef.current) {
        editorRef.current.loadXml(xml);
        setCurrentXml(xml);
        sessionStorage.setItem("archData", JSON.stringify({ 
          data: archData,
          provider: targetProvider,
          imageUrl: URL.createObjectURL(conversionFile)
        }));
        sessionStorage.setItem('archvision_diagram_xml', xml);
        showToast(`Converted to ${targetProvider}!`, 'success');
        playSuccessSound();
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'Failed to convert image', 'error');
    } finally {
      setLoading(false);
      setLoadingText("");
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    if (!editorRef.current) return;
    if (confirm('Are you sure you want to reset the diagram? This cannot be undone.')) {
      editorRef.current.resetDiagram();
      sessionStorage.removeItem('archvision_diagram_xml');
      showToast('Diagram reset', 'info');
    }
  };

  const handleSave = () => {
    if (currentXml) {
      sessionStorage.setItem('archvision_diagram_xml', currentXml);
      showToast('Diagram saved', 'success');
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingAi(true);
    try {
      const res = await fetch('/api/diagram/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, provider }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Generation failed (${res.status})`);
      }
      const { xml } = await res.json();
      if (xml && editorRef.current) {
        editorRef.current.loadXml(xml);
        setCurrentXml(xml);
        showToast('AI diagram generated!', 'success');
        setShowAiModal(false);
        setAiPrompt('');
      }
    } catch (error: any) {
      showToast(error.message || 'AI generation failed', 'error');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleConvert = async (targetProvider: CloudProvider) => {
    if (!currentXml) return;
    setIsConverting(true);
    setProvider(targetProvider);
    try {
      const res = await fetch('/api/diagram/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceXml: currentXml, targetProvider }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Conversion failed (${res.status})`);
      }
      const { xml } = await res.json();
      if (xml && editorRef.current) {
        editorRef.current.loadXml(xml);
        setCurrentXml(xml);
        showToast(`Converted diagram to ${targetProvider}!`, 'success');
      }
    } catch (error: any) {
      showToast(error.message || 'Conversion failed', 'error');
      setProvider(provider); 
    } finally {
      setIsConverting(false);
    }
  };

  const handleProviderChange = (newProvider: CloudProvider) => {
    if (newProvider === provider) return;
    
    // Check if the current diagram is effectively empty
    const isEmpty = !currentXml || (currentXml.match(/<mxCell/g) || []).length <= 2;

    if (!isEmpty) {
      setMigrationTarget(newProvider);
    } else {
      setProvider(newProvider);
      showToast(`Switched to ${newProvider} mode`, 'info');
    }
  };

  const confirmAndMigrate = () => {
    if (migrationTarget) {
      const target = migrationTarget;
      if (conversionFile) {
        setMigrationTarget(null); // Close modal immediately
        processDirectConversion(target);
      } else {
        setMigrationTarget(null); // Close modal immediately
        handleConvert(target);
      }
    }
  };

  const isDark = editorTheme === 'dark';

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background text-foreground bg-grid">
      {/* Top Toolbar */}
      <header className="h-14 border-b border-border bg-surface/80 backdrop-blur-md flex items-center px-4 shrink-0 z-20">
        {/* Left Section */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <Link href="/" className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="h-6 w-px bg-white/10 shrink-0" />
          <h1 className={`font-semibold text-sm hidden lg:block truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>ArchVision Builder</h1>

          {/* Provider Selector */}
          <div className={`flex items-center gap-1 rounded-lg p-0.5 border shrink-0 ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
            {CLOUD_PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                disabled={isConverting}
                className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold transition-all ${
                  provider === p
                    ? 'bg-blue-500/20 text-blue-600 border border-blue-500/30'
                    : isDark ? 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent' : 'text-slate-500 hover:text-slate-800 hover:bg-white border border-transparent'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Middle Section — Convert Image Tool */}
        <div className="flex-none flex items-center justify-center px-4">
          <button
            onClick={handleConvertImageClick}
            disabled={!editorReady || loading}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed border ${
              isDark 
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20' 
                : 'bg-blue-500/10 border-blue-500/20 text-blue-600 hover:bg-blue-500/20'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={onFileChange} 
            />
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="hidden sm:inline">Convert Image</span>
          </button>
        </div>

        {/* Right Section — Action Buttons */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          {/* Theme & AI - Re-enlarged Generate with AI */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setEditorTheme(t => t === 'light' ? 'dark' : 'light')}
              title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
              className={`p-1.5 rounded-lg border transition-all ${
                isDark ? 'bg-white/5 text-amber-400 border-white/10 hover:bg-white/10' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {isDark ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
            </button>
            
            <button
              onClick={() => setShowAiModal(true)}
              disabled={!editorReady}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-500 border border-purple-500/20 hover:bg-purple-500/20 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Generate with AI</span>
            </button>
          </div>

          <div className={`hidden md:block h-5 w-px ${isDark ? 'bg-white/10' : 'bg-slate-200'} shrink-0`} />

          {/* Core Actions - Only Save & PNG visible on small screens */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleSave}
              disabled={!editorReady || !currentXml}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all disabled:opacity-40 border ${isDark ? 'text-slate-300 hover:bg-white/5 border-white/5' : 'text-slate-600 hover:bg-slate-100 border-slate-200'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              <span className="hidden xl:inline">Save</span>
            </button>
            <button
              onClick={handleExportPng}
              disabled={!editorReady}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all disabled:opacity-40 border ${isDark ? 'text-slate-300 hover:bg-white/5 border-white/5' : 'text-slate-600 hover:bg-slate-100 border-slate-200'}`}
            >
              PNG
            </button>
            <button
              onClick={handleReset}
              disabled={!editorReady}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all disabled:opacity-40 border text-red-400/80 hover:text-red-500 hover:bg-red-500/10 border-transparent`}
            >
              Reset
            </button>

            {/* Primary Action */}
            <button
              onClick={handleAnalyze}
              disabled={!editorReady || loading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="hidden lg:inline">Analyze Architecture</span>
              <span className="lg:hidden">Analyze</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Editor Area */}
      <div className="flex-1 rounded-sm overflow-hidden shadow-inner border border-slate-200/50 relative">
        {!isInitializing && (
          <DiagramEditor
            ref={editorRef}
            onXmlChange={handleXmlChange}
            onExport={handleExport}
            onReady={handleEditorReady}
            initialXml={currentXml || undefined}
            theme={editorTheme}
          />
        )}

        {/* Full-screen loading overlay */}
        {(loading || isConverting) && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-xl flex flex-col items-center justify-center">
            <div className="w-16 h-16 relative">
              <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin" />
            </div>
            <h2 className="text-white text-xl font-bold mt-6 mb-2">
              {loadingText || (loading ? "Analyzing Architecture..." : `Translating to ${provider}...`)}
            </h2>
            <p className="text-slate-400 text-sm max-w-sm text-center">
              {loadingText === "Analyzing Image..." 
                ? "Identifying cloud services and visual layout from your upload."
                : (loading ? "Gemini is assessing costs, checking security compliance, and generating Terraform."
                : "Gemini is mathematically reconstructing your diagram with the new provider's icons.")}
            </p>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 animate-slide-up text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
          toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
          'bg-blue-500/10 border-blue-500/30 text-blue-400'
        }`}>
          {toast.type === 'success' && '✓'}
          {toast.type === 'error' && '✕'}
          {toast.type === 'info' && 'ℹ'}
          {toast.message}
        </div>
      )}

      {/* AI Generation Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !isGeneratingAi && setShowAiModal(false)}>
          <div className="w-full max-w-lg mx-4 glass rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">Generate with AI</h3>
                <p className="text-slate-400 text-xs">Describe the architecture you want to build</p>
              </div>
            </div>

            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder={`e.g. "Create a ${provider} 3-tier web application with load balancer, auto-scaling compute, managed database, and CDN"`}
              className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 outline-none focus:border-purple-500/30 resize-none transition-all duration-300"
              disabled={isGeneratingAi}
            />

            {/* Example Prompts */}
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                `3-tier web app on ${provider}`,
                `${provider} Data Pipeline`,
                `Serverless API with ${provider}`,
                `Hybrid Network for ${provider}`
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setAiPrompt(example)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-slate-400 hover:text-purple-400 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all"
                >
                  {example}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mt-5">
              <span className="text-xs text-slate-500">Describe clearly for best results</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAiModal(false)}
                  disabled={isGeneratingAi}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all outline-none"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAiGenerate}
                  disabled={!aiPrompt.trim() || isGeneratingAi}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  {isGeneratingAi ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Migration / Conversion Confirmation Modal */}
      {migrationTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-fade-in" onClick={() => { setMigrationTarget(null); setConversionFile(null); }}>
          <div 
            className={`w-full max-w-md mx-4 rounded-3xl p-1 border shadow-2xl relative overflow-hidden transition-all duration-500 scale-in-center ${
              isDark ? 'bg-slate-900/90 border-white/10' : 'bg-white border-slate-200 shadow-xl'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {/* Background Accents */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative p-6">
              {/* Header */}
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-3 transform hover:rotate-3 transition-transform">
                  {conversionFile ? (
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  )}
                </div>
                <h3 className={`text-xl font-black tracking-tight mb-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {conversionFile ? "Choose Target Provider" : "Confirm Migration"}
                </h3>
                <p className={`text-xs max-w-[280px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  {conversionFile 
                    ? `Specify your target cloud to convert "${conversionFile.name}".` 
                    : `Convert your architecture to ${migrationTarget}?`}
                </p>
              </div>

              {/* Provider Grid */}
              {conversionFile && (
                <div className="grid grid-cols-3 gap-2.5 mb-6">
                  {CLOUD_PROVIDERS.map((p) => {
                    const isSelected = migrationTarget === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setMigrationTarget(p)}
                        className={`group relative p-3.5 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-2.5 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/5'
                            : isDark 
                              ? 'border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10' 
                              : 'border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-slate-100 shadow-sm'
                        }`}
                      >
                        {/* Provider Asset Icons with Next.js Image Optimization */}
                        <div className={`w-10 h-10 flex items-center justify-center p-1 rounded-lg bg-white shadow-sm transition-all ${isSelected ? 'scale-110 ring-2 ring-blue-500/20' : 'group-hover:scale-105'}`}>
                          <Image 
                            src={`/${p.toLowerCase()}.png`} 
                            alt={p} 
                            width={40}
                            height={40}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-500' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {p}
                        </span>
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[10px] text-white shadow-lg">
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => { setMigrationTarget(null); setConversionFile(null); }}
                  className={`flex-1 py-3.5 rounded-2xl font-bold transition-all text-sm ${
                    isDark 
                      ? 'text-slate-400 bg-white/5 hover:bg-white/10 border border-white/5' 
                      : 'text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmAndMigrate}
                  disabled={!migrationTarget}
                  className="flex-1 py-3.5 rounded-2xl font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-xl shadow-indigo-500/25 transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {conversionFile ? "Start Conversion" : "Confirm Migration"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
