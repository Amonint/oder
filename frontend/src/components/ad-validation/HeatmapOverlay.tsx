import { useEffect, useRef } from "react";
import { drawHeatmapToCanvas } from "@/lib/heatmap/heatmapRenderer";

interface HeatmapOverlayProps {
  grid: number[][] | null;
  imageUrl?: string | null;
}

export default function HeatmapOverlay({ grid, imageUrl }: HeatmapOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 640;
    canvas.height = 360;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!imageUrl) {
      if (grid) drawHeatmapToCanvas(canvas, grid);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (grid) drawHeatmapToCanvas(canvas, grid);
    };
    img.onerror = () => {
      if (grid) drawHeatmapToCanvas(canvas, grid);
    };
    img.src = imageUrl;
  }, [grid, imageUrl]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="heatmap-canvas"
      className="h-auto w-full rounded border"
    />
  );
}
