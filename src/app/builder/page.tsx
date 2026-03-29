"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import DiagramEditor, { DiagramEditorHandle } from '@/components/builder/DiagramEditor';
import { generateInteractive } from "@/lib/api";
import { useRouter } from 'next/navigation';
import { playSuccessSound } from "@/lib/audio";
import { sendNotification } from "@/lib/notifications";
import Link from 'next/link';
import type { CloudProvider } from "@/lib/types";

const CLOUD_PROVIDERS: CloudProvider[] = ["GCP", "AWS", "Azure"];

export default function BuilderPage() {
  const router = useRouter();
  const editorRef = useRef<DiagramEditorHandle>(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<CloudProvider>("GCP");
  const [currentXml, setCurrentXml] = useState<string>('');
  const [editorReady, setEditorReady] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [pendingExportAction, setPendingExportAction] = useState<'analyze' | 'download-png' | 'download-svg' | null>(null);
  const [editorTheme, setEditorTheme] = useState<'light' | 'dark'>('light');

  // Show toast with auto-dismiss
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
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
  }, []);

  const handleXmlChange = useCallback((xml: string) => {
    setCurrentXml(xml);
  }, []);

  const handleEditorReady = useCallback(() => {
    setEditorReady(true);
    // Load previously saved XML if available
    const savedXml = sessionStorage.getItem('archvision_diagram_xml');
    if (savedXml && editorRef.current) {
      editorRef.current.loadXml(savedXml);
    }
  }, []);

  const handleExport = useCallback((data: string, format: string) => {
    if (pendingExportAction === 'analyze') {
      setPendingExportAction(null);
      // data is a base64 data URL for PNG
      handleAnalyzeWithImage(data);
    } else if (pendingExportAction === 'download-png' || pendingExportAction === 'download-svg') {
      setPendingExportAction(null);
      // Download the file
      const link = document.createElement('a');
      link.download = `archvision-diagram.${format}`;
      link.href = data;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported as ${format.toUpperCase()}`, 'success');
    }
  }, [pendingExportAction]);

  // Convert base64 dataURL to File object and analyze
  const handleAnalyzeWithImage = async (dataUrl: string) => {
    setLoading(true);
    try {
      // Convert base64 data URL to Blob
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "diagram.png", { type: "image/png" });

      const data = await generateInteractive(file, provider);

      // Store the image URL and data for dashboard
      sessionStorage.setItem(
        "archData",
        JSON.stringify({ data, imageUrl: dataUrl, filename: "Custom Architecture", provider })
      );

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

  const isDark = editorTheme === 'dark';

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
      {/* Top Toolbar */}
      <header className={`h-14 border-b flex items-center justify-between px-4 shrink-0 z-20 backdrop-blur-md ${isDark ? 'border-white/5 bg-slate-900/60' : 'border-slate-200 bg-white/80'}`}>
        {/* Left Section */}
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="h-6 w-px bg-white/10" />
          <h1 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-slate-800'}`}>ArchVision Builder</h1>

          {/* Provider Selector */}
          <div className={`flex items-center gap-1 ml-4 rounded-lg p-0.5 border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
            {CLOUD_PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
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

        {/* Right Section — Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={() => setEditorTheme(t => t === 'light' ? 'dark' : 'light')}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              isDark
                ? 'bg-white/5 text-amber-400 border-white/10 hover:bg-white/10'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {isDark ? (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
            {isDark ? 'Light' : 'Dark'}
          </button>

          {/* Generate with AI */}
          <button
            onClick={() => setShowAiModal(true)}
            disabled={!editorReady}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-500 border border-purple-500/20 hover:bg-purple-500/20 transition-all disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Generate with AI
          </button>

          <div className={`h-5 w-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!editorReady || !currentXml}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 border ${isDark ? 'text-slate-300 hover:bg-white/5 border-white/5' : 'text-slate-600 hover:bg-slate-100 border-slate-200'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save
          </button>

          {/* Export PNG */}
          <button
            onClick={handleExportPng}
            disabled={!editorReady}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 border ${isDark ? 'text-slate-300 hover:bg-white/5 border-white/5' : 'text-slate-600 hover:bg-slate-100 border-slate-200'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            PNG
          </button>

          {/* Export SVG */}
          <button
            onClick={handleExportSvg}
            disabled={!editorReady}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 border ${isDark ? 'text-slate-300 hover:bg-white/5 border-white/5' : 'text-slate-600 hover:bg-slate-100 border-slate-200'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            SVG
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            disabled={!editorReady}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 border text-red-400/80 hover:text-red-500 hover:bg-red-500/10 ${isDark ? 'border-white/5' : 'border-slate-200'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Reset
          </button>

          <div className={`h-5 w-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />

          {/* Primary CTA: Analyze */}
          <button
            onClick={handleAnalyze}
            disabled={!editorReady || loading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(59,130,246,0.15)]"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Analyze Architecture
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Editor Area */}
      <div className="flex-1 relative">
        <DiagramEditor
          ref={editorRef}
          onXmlChange={handleXmlChange}
          onExport={handleExport}
          onReady={handleEditorReady}
          initialXml={currentXml || undefined}
          theme={editorTheme}
        />

        {/* Full-screen loading overlay (during Gemini analysis) */}
        {loading && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-xl flex flex-col items-center justify-center">
            <div className="w-16 h-16 relative">
              <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin" />
            </div>
            <h2 className="text-white text-xl font-bold mt-6 mb-2">Analyzing Architecture...</h2>
            <p className="text-slate-400 text-sm max-w-sm text-center">
              Gemini is assessing costs, checking security compliance, and generating Terraform.
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
              className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 outline-none focus:border-purple-500/30 resize-none"
              disabled={isGeneratingAi}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAiGenerate(); }}
            />

            {/* Quick templates */}
            <div className="flex flex-wrap gap-2 mt-3">
              {[
                '3-tier web app',
                'Microservices with API Gateway',
                'Event-driven serverless',
                'Data pipeline with ML',
              ].map(t => (
                <button
                  key={t}
                  onClick={() => setAiPrompt(`Create a ${provider} ${t} architecture`)}
                  className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mt-5">
              <span className="text-xs text-slate-500">Ctrl+Enter to generate</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAiModal(false)}
                  disabled={isGeneratingAi}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAiGenerate}
                  disabled={!aiPrompt.trim() || isGeneratingAi}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  {isGeneratingAi ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating...
                    </>
                  ) : 'Generate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
