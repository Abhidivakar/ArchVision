"use client";

import React, { useEffect, useState, useRef } from "react";
import type { ArchComponent, CalibrationOverride } from "@/lib/types";


interface Hotspot extends CalibrationOverride {
  comp: ArchComponent;
}

interface HotspotLayerProps {
  components: ArchComponent[];
  imageRef: React.RefObject<HTMLImageElement | null>;
  onSelect: (comp: ArchComponent) => void;
  activeId?: string | null;
  bottleneckIds?: string[] | null;
  latencyData?: { tier: string; latency_ms: number }[] | null;
  trafficVolume?: number; // 0 to 1
  plannedIds?: string[] | null;
  imageUrl?: string;
  onSaveCalibration?: (overrides: Record<string, CalibrationOverride>) => void;
  simulationReport?: any;
  plannedConfigs?: Record<string, string>;
  originalComponents?: ArchComponent[];
}


const HotspotLayer: React.FC<HotspotLayerProps> = ({
  components,
  onSelect,
  activeId,
  bottleneckIds = [],
  latencyData = [],
  trafficVolume = 0.1,
  plannedIds = [],
  imageUrl,
  onSaveCalibration,
  simulationReport,
  plannedConfigs = {},
  originalComponents = [],
}) => {

  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [overrides, setOverrides] = useState<Record<string, CalibrationOverride>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  
  // Interactive Viz State
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  
  // Drag/Resize state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizingCorner, setResizingCorner] = useState<string | null>(null); // 'tl', 'tr', 'bl', 'br'
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const computed: Hotspot[] = components
      .filter(comp => comp.box_2d && comp.box_2d.length === 4)
      .map(comp => {
        const override = overrides[comp.id];
        if (override) {
          return { comp, ...override };
        }

        const [ymin, xmin, ymax, xmax] = comp.box_2d!;
        const cx = (xmin + xmax) / 2;
        const cy = (ymin + ymax) / 2;
        return { comp, x: cx, y: cy, ymin, xmin, ymax, xmax };
      });
    setHotspots(computed);
  }, [components, overrides]);

  const handleDebugToggle = (e: React.MouseEvent) => {
    if (e.detail === 3) setDebugMode(!debugMode);
  };

  const handleMouseDown = (e: React.MouseEvent, h: Hotspot) => {
    if (!debugMode) return;
    e.stopPropagation();
    setDraggingId(h.comp.id);

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = ((e.clientX - rect.left) / rect.width) * 1000;
      const mouseY = ((e.clientY - rect.top) / rect.height) * 1000;
      setDragOffset({ x: mouseX - h.x, y: mouseY - h.y });
    }
  };

  const handleResizeStart = (e: React.MouseEvent, h: Hotspot, corner: string) => {
    if (!debugMode) return;
    e.stopPropagation();
    setResizingId(h.comp.id);
    setResizingCorner(corner);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!debugMode) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = ((e.clientX - rect.left) / rect.width) * 1000;
    const mouseY = ((e.clientY - rect.top) / rect.height) * 1000;

    if (draggingId) {
      const h = hotspots.find(hs => hs.comp.id === draggingId);
      if (h) {
        const dx = (mouseX - dragOffset.x) - h.x;
        const dy = (mouseY - dragOffset.y) - h.y;
        
        setOverrides(prev => ({
          ...prev,
          [draggingId]: {
            x: h.x + dx,
            y: h.y + dy,
            xmin: h.xmin + dx,
            xmax: h.xmax + dx,
            ymin: h.ymin + dy,
            ymax: h.ymax + dy
          }
        }));
        setHasUnsavedChanges(true);
      }
    } else if (resizingId && resizingCorner) {
      const h = hotspots.find(hs => hs.comp.id === resizingId);
      if (h) {
        let { xmin, xmax, ymin, ymax } = h;
        
        if (resizingCorner.includes('t')) ymin = Math.min(ymax - 1, mouseY);
        if (resizingCorner.includes('b')) ymax = Math.max(ymin + 1, mouseY);
        if (resizingCorner.includes('l')) xmin = Math.min(xmax - 1, mouseX);
        if (resizingCorner.includes('r')) xmax = Math.max(xmin + 1, mouseX);

        setOverrides(prev => ({
          ...prev,
          [resizingId]: {
            xmin: Math.max(0, xmin),
            xmax: Math.min(1000, xmax),
            ymin: Math.max(0, ymin),
            ymax: Math.min(1000, ymax),
            x: (xmin + xmax) / 2,
            y: (ymin + ymax) / 2
          }
        }));
        setHasUnsavedChanges(true);
      }
    }
  };

  const handleMouseUp = () => {
    setDraggingId(null);
    setResizingId(null);
    setResizingCorner(null);
  };

  // ── ANALYSIS UTILS ──
  const getDownstreamIds = (id: string): string[] => {
    const visited = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (visited.has(currentId)) continue;
      if (currentId !== id) visited.add(currentId);
      
      const comp = components.find(c => c.id === currentId || c.name === currentId);
      if (comp?.dependencies) {
        comp.dependencies.forEach(dep => {
          // Find the actual ID if the dependency string is a name
          const depComp = components.find(c => c.id === dep || c.name === dep);
          if (depComp) stack.push(depComp.id);
        });
      }
    }
    return Array.from(visited);
  };

  const getCompCostScale = (comp: ArchComponent) => {
    if (!simulationReport?.cost_breakdown) return 1;
    const item = (simulationReport.cost_breakdown as any[]).find((cb: any) => 
      comp.service.toLowerCase().includes(cb.service.toLowerCase()) ||
      comp.name.toLowerCase().includes(cb.service.toLowerCase())
    );
    if (!item) return 1;
    // Scale factor between 0.8 and 2.5 based on cost
    return Math.min(2.5, Math.max(0.8, item.monthly_cost / 100));
  };

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 pointer-events-auto"
      style={{ zIndex: 100 }}
      onClick={handleDebugToggle}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ── VECTOR GROUNDING & TRAFFIC LAYER ── */}
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
      >
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Security Zones (Background Bubbles) */}
        {hotspots.map((h) => {
          if (!h.comp.zone) return null;
          const isPublic = h.comp.zone.toLowerCase() === 'public';
          return (
            <circle 
              key={`zone-${h.comp.id}`}
              cx={h.x} cy={h.y} r="120"
              fill={isPublic ? "rgba(59, 130, 246, 0.03)" : "rgba(16, 185, 129, 0.03)"}
              stroke={isPublic ? "rgba(59, 130, 246, 0.1)" : "rgba(16, 185, 129, 0.1)"}
              strokeDasharray="10 5"
              className="animate-pulse"
              style={{ animationDuration: '8s' }}
            />
          );
        })}

        {/* 2. Traffic Flow Lines */}
        {!debugMode && hotspots.map((h) => {
          if (!h.comp.dependencies) return null;
          return h.comp.dependencies.map(depId => {
            const target = hotspots.find(hs => hs.comp.id === depId || hs.comp.name === depId);
            if (!target) return null;

            const isHighTraffic = trafficVolume > 0.6;
            const pathId = `${h.comp.id}-${target.comp.id}`;
            
            // Calculate a slight curve
            const midX = (h.x + target.x) / 2;
            const midY = (h.y + target.y) / 2 - 40; // Arch up

            return (
              <g key={pathId}>
                <path 
                  d={`M ${h.x} ${h.y} Q ${midX} ${midY} ${target.x} ${target.y}`}
                  fill="none"
                  stroke={isHighTraffic ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.15)"}
                  strokeWidth={isHighTraffic ? "3" : "1.5"}
                  strokeDasharray="5,10"
                  className="animate-dash"
                  style={{ animationDuration: '3s' } as any}
                />
                {/* Flow particles */}
                <circle r="3" fill="#60a5fa" filter="url(#glow)">
                  <animateMotion 
                    dur={trafficVolume > 0.8 ? "1s" : "2.5s"} 
                    repeatCount="indefinite" 
                    path={`M ${h.x} ${h.y} Q ${midX} ${midY} ${target.x} ${target.y}`} 
                  />
                </circle>
              </g>
            );
          });
        })}

        {/* 3. Debug Bounding Boxes */}
        {debugMode && hotspots.map((h) => {
          const { comp, x, y, xmin, ymin, xmax, ymax } = h;
          const isDragging = draggingId === comp.id;

          return (
            <g key={`debug-${comp.id}`} className="pointer-events-auto">
              <g 
                className="cursor-move group"
                onMouseDown={(e) => handleMouseDown(e, h)}
              >
                <rect 
                  x={xmin} y={ymin} width={xmax - xmin} height={ymax - ymin}
                  fill={isDragging ? "rgba(59, 130, 246, 0.2)" : (resizingId === comp.id ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)")} 
                  stroke={isDragging ? "#3b82f6" : (resizingId === comp.id ? "#10b981" : "#f87171")} 
                  strokeWidth="2"
                  strokeDasharray={isDragging || resizingId === comp.id ? "none" : "4 2"}
                />
                <circle cx={xmin} cy={ymin} r="6" fill="#ef4444" className="cursor-nwse-resize" onMouseDown={(e) => handleResizeStart(e, h, 'tl')} />
                <circle cx={xmax} cy={ymin} r="6" fill="#ef4444" className="cursor-nesw-resize" onMouseDown={(e) => handleResizeStart(e, h, 'tr')} />
                <circle cx={xmin} cy={ymax} r="6" fill="#ef4444" className="cursor-nesw-resize" onMouseDown={(e) => handleResizeStart(e, h, 'bl')} />
                <circle cx={xmax} cy={ymax} r="6" fill="#ef4444" className="cursor-nwse-resize" onMouseDown={(e) => handleResizeStart(e, h, 'br')} />
                <text x={xmin} y={ymin - 8} className="text-[12px] fill-white font-bold">{comp.name}</text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* ── INTERACTIVE HOTSPOTS LAYER ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {!debugMode && hotspots.map((h) => {
          const { comp, x, y, xmin, ymin, xmax, ymax } = h;
          const isBottleneck = (bottleneckIds ?? []).includes(comp.id);
          const isActive = activeId === comp.id;
          const isImpacted = hoveredId && getDownstreamIds(hoveredId).includes(comp.id);
          
          const tierMatch = (latencyData ?? []).find(
            (td) =>
              comp.service.toLowerCase().includes(td.tier.toLowerCase()) ||
              comp.name.toLowerCase().includes(td.tier.toLowerCase())
          );

          const isNew = !originalComponents.some(oc => oc.id === comp.id);

          let statusColor = "#3b82f6";
          if (isNew) statusColor = "#60a5fa"; // Evolved/New light blue
          if (isBottleneck || isImpacted) statusColor = "#ef4444";
          if ((plannedIds ?? []).includes(comp.id)) statusColor = "#10b981";

          const pulseDuration = trafficVolume > 0.8 ? "0.8s" : trafficVolume > 0.4 ? "1.5s" : "2.5s";

          return (
            <div 
              key={`hotspot-${comp.id}`}
              className={`absolute pointer-events-auto group transition-all duration-1000 ${isNew ? 'animate-fade-in' : ''}`}
              style={{ 
                left: `${((xmin + xmax) / 2) / 10}%`, 
                top: `${((ymin + ymax) / 2) / 10}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: (isActive || hoveredId === comp.id || isImpacted) ? 100 : 10
              }}
            >
              {/* BLAST RADIUS GLOW (IMPACTED) */}
              {isImpacted && (
                <div 
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full animate-pulse bg-red-500/25 blur-3xl z-[-1] pointer-events-none" 
                />
              )}
              {/* HOVER GLOW (SELF) */}
              {hoveredId === comp.id && (
                <div 
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full animate-pulse bg-blue-500/15 blur-[30px] z-[-1] pointer-events-none" 
                />
              )}

              {/* PULSING DOT */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(comp);
                }}
                onMouseEnter={() => {
                  setTooltip(comp.id);
                  setHoveredId(comp.id);
                }}
                onMouseLeave={() => {
                  setTooltip(null);
                  setHoveredId(null);
                }}
                className={`relative w-4 h-4 rounded-full transition-all duration-500 hover:scale-[1.5] cursor-pointer
                  ${isImpacted ? 'bg-red-500 ring-[3px] ring-red-500/40 shadow-[0_0_15px_4px_rgba(239,68,68,0.5)]' 
                  : (isActive ? 'bg-blue-400 ring-[3px] ring-blue-400/40 shadow-[0_0_15px_4px_rgba(96,165,250,0.5)]' 
                  : 'bg-indigo-500/90 border border-white/60 shadow-lg')}
                  ${isNew ? 'bg-cyan-400 ring-[3px] ring-cyan-400/30 shadow-[0_0_15px_4px_rgba(34,211,238,0.5)]' : ''}`}
                style={{ 
                   backgroundColor: (isActive || hoveredId === comp.id || isImpacted) ? statusColor : undefined
                }}
              >
                {/* Pulsing Aura - Centered via flex to avoid transform override by animate-ping */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div 
                     className="w-12 h-12 rounded-full animate-ping opacity-60 shrink-0"
                     style={{ 
                       backgroundColor: statusColor,
                       animationDuration: pulseDuration
                     }}
                  />
                </div>
              </div>

              {/* Status Indicator Label */}
              {isNew && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-blue-500 text-[8px] font-black text-white px-2 py-0.5 rounded shadow-xl border border-white/20 animate-bounce whitespace-nowrap z-[110]">
                  ✨ EVOLVED
                </div>
              )}
              {isBottleneck && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-600 text-[8px] font-black text-white px-2 py-0.5 rounded shadow-xl border border-white/20 animate-pulse whitespace-nowrap z-[110]">
                  🚨 BOTTLENECK
                </div>
              )}

              {/* Tooltip */}
              {tooltip === comp.id && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 pointer-events-none animate-fade-in z-[200]">
                  <div className={`${isBottleneck || isImpacted ? "bg-red-950 border-red-500" : "bg-slate-900 border-slate-700"} border backdrop-blur-xl text-white py-1.5 px-4 rounded-xl shadow-2xl flex flex-col items-center gap-0.5 min-w-[120px]`}>
                    <span className="text-[11px] font-bold whitespace-nowrap">
                      {isImpacted ? `⚠️ BLAST RADIUS: ${comp.name}` : (isBottleneck ? `🚨 BOTTLENECK: ${comp.name}` : comp.name)}
                    </span>
                    {h.comp.zone && <span className="text-[8px] opacity-70 uppercase tracking-widest leading-none mb-1">{h.comp.zone} Zone</span>}
                    
                    {(() => {
                      // Robust lookup
                      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                      const compIdNorm = normalize(comp.id);
                      const compNameNorm = normalize(comp.name);
                      
                      let config = plannedConfigs[comp.id] || plannedConfigs[comp.name];
                      
                      if (!config) {
                        const matchingKey = Object.keys(plannedConfigs).find(k => {
                          const normK = normalize(k);
                          return normK === compIdNorm || normK === compNameNorm;
                        });
                        if (matchingKey) config = plannedConfigs[matchingKey];
                      }

                      if (!config || config === "Not explicitly found") return null;

                      return (
                        <div className="mt-1.5 pt-1.5 border-t border-white/10 w-full text-left">
                          <span className="text-[10px] text-emerald-400 font-bold leading-tight block mb-1">Production Config:</span>
                          <div className="text-[9px] text-emerald-100/90 leading-relaxed space-y-0.5 whitespace-pre-line">
                            {config}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {debugMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onSaveCalibration) {
                onSaveCalibration(overrides);
                setHasUnsavedChanges(false);
              }
            }}
            className={`px-5 py-2 rounded-full text-xs font-bold shadow-2xl transition-all flex items-center gap-2 backdrop-blur-md ${
              hasUnsavedChanges 
              ? "bg-emerald-600 hover:bg-emerald-500 text-white scale-110" 
              : "bg-slate-800/80 text-slate-400 border border-white/10"
            }`}
          >
            {hasUnsavedChanges ? "💾 Save Calibration" : "✅ Calibration Saved"}
          </button>
        </div>
      )}
    </div>
  );
};

export default HotspotLayer;
