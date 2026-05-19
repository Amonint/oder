from __future__ import annotations

from typing import Any


def _clamp_unit(value: float) -> float:
    return max(0.0, min(0.999, value))


def _to_grid_index(value: float, grid_size: int) -> int:
    return int(_clamp_unit(value) * grid_size)


def build_density_heatmap(
    gaze_points: list[dict[str, Any]],
    *,
    aois: list[dict[str, Any]] | None = None,
    grid_size: int = 32,
    sessions_count: int | None = None,
) -> dict[str, Any]:
    size = max(1, int(grid_size))
    grid = [[0.0 for _ in range(size)] for _ in range(size)]
    aoi_attention_ms: dict[str, int] = {str(a["id"]): 0 for a in (aois or [])}

    for idx, point in enumerate(gaze_points):
        x = _clamp_unit(float(point.get("x", 0.0)))
        y = _clamp_unit(float(point.get("y", 0.0)))
        gx = _to_grid_index(x, size)
        gy = _to_grid_index(y, size)
        grid[gy][gx] += 1.0

        dt = 32
        if idx + 1 < len(gaze_points):
            curr_t = int(point.get("t", 0))
            next_t = int(gaze_points[idx + 1].get("t", curr_t + 32))
            dt = max(1, next_t - curr_t)

        for aoi in aois or []:
            ax = float(aoi.get("x", 0.0))
            ay = float(aoi.get("y", 0.0))
            aw = float(aoi.get("w", 0.0))
            ah = float(aoi.get("h", 0.0))
            if ax <= x <= ax + aw and ay <= y <= ay + ah:
                aoi_attention_ms[str(aoi["id"])] += dt

    max_cell = max((max(row) for row in grid), default=0.0)
    if max_cell > 0:
        for y in range(size):
            for x in range(size):
                grid[y][x] = grid[y][x] / max_cell

    inferred_sessions = 1 if len(gaze_points) > 0 else 0
    return {
        "grid": grid,
        "aoi_attention_ms": aoi_attention_ms,
        "sessions_count": sessions_count if sessions_count is not None else inferred_sessions,
    }
