from oderbiz_analytics.services.heatmap_aggregate import build_density_heatmap


def test_build_density_heatmap_returns_grid_and_aoi_times():
    gaze_points = [
        {"x": 0.2, "y": 0.2, "t": 0},
        {"x": 0.21, "y": 0.19, "t": 32},
        {"x": 0.7, "y": 0.6, "t": 64},
    ]
    aois = [
        {"id": "headline", "x": 0.1, "y": 0.1, "w": 0.3, "h": 0.2},
        {"id": "cta", "x": 0.6, "y": 0.5, "w": 0.2, "h": 0.2},
    ]

    result = build_density_heatmap(gaze_points, aois=aois, grid_size=8)

    assert len(result["grid"]) == 8
    assert len(result["grid"][0]) == 8
    assert result["sessions_count"] == 1
    assert result["aoi_attention_ms"]["headline"] > 0
    assert result["aoi_attention_ms"]["cta"] > 0
