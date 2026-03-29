"use client";

import React, { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';

export interface DiagramEditorHandle {
  exportPng: () => void;
  exportSvg: () => void;
  loadXml: (xml: string) => void;
  getXml: () => void;
  resetDiagram: () => void;
}

interface DiagramEditorProps {
  onXmlChange?: (xml: string) => void;
  onExport?: (data: string, format: string) => void;
  onReady?: () => void;
  initialXml?: string;
  theme?: 'light' | 'dark';
}

// Build draw.io URL based on theme — light uses kennedy (clean white UI), dark uses dark
function buildDrawioUrl(theme: 'light' | 'dark') {
  const ui = theme === 'dark' ? 'dark' : 'kennedy';
  return `https://embed.diagrams.net/?embed=1&ui=${ui}&spin=1&proto=json&libraries=1&configure=1&noSaveBtn=0&saveAndExit=0&noExitBtn=1`;
}

const DiagramEditor = forwardRef<DiagramEditorHandle, DiagramEditorProps>(
  ({ onXmlChange, onExport, onReady, initialXml, theme = 'light' }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    // Track the current XML so we can reload it when theme changes
    const currentXmlRef = useRef<string>(initialXml || '');
    // Track whether we've received init – to avoid sending load twice
    const initReceivedRef = useRef(false);
    // When theme changes, we swap the iframe src; keep pending XML
    const [iframeSrc, setIframeSrc] = useState(() => buildDrawioUrl(theme));

    // When parent changes theme prop, rebuild the URL and reset ready state
    useEffect(() => {
      setIsReady(false);
      setIsLoading(true);
      initReceivedRef.current = false;
      setIframeSrc(buildDrawioUrl(theme));
    }, [theme]);

    const sendMessage = useCallback((msg: any) => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
      }
    }, []);

    useImperativeHandle(ref, () => ({
      exportPng: () => {
        sendMessage({ action: 'export', format: 'png', spin: 'Exporting...' });
      },
      exportSvg: () => {
        sendMessage({ action: 'export', format: 'svg', spin: 'Exporting...' });
      },
      loadXml: (xml: string) => {
        currentXmlRef.current = xml;
        if (isReady) {
          sendMessage({ action: 'load', xml, autosave: 1 });
        }
      },
      getXml: () => {
        sendMessage({ action: 'export', format: 'xmlsvg' });
      },
      resetDiagram: () => {
        const emptyXml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';
        currentXmlRef.current = emptyXml;
        sendMessage({ action: 'load', xml: emptyXml, autosave: 1 });
        onXmlChange?.(emptyXml);
      },
    }), [isReady, sendMessage, onXmlChange]);

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') return;
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }

        switch (msg.event) {
          case 'configure':
            sendMessage({
              action: 'configure',
              config: {
                defaultFonts: ['Inter', 'Helvetica', 'Arial'],
              }
            });
            break;

          case 'init':
            if (initReceivedRef.current) return; // guard against double fire
            initReceivedRef.current = true;
            setIsReady(true);
            setIsLoading(false);

            // Load current XML or blank canvas
            const xmlToLoad = currentXmlRef.current ||
              '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';
            sendMessage({ action: 'load', xml: xmlToLoad, autosave: 1 });
            onReady?.();
            break;

          case 'autosave':
            if (msg.xml) {
              currentXmlRef.current = msg.xml;
              onXmlChange?.(msg.xml);
            }
            break;

          case 'save':
            if (msg.xml) {
              currentXmlRef.current = msg.xml;
              onXmlChange?.(msg.xml);
            }
            break;

          case 'export':
            if (msg.data) {
              onExport?.(msg.data, msg.format || 'png');
            }
            break;
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [sendMessage, onXmlChange, onExport, onReady]);

    const loadingBg = theme === 'dark' ? 'bg-slate-950' : 'bg-white';
    const spinnerColor = theme === 'dark' ? 'border-blue-500' : 'border-blue-600';
    const textColor = theme === 'dark' ? 'text-slate-400' : 'text-slate-500';

    return (
      <div className="relative w-full h-full">
        {isLoading && (
          <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center ${loadingBg}`}>
            <div className="w-12 h-12 relative">
              <div className={`absolute inset-0 border-4 border-opacity-20 rounded-full ${spinnerColor}`} style={{ opacity: 0.2 }} />
              <div className={`absolute inset-0 border-4 ${spinnerColor} rounded-full border-t-transparent animate-spin`} />
            </div>
            <p className={`${textColor} text-sm mt-4`}>Loading Diagram Editor...</p>
          </div>
        )}
        <iframe
          key={iframeSrc}
          ref={iframeRef}
          src={iframeSrc}
          className="w-full h-full border-none"
          style={{ background: theme === 'dark' ? '#1e1e2e' : '#ffffff' }}
          allow="fullscreen"
        />
      </div>
    );
  }
);

DiagramEditor.displayName = 'DiagramEditor';
export default DiagramEditor;
