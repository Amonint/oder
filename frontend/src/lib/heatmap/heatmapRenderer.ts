export function intensityToRgba(value: number): string {
  const v = Math.max(0, Math.min(1, value));
  if (v === 0) return "rgba(0,0,255,0.00)";
  if (v >= 1) return "rgba(255,0,0,0.85)";
  if (v >= 0.5) return `rgba(255,165,0,${v.toFixed(2)})`;
  return `rgba(0,128,255,${v.toFixed(2)})`;
}

export function drawHeatmapToCanvas(
  canvas: HTMLCanvasElement,
  grid: number[][],
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  if (rows === 0 || cols === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const intensity = Math.max(0, Math.min(1, Number(grid[y][x] ?? 0)));
      ctx.fillStyle = intensityToRgba(intensity);
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
    }
  }
}
