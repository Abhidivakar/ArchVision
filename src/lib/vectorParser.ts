"use client";

import { CalibrationOverride } from "./types";

/**
 * Parses vector files (SVG or Draw.io) to extract precise coordinates.
 * This is used to achieve 100% accuracy when vector source is available.
 */

export interface VectorNode {
  id: string;
  name: string;
  service: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
}

export async function parseVectorFile(file: File): Promise<VectorNode[]> {
  const content = await file.text();
  const name = file.name.toLowerCase();

  if (name.endsWith(".svg")) {
    return parseSVG(content);
  } else if (name.endsWith(".drawio") || name.endsWith(".xml")) {
    return parseDrawio(content);
  }

  return [];
}

/**
 * Basic SVG parser. Looks for elements that might be icons.
 * Many GCP-specific SVGs from tools have IDs or classes.
 */
function parseSVG(svgContent: string): VectorNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return [];

  // Get viewbox or width/height for coordinate normalization
  let viewBox = svg.getAttribute("viewBox")?.split(/\s+|,/) || [];
  let width = parseFloat(svg.getAttribute("width") || "1000");
  let height = parseFloat(svg.getAttribute("height") || "1000");

  let minX = 0, minY = 0;
  if (viewBox.length === 4) {
    minX = parseFloat(viewBox[0]);
    minY = parseFloat(viewBox[1]);
    width = parseFloat(viewBox[2]);
    height = parseFloat(viewBox[3]);
  }

  const nodes: VectorNode[] = [];
  
  // Look for <image> or <g> or <path> elements that might be GCP icons
  // Lucidchart/Draw.io often use <image> for logos
  const elements = doc.querySelectorAll("image, g[id], g[class], rect[id]");
  
  elements.forEach((el, index) => {
    const id = el.getAttribute("id") || `node-${index}`;
    const name = el.getAttribute("name") || el.getAttribute("data-name") || id;
    
    // Attempt to guess service from ID/Class
    const serviceString = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
    const lowerServiceStr = serviceString.toLowerCase();
    if (!lowerServiceStr.includes("gcp") && !lowerServiceStr.includes("aws") && !lowerServiceStr.includes("azure") && !lowerServiceStr.includes("cloud")) {
        // Skip non-cloud elements if possible, but for now let's be inclusive
    }

    const rect = (el as SVGGraphicsElement).getBBox?.() || { x: 0, y: 0, width: 0, height: 0 };
    
    // Normalize to 0-1000
    const xmin = ((rect.x - minX) / width) * 1000;
    const ymin = ((rect.y - minY) / height) * 1000;
    const xmax = ((rect.x + rect.width - minX) / width) * 1000;
    const ymax = ((rect.y + rect.height - minY) / height) * 1000;

    nodes.push({
      id,
      name,
      service: "Detected SVG Component",
      box_2d: [ymin, xmin, ymax, xmax]
    });
  });

  return nodes;
}

/**
 * Basic Draw.io parser. Handles XML structure.
 * Note: Does not handle compressed XML yet.
 */
function parseDrawio(xmlContent: string): VectorNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, "text/xml");
  
  // Draw.io XML structure: mxfile > diagram > mxGraphModel > root > mxCell
  const cells = doc.querySelectorAll("mxCell");
  const nodes: VectorNode[] = [];

  // Need to find the overall canvas bounds to normalize
  // Or use a default large grid (Lucid/Draw.io is usually infinite)
  // Let's find min/max of all cells to create a "bounding box" of the diagram
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const validCells: any[] = [];
  cells.forEach(cell => {
    const geo = cell.querySelector("mxGeometry");
    if (geo && cell.getAttribute("vertex") === "1") {
        const x = parseFloat(geo.getAttribute("x") || "0");
        const y = parseFloat(geo.getAttribute("y") || "0");
        const w = parseFloat(geo.getAttribute("width") || "0");
        const h = parseFloat(geo.getAttribute("height") || "0");
        
        if (w > 0 && h > 0) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
            validCells.push({ cell, x, y, w, h });
        }
    }
  });

  // Add 10% padding
  const totalW = (maxX - minX) || 1000;
  const totalH = (maxY - minY) || 1000;
  const padX = totalW * 0.05;
  const padY = totalH * 0.05;

  validCells.forEach(item => {
    const { cell, x, y, w, h } = item;
    const style = cell.getAttribute("style") || "";
    
    // Only include if it looks like a component (not a container/group if possible)
    // Style usually contains 'image=...' for GCP icons
    if (style.includes("image") || style.includes("fillColor")) {
        const xmin = ((x - (minX - padX)) / (totalW + 2 * padX)) * 1000;
        const ymin = ((y - (minY - padY)) / (totalH + 2 * padY)) * 1000;
        const xmax = ((x + w - (minX - padX)) / (totalW + 2 * padX)) * 1000;
        const ymax = ((y + h - (minY - padY)) / (totalH + 2 * padY)) * 1000;

        nodes.push({
            id: cell.getAttribute("id") || "cell",
            name: cell.getAttribute("value") || "Component",
            service: "Draw.io Component",
            box_2d: [ymin, xmin, ymax, xmax]
        });
    }
  });

  return nodes;
}
