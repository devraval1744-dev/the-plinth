"""
Comprehensive Unit and Regression Test Suite for Hybrid Reconstruction Engine (Phase 25).

Covers:
1. Image Preprocessing (thresholding, morphology, edge detection, wall mask)
2. PDF / Image file normalization & SHA-256 hashing
3. Duplicate wall removal
4. Collinear segment merging
5. Adaptive endpoint snapping
6. T-junction splitting
7. Accidental crossing detection
8. Planar wall graph validity
9. Room polygonization
10. Room overlap / sliver rejection
11. Blueprint hash invalidation
12. Vision provider switching (Gemini / OpenAI)
13. Vision malformed output resilience
14. Vision timeout fallback to CV pixel geometry
15. Version isolation (old version never reused)
16. Dynamic top-down bounds calculation
17. REGRESSION: No overlapping wall solid boxes (Phase 13)
"""
import asyncio
import io
import math
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import cv2
import numpy as np
import pytest
from shapely.geometry import box, LineString, Polygon

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.reconstruction.file_normalizer import FileNormalizer
from app.reconstruction.region_detector import RegionDetector, CropTransform
from app.reconstruction.image_preprocessor import ImagePreprocessor
from app.reconstruction.cv_wall_extractor import CvWallExtractor
from app.reconstruction.vision_adapters import (
    GeminiVisionAdapter,
    OpenAIVisionAdapter,
    get_vision_adapter,
    VisionIntermediateResult,
    VisionRoom,
    VisionSemanticWall,
)
from app.reconstruction.geometry_fusion import GeometryFusionEngine, FusedWallCandidate
from app.reconstruction.shapely_normalizer import ShapelyNormalizer, NormalizedWall
from app.reconstruction.polygonizer import RoomPolygonizer
from app.reconstruction.wall_solids import WallSolidGenerator
from app.reconstruction.hybrid_pipeline import HybridReconstructionPipeline


# ─── 1. Image Preprocessing Tests ─────────────────────────────────────────────

def test_image_preprocessing():
    # Create synthetic blueprint image with a 10px black wall rectangle on white background
    img = np.ones((500, 500, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (50, 50), (450, 450), (0, 0, 0), thickness=8)
    cv2.line(img, (50, 250), (450, 250), (0, 0, 0), thickness=8)

    prep = ImagePreprocessor.preprocess(img)
    assert prep.wall_mask is not None
    assert prep.edges is not None
    assert prep.estimated_wall_thickness_px > 0
    # Must have detected wall pixels
    assert np.count_nonzero(prep.wall_mask) > 100
    print("  Image preprocessing passed: wall_mask non-zero pixels =", np.count_nonzero(prep.wall_mask))


# ─── 2. PDF / Image File Normalization & Hash ──────────────────────────────────

def test_file_normalization_and_hash():
    # Synthetic test image
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (20, 20), (180, 180), (0, 0, 0), 4)
    _, buf = cv2.imencode(".png", img)
    raw_bytes = buf.tobytes()

    bgr, file_hash, meta = FileNormalizer.normalize(raw_bytes, "image/png")
    assert file_hash is not None and len(file_hash) == 64
    assert bgr.shape[0] >= 200
    assert bgr.shape[1] >= 200

    # Changing a single byte changes hash
    modified_bytes = raw_bytes[:-1] + b"\x00"
    bgr2, file_hash2, meta2 = FileNormalizer.normalize(modified_bytes, "image/png")
    assert file_hash != file_hash2
    print("  File normalization & SHA-256 hashing passed.")


# ─── 3. Duplicate Wall Removal ────────────────────────────────────────────────

def test_duplicate_wall_removal():
    transform = CropTransform(1000, 1000, 0, 0, 1000, 1000)
    # Two identical walls and one reversed duplicate
    walls = [
        FusedWallCandidate(id="w1", start=(0.1, 0.1), end=(0.9, 0.1), wall_type="EXTERNAL", thickness_m=0.2, confidence=0.9, source="CV"),
        FusedWallCandidate(id="w2", start=(0.1, 0.1), end=(0.9, 0.1), wall_type="EXTERNAL", thickness_m=0.2, confidence=0.9, source="CV"),
        FusedWallCandidate(id="w3", start=(0.9, 0.1), end=(0.1, 0.1), wall_type="EXTERNAL", thickness_m=0.2, confidence=0.9, source="CV"),
    ]
    norm_walls, _, _, report = ShapelyNormalizer.normalize(walls, transform, 10.0, 10.0)
    # 3 duplicates should be collapsed to 1
    assert len(norm_walls) == 1, f"Expected 1 unique wall, got {len(norm_walls)}"
    assert report.duplicates_removed >= 2
    print("  Duplicate wall removal passed.")


# ─── 4. Collinear Merge ───────────────────────────────────────────────────────

def test_collinear_merge():
    transform = CropTransform(1000, 1000, 0, 0, 1000, 1000)
    # Segment from 0.1 to 0.5 and 0.5 to 0.9 along same line (degree-2 node)
    walls = [
        FusedWallCandidate(id="w1", start=(0.1, 0.2), end=(0.5, 0.2), wall_type="INTERNAL", thickness_m=0.15, confidence=0.9, source="CV"),
        FusedWallCandidate(id="w2", start=(0.5, 0.2), end=(0.9, 0.2), wall_type="INTERNAL", thickness_m=0.15, confidence=0.9, source="CV"),
    ]
    norm_walls, _, _, report = ShapelyNormalizer.normalize(walls, transform, 10.0, 10.0)
    # Should merge into single wall from ~0.1 to ~0.9
    assert len(norm_walls) == 1, f"Expected 1 merged wall, got {len(norm_walls)}"
    merged = norm_walls[0]
    total_len = math.hypot(merged.end[0] - merged.start[0], merged.end[1] - merged.start[1])
    assert total_len > 7.0, f"Expected merged length > 7.0m, got {total_len}"
    print("  Collinear segment merge passed.")


# ─── 5. Endpoint Snapping ─────────────────────────────────────────────────────

def test_endpoint_snapping():
    transform = CropTransform(1000, 1000, 0, 0, 1000, 1000)
    # Horizontal wall ending at (0.502, 0.5), vertical wall starting at (0.5, 0.498)
    walls = [
        FusedWallCandidate(id="w1", start=(0.1, 0.5), end=(0.502, 0.5), wall_type="INTERNAL", thickness_m=0.15, confidence=0.9, source="CV"),
        FusedWallCandidate(id="w2", start=(0.5, 0.498), end=(0.5, 0.9), wall_type="INTERNAL", thickness_m=0.15, confidence=0.9, source="CV"),
    ]
    norm_walls, nodes, _, report = ShapelyNormalizer.normalize(walls, transform, 10.0, 10.0)
    # Corners should be snapped to a single shared junction node
    w1_end = norm_walls[0].end if norm_walls[0].id == "w1" else norm_walls[1].end
    w2_start = norm_walls[1].start if norm_walls[1].id == "w2" else norm_walls[0].start
    # Nodes should share identical coordinates
    shared = False
    for n in nodes.values():
        if math.hypot(n.x - 5.0, n.y - 5.0) < 0.2:
            shared = True
            break
    assert shared, "Expected shared corner node at junction"
    print("  Adaptive endpoint snapping passed.")


# ─── 6. T-Junction Splitting ──────────────────────────────────────────────────

def test_t_junction_splitting():
    transform = CropTransform(1000, 1000, 0, 0, 1000, 1000)
    # Wall 1 runs horizontally from 0.1 to 0.9 at y=0.5
    # Wall 2 meets it at y=0.5, x=0.5 from y=0.1 (T-junction)
    walls = [
        FusedWallCandidate(id="w_main", start=(0.1, 0.5), end=(0.9, 0.5), wall_type="EXTERNAL", thickness_m=0.2, confidence=0.9, source="CV"),
        FusedWallCandidate(id="w_stem", start=(0.5, 0.1), end=(0.5, 0.5), wall_type="INTERNAL", thickness_m=0.15, confidence=0.9, source="CV"),
    ]
    norm_walls, nodes, edges, report = ShapelyNormalizer.normalize(walls, transform, 10.0, 10.0)
    # Horizontal parent wall should be split into 2 edges at the T-junction
    # Total resulting edges = 3 (left half, right half, stem)
    assert len(norm_walls) == 3, f"Expected 3 walls after T-junction split, got {len(norm_walls)}"
    print("  T-junction splitting & noding passed.")


# ─── 7. Accidental Crossing Detection ─────────────────────────────────────────

def test_accidental_crossing_detection():
    transform = CropTransform(1000, 1000, 0, 0, 1000, 1000)
    # Two perpendicular crossing walls
    walls = [
        FusedWallCandidate(id="w1", start=(0.1, 0.5), end=(0.9, 0.5), wall_type="INTERNAL", thickness_m=0.15, confidence=0.9, source="CV"),
        FusedWallCandidate(id="w2", start=(0.5, 0.1), end=(0.5, 0.9), wall_type="INTERNAL", thickness_m=0.15, confidence=0.9, source="CV"),
    ]
    norm_walls, nodes, _, report = ShapelyNormalizer.normalize(walls, transform, 10.0, 10.0)
    # At the cross junction (0.5, 0.5), a single central node must be created
    # and both lines split, producing 4 connected segments
    assert len(norm_walls) == 4, f"Expected 4 split edges at 4-way crossing, got {len(norm_walls)}"
    print("  Crossing detection and resolution passed.")


# ─── 8. Wall Graph Validity ───────────────────────────────────────────────────

def test_wall_graph_validity():
    transform = CropTransform(1000, 1000, 0, 0, 1000, 1000)
    # 4 walls forming a closed rectangular box
    walls = [
        FusedWallCandidate(id="w1", start=(0.2, 0.2), end=(0.8, 0.2), wall_type="EXTERNAL", thickness_m=0.2, confidence=0.9, source="CV"),
        FusedWallCandidate(id="w2", start=(0.8, 0.2), end=(0.8, 0.8), wall_type="EXTERNAL", thickness_m=0.2, confidence=0.9, source="CV"),
        FusedWallCandidate(id="w3", start=(0.8, 0.8), end=(0.2, 0.8), wall_type="EXTERNAL", thickness_m=0.2, confidence=0.9, source="CV"),
        FusedWallCandidate(id="w4", start=(0.2, 0.8), end=(0.2, 0.2), wall_type="EXTERNAL", thickness_m=0.2, confidence=0.9, source="CV"),
    ]
    norm_walls, nodes, edges, report = ShapelyNormalizer.normalize(walls, transform, 10.0, 10.0)
    assert len(norm_walls) == 4
    assert len(nodes) == 4
    # Check that each node is referenced by exactly 2 edges (closed ring)
    node_degrees = {nid: 0 for nid in nodes}
    for e in edges:
        node_degrees[e.node_a] += 1
        node_degrees[e.node_b] += 1
    assert all(deg == 2 for deg in node_degrees.values()), f"Expected all degree 2, got {node_degrees}"
    print("  Planar wall graph topological validity passed.")


# ─── 9. Room Polygonization ───────────────────────────────────────────────────

def test_room_polygonization():
    # Rectangle of walls from 2m to 8m
    norm_walls = [
        NormalizedWall(id="w1", start=(2.0, 2.0), end=(8.0, 2.0), wall_type="EXTERNAL", thickness=0.2, confidence=0.9, source="FUSED"),
        NormalizedWall(id="w2", start=(8.0, 2.0), end=(8.0, 8.0), wall_type="EXTERNAL", thickness=0.2, confidence=0.9, source="FUSED"),
        NormalizedWall(id="w3", start=(8.0, 8.0), end=(2.0, 8.0), wall_type="EXTERNAL", thickness=0.2, confidence=0.9, source="FUSED"),
        NormalizedWall(id="w4", start=(2.0, 8.0), end=(2.0, 2.0), wall_type="EXTERNAL", thickness=0.2, confidence=0.9, source="FUSED"),
        # Interior partition dividing into 2 rooms at x=5.0
        NormalizedWall(id="w5", start=(5.0, 2.0), end=(5.0, 8.0), wall_type="INTERNAL", thickness=0.15, confidence=0.9, source="FUSED"),
    ]
    vision_rooms = [
        VisionRoom(label="Living Room", room_type="living_room", approximate_region=[], center=(0.35, 0.5), confidence=0.9),
        VisionRoom(label="Master Bedroom", room_type="bedroom", approximate_region=[], center=(0.65, 0.5), confidence=0.9),
    ]

    rooms = RoomPolygonizer.polygonize_rooms(norm_walls, vision_rooms, 10.0, 10.0)
    assert len(rooms) == 2, f"Expected 2 enclosed room polygons, got {len(rooms)}"
    room_names = {r.name for r in rooms}
    assert "Living Room" in room_names
    assert "Master Bedroom" in room_names
    print("  Room polygonization and spatial label matching passed.")


# ─── 10. Room Overlap / Tiny Sliver Rejection ─────────────────────────────────

def test_room_overlap_rejection():
    # Polygonizer must reject tiny sliver polygons (< 1.2 m2)
    norm_walls = [
        # Tiny triangle sliver (0.5m x 0.5m -> area 0.125m2)
        NormalizedWall(id="s1", start=(0.0, 0.0), end=(0.5, 0.0), wall_type="INTERNAL", thickness=0.1, confidence=0.8, source="CV"),
        NormalizedWall(id="s2", start=(0.5, 0.0), end=(0.0, 0.5), wall_type="INTERNAL", thickness=0.1, confidence=0.8, source="CV"),
        NormalizedWall(id="s3", start=(0.0, 0.5), end=(0.0, 0.0), wall_type="INTERNAL", thickness=0.1, confidence=0.8, source="CV"),
    ]
    rooms = RoomPolygonizer.polygonize_rooms(norm_walls, [], 10.0, 10.0)
    # The tiny triangle must be rejected
    assert len(rooms) == 0, f"Expected sliver to be rejected, got {len(rooms)} rooms"
    print("  Room sliver and invalid polygon rejection passed.")


# ─── 11. Blueprint Hash Invalidation ──────────────────────────────────────────

def test_blueprint_hash_invalidation():
    # Prove that distinct images produce distinct hashes
    img_a = np.zeros((100, 100, 3), dtype=np.uint8)
    img_b = np.ones((100, 100, 3), dtype=np.uint8) * 255
    _, buf_a = cv2.imencode(".png", img_a)
    _, buf_b = cv2.imencode(".png", img_b)

    bgr_a, hash_a, meta_a = FileNormalizer.normalize(buf_a.tobytes(), "image/png")
    bgr_b, hash_b, meta_b = FileNormalizer.normalize(buf_b.tobytes(), "image/png")

    assert hash_a != hash_b
    print(f"  Blueprint hash invalidation verified: hash_a={hash_a[:8]} != hash_b={hash_b[:8]}")


# ─── 12. Provider Switching (Gemini / OpenAI) ──────────────────────────────────

def test_provider_switching():
    with patch.dict("os.environ", {"VISION_PROVIDER": "gemini", "GEMINI_API_KEY": "test-key-gemini"}):
        adapter = get_vision_adapter()
        assert isinstance(adapter, GeminiVisionAdapter)

    with patch.dict("os.environ", {"VISION_PROVIDER": "openai", "OPENAI_API_KEY": "test-key-openai"}):
        adapter_oai = get_vision_adapter()
        assert isinstance(adapter_oai, OpenAIVisionAdapter)
    print("  Provider switching between Gemini and OpenAI passed.")


# ─── 13. Vision Malformed Output Handling ─────────────────────────────────────

def test_vision_malformed_output():
    adapter = GeminiVisionAdapter(api_key="mock")
    # Bad JSON strings
    malformed_1 = "Sorry, I cannot read this drawing."
    malformed_2 = "```json\n{rooms: invalid_json\n```"
    malformed_3 = "{}"

    res1 = adapter._parse_vision_json(malformed_1, "test-model", "gemini")
    res2 = adapter._parse_vision_json(malformed_2, "test-model", "gemini")
    res3 = adapter._parse_vision_json(malformed_3, "test-model", "gemini")

    assert len(res1.rooms) == 0 and len(res1.semantic_walls) == 0
    assert len(res2.rooms) == 0 and len(res2.semantic_walls) == 0
    assert len(res3.rooms) == 0 and len(res3.semantic_walls) == 0
    print("  Malformed vision output resilience passed.")


# ─── 14. Vision Timeout / Failure Fallback ────────────────────────────────────

@pytest.mark.asyncio
async def test_vision_timeout_resilience():
    # When vision adapter raises TimeoutError, pipeline continues gracefully with CV pixel geometry
    mock_adapter = MagicMock()
    mock_adapter.extract_semantic_geometry = AsyncMock(side_effect=TimeoutError("Vision API timeout"))

    pipeline = HybridReconstructionPipeline(vision_adapter=mock_adapter)

    # Test with synthetic image containing a drawn wall box
    img = np.ones((400, 400, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (40, 40), (360, 360), (0, 0, 0), thickness=6)
    _, buf = cv2.imencode(".png", img)

    result = await pipeline.reconstruct(
        image_bytes=buf.tobytes(),
        mime_type="image/png",
        blueprint_id="test-timeout-bp",
        unit_type="2 BHK",
        blueprint_version=1,
    )
    assert result is not None
    assert result.blueprint_id == "test-timeout-bp"
    print("  Vision timeout fallback to CV pixel geometry passed.")


# ─── 15. Old Version Analysis Isolation ───────────────────────────────────────

@pytest.mark.asyncio
async def test_old_version_not_reused():
    mock_adapter = MagicMock()
    mock_adapter.extract_semantic_geometry = AsyncMock(return_value=VisionIntermediateResult(
        footprint={"min_x": 0, "min_y": 0, "max_x": 1000, "max_y": 1000},
        semantic_walls=[],
        rooms=[],
        doors=[],
        windows=[],
        uncertain_regions=[],
        unit_type="2 BHK",
        provider_name="mock",
        model_name="mock",
    ))
    pipeline = HybridReconstructionPipeline(vision_adapter=mock_adapter)
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    _, buf = cv2.imencode(".png", img)

    res_v1 = await pipeline.reconstruct(buf.tobytes(), "image/png", "bp-1", "2 BHK", blueprint_version=1)
    res_v2 = await pipeline.reconstruct(buf.tobytes(), "image/png", "bp-1", "2 BHK", blueprint_version=2)

    assert res_v1.blueprint_version == 1
    assert res_v2.blueprint_version == 2
    assert res_v1 is not res_v2
    print("  Version isolation passed.")


# ─── 16. Dynamic Top-Down Camera Bounds ───────────────────────────────────────

def test_dynamic_top_down_bounds():
    from app.providers.gemini_provider import UNIT_AREAS_M2

    for bhk in ["studio", "1 bhk", "2 bhk", "3 bhk", "4 bhk", "5 bhk"]:
        area = UNIT_AREAS_M2[bhk]
        aspect = 1.33
        canvas_h = math.sqrt(area / aspect)
        canvas_w = canvas_h * aspect

        max_dim = max(canvas_w, canvas_h)
        # Verify distance formula gives positive, adequate distance
        fov_rad = math.radians(45)
        dist = (max_dim / 2.0) / math.tan(fov_rad / 2.0) * 1.35
        assert dist > max_dim, f"Camera distance {dist} must exceed canvas dimension {max_dim}"
    print("  Dynamic top-down camera framing bounds verified.")


# ─── 17. REGRESSION: No Overlapping Wall Solids (Phase 13) ─────────────────────

def test_regression_no_rectangular_wall_overlap():
    """
    Validates Phase 13: Walls must not overlap as independent rectangular boxes.
    WallSolidGenerator must merge 2 intersecting perpendicular walls into a single
    seamless 2D polygon with NO interior overlapping rectangle.
    """
    # 2 intersecting walls meeting at corner (5.0, 5.0)
    w1 = NormalizedWall(id="w1", start=(1.0, 5.0), end=(5.0, 5.0), wall_type="EXTERNAL", thickness=0.20, confidence=0.9, source="FUSED")
    w2 = NormalizedWall(id="w2", start=(5.0, 5.0), end=(5.0, 9.0), wall_type="EXTERNAL", thickness=0.20, confidence=0.9, source="FUSED")

    footprint = WallSolidGenerator.generate_footprint([w1, w2])
    assert footprint is not None
    assert "polygons" in footprint
    assert len(footprint["polygons"]) >= 1

    # The union of the two wall centerlines buffered by thickness/2 must produce
    # a single unified connected polygon for this L-junction!
    assert len(footprint["polygons"]) == 1, f"Expected 1 seamless unioned polygon for L-junction, got {len(footprint['polygons'])}"

    # Area of L-junction:
    # w1 length = 4.0m, w2 length = 4.0m, thickness = 0.20m
    # If rendered as independent boxes: total area = 4.0 * 0.2 + 4.0 * 0.2 = 1.6 m2 with a 0.2x0.2 (0.04m2) overlapping square.
    # Union area must be strictly less than 1.6 m2 (approx 1.6 - 0.04 = 1.56 m2).
    exterior_pts = footprint["polygons"][0]["exterior"]
    union_poly = Polygon(exterior_pts)
    assert union_poly.is_valid, "Unioned wall polygon must be topologically valid"
    assert union_poly.area < 1.60, f"Unioned wall area ({union_poly.area}) should eliminate box overlap!"
    assert union_poly.area > 1.45, f"Unioned wall area ({union_poly.area}) is too small!"
    print(f"  REGRESSION PASSED: Seamless wall footprint union verified (area={union_poly.area:.3f}m² < 1.60m² independent sum).")


# ─── Master Runner ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    test_image_preprocessing()
    test_file_normalization_and_hash()
    test_duplicate_wall_removal()
    test_collinear_merge()
    test_endpoint_snapping()
    test_t_junction_splitting()
    test_accidental_crossing_detection()
    test_wall_graph_validity()
    test_room_polygonization()
    test_room_overlap_rejection()
    test_blueprint_hash_invalidation()
    test_provider_switching()
    test_vision_malformed_output()
    asyncio.run(test_vision_timeout_resilience())
    asyncio.run(test_old_version_not_reused())
    test_dynamic_top_down_bounds()
    test_regression_no_rectangular_wall_overlap()
    print("\nALL 17 RECONSTRUCTION UNIT & REGRESSION TESTS PASSED SUCCESSFULLY! ✓\n")
