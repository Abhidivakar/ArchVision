"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ArchComponent } from "@/lib/types";

interface Hotspot {
  comp: ArchComponent;
  px: number; // absolute pixel X from left of container
  py: number; // absolute pixel Y from top of container
}

interface HotspotLayerProps {
  components: ArchComponent[];
  imageRef: React.RefObject<HTMLImageElement | null>;
  onSelect: (comp: ArchComponent) => void;
  activeId?: string;
  bottleneckIds?: string[];
  latencyData?: { tier: string; latency_ms: number }[];
  trafficVolume?: number; // 0 to 1
}

const HotspotLayer: React.FC<HotspotLayerProps> = ({
  components,
  imageRef,
  onSelect,
  activeId,
  bottleneckIds = [],
  latencyData = [],
  trafficVolume = 0.1,
}) => {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [renderSize, setRenderSize] = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const recalculate = () => {
    const img = imageRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    const { naturalWidth, naturalHeight } = img;
    if (!naturalWidth || !naturalHeight) return;

    const imgRect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const imgRatio = naturalWidth / naturalHeight;
    const boxRatio = imgRect.width / imgRect.height;

    let renderW: number, renderH: number, offsetX: number, offsetY: number;

    if (imgRatio > boxRatio) {
      renderW = imgRect.width;
      renderH = imgRect.width / imgRatio;
      offsetX = 0;
      offsetY = (imgRect.height - renderH) / 2;
    } else {
      renderH = imgRect.height;
      renderW = imgRect.height * imgRatio;
      offsetX = (imgRect.width - renderW) / 2;
      offsetY = 0;
    }

    setRenderSize({ w: renderW, h: renderH });

    const imgOriginX = imgRect.left - containerRect.left + offsetX;
    const imgOriginY = imgRect.top - containerRect.top + offsetY;

    console.log("[HotspotDebug]", {
      naturalSize: `${naturalWidth}x${naturalHeight}`,
      imgRect: `${imgRect.width}x${imgRect.height}`,
      renderRect: `${renderW}x${renderH}`,
      offset: `${offsetX},${offsetY}`,
    });

    const computed: Hotspot[] = [];

    for (const comp of components) {
      let cy = 0, cx = 0;
      if (comp.box_2d?.length === 4) {
        cy = (comp.box_2d[0] + comp.box_2d[2]) / 2;
        cx = (comp.box_2d[1] + comp.box_2d[3]) / 2;
      } else {
        continue;
      }

      // Use percentage-based positioning relative to the img element
      // cx/cy are 0-1000 from Gemini
      const xPct = cx / 10;
      const yPct = cy / 10;

      // Map content-percentage to element-percentage based on letterboxing
      const renderWPct = (renderW / imgRect.width) * 100;
      const renderHPct = (renderH / imgRect.height) * 100;
      const offsetXPct = (offsetX / imgRect.width) * 100;
      const offsetYPct = (offsetY / imgRect.height) * 100;

      const px = offsetXPct + (xPct / 100) * renderWPct;
      const py = offsetYPct + (yPct / 100) * renderHPct;
      
      computed.push({ comp, px, py });
    }

    setHotspots(computed);
  };

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    if (img.complete && img.naturalWidth) {
      recalculate();
    } else {
      img.addEventListener("load", recalculate);
    }

    const ro = new ResizeObserver(recalculate);
    ro.observe(img);
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      img.removeEventListener("load", recalculate);
      ro.disconnect();
    };
  }, [imageRef, components]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 20 }}
    >
      {hotspots.map(({ comp, px, py }) => {
        const isBottleneck = bottleneckIds.includes(comp.id);
        const isActive = activeId === comp.id;

        // Latency tier logic
        // We match component service keywords to latency tiers
        const tierMatch = latencyData.find(
          (td) =>
            comp.service.toLowerCase().includes(td.tier.toLowerCase()) ||
            comp.name.toLowerCase().includes(td.tier.toLowerCase())
        );

        let statusColor = "bg-blue-500/20 border-blue-400/50 shadow-[0_0_8px_rgba(59,130,246,0.2)]";
        let ringColor = "ring-blue-400/40";
        if (isBottleneck) {
          statusColor = "bg-red-500/30 border-red-500/60 scale-125 shadow-[0_0_12px_rgba(239,68,68,0.4)]";
          ringColor = "ring-red-400/40";
        } else if (tierMatch) {
          const lat = tierMatch.latency_ms;
          if (lat < 100) {
            statusColor = "bg-emerald-500/20 border-emerald-400/50 shadow-[0_0_8px_rgba(16,185,129,0.2)]";
            ringColor = "ring-emerald-400/40";
          } else if (lat < 300) {
            statusColor = "bg-amber-500/20 border-amber-400/50 shadow-[0_0_8px_rgba(245,158,11,0.2)]";
            ringColor = "ring-amber-400/40";
          } else {
            statusColor = "bg-rose-500/30 border-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.3)]";
            ringColor = "ring-rose-400/40";
          }
        }

        // Pulse speed based on traffic
        const pulseDuration =
          trafficVolume > 0.8 ? "1s" : trafficVolume > 0.4 ? "2s" : "3.5s";

        return (
          <div
            key={comp.id}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 group pointer-events-auto"
            style={{
              left: `${px}%`,
              top: `${py}%`,
            }}
          >
            {/* Pulsing Alert Hook */}
            <div
              className={`absolute inset-0 rounded-full animate-ping opacity-60 ${ringColor}`}
              style={{ animationDuration: pulseDuration }}
            ></div>

            <button
              onClick={() => onSelect(comp)}
              onMouseEnter={() => setTooltip(comp.id)}
              onMouseLeave={() => setTooltip(null)}
              className={`relative flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all duration-300 ring-offset-2 ring-offset-slate-900 ${
                isActive ? "ring-2 ring-white scale-110" : "hover:scale-110 active:scale-95"
              } ${statusColor}`}
            >
              {tooltip === comp.id && (
                <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 whitespace-nowrap z-50 pointer-events-none animate-fade-in">
                  <div className={`${isBottleneck ? "bg-red-900 border-red-600" : "bg-slate-900 border-slate-700"} border text-white text-[10px] py-1 px-2 rounded shadow-xl`}>
                    {isBottleneck ? `⚠ ${comp.name} — Bottleneck` : comp.name}
                  </div>
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default HotspotLayer;
