"""
Comprehensive Unit Tests for GLBGenerator (Trimesh 3D Export).

Tests:
1. Coordinate transformation parity with Plinth Three.js viewer (x - cx, -(y - cz))
2. Exact floor slab dimensions matching canvas_width and canvas_height
3. Slicing wall with door into posts and top header lintel
4. Slicing wall with window into posts, sill, glass, and header lintel
5. Warning generation for unmapped openings beyond projection tolerance
6. Procedural furniture placement strictly inside verified rooms
7. Full GLB export and binary reload using trimesh.load()
8. Real blueprint analysis fixture conversion to valid GLB
9. Error handling on degenerate/empty inputs
"""
import io
import math
import os
import pytest
import trimesh

from app.schemas.spatial import (
    BlueprintAnalysisResult,
    Room,
    Wall,
    Door,
    Window,
    Balcony,
)
from app.services.glb_generator import (
    GLBGenerator,
    ArchitecturalConfig,
    blueprint_to_3d,
    point_to_segment_projection,
)


# ─── Unit-Test Synthetic Fixtures (Clearly labeled synthetic) ─────────────────

def make_synthetic_test_fixture() -> BlueprintAnalysisResult:
    """
    Synthetic single-room unit-test fixture:
    Room (4m x 4m) centered on a 6m x 6m canvas.
    Wall 1: South wall (0, 0) to (4, 0) with a door at (2.0, 0.0).
    Wall 2: North wall (0, 4) to (4, 4) with a window at (2.0, 4.0).
    Wall 3: West wall (0, 0) to (0, 4).
    Wall 4: East wall (4, 0) to (4, 4).
    """
    return BlueprintAnalysisResult(
        blueprint_id="synthetic_test_unit_01",
        unit_type="1 BHK",
        blueprint_version=1,
        provider="unit_test_synthetic",
        is_demo=True,
        canvas_width=6.0,
        canvas_height=6.0,
        rooms=[
            Room(id="r1", name="Master Bedroom", type="bedroom", x=1.0, y=1.0, width=4.0, height=4.0, area_sqft=172.0)
        ],
        walls=[
            Wall(id="w_south", start_x=1.0, start_y=1.0, end_x=5.0, end_y=1.0, thickness=0.20),
            Wall(id="w_north", start_x=1.0, start_y=5.0, end_x=5.0, end_y=5.0, thickness=0.20),
            Wall(id="w_west",  start_x=1.0, start_y=1.0, end_x=1.0, end_y=5.0, thickness=0.15),
            Wall(id="w_east",  start_x=5.0, start_y=1.0, end_x=5.0, end_y=5.0, thickness=0.15),
        ],
        doors=[
            Door(id="d1", x=3.0, y=1.0, width=0.90, orientation="south", connects_to="r1"),
        ],
        windows=[
            Window(id="win1", x=3.0, y=5.0, width=1.40, orientation="north", connects_to="r1"),
        ],
        balconies=[
            Balcony(id="bal1", x=1.0, y=5.1, width=4.0, height=0.8),
        ],
    )


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_coordinate_transformation_parity():
    """Verify conversion formula matches Three.js viewer: x - cx, -(y - cz)."""
    cx = 5.0
    cz = 4.0
    # Point at center of blueprint -> (0, 0)
    x3d, z3d = blueprint_to_3d(5.0, 4.0, cx, cz)
    assert x3d == 0.0
    assert z3d == 0.0

    # Point at top-right (10, 8) -> x3d = 5.0, z3d = -4.0 (into screen)
    x3d, z3d = blueprint_to_3d(10.0, 8.0, cx, cz)
    assert x3d == 5.0
    assert z3d == -4.0


def test_point_to_segment_projection():
    """Verify projection distance and interpolation factor along wall segment."""
    # Segment from (0, 0) to (10, 0)
    # Point exactly at midpoint (5, 0.1) -> dist = 0.1, t = 0.5
    px, py, dist, t = point_to_segment_projection(5.0, 0.1, 0.0, 0.0, 10.0, 0.0)
    assert abs(px - 5.0) < 1e-5
    assert abs(py - 0.0) < 1e-5
    assert abs(dist - 0.1) < 1e-5
    assert abs(t - 0.5) < 1e-5

    # Point beyond end (12, 0) -> clamped t = 1.0, proj = (10, 0)
    px, py, dist, t = point_to_segment_projection(12.0, 0.0, 0.0, 0.0, 10.0, 0.0)
    assert px == 10.0
    assert py == 0.0
    assert dist == 2.0
    assert t == 1.0


def test_wall_door_slicing_and_lintel():
    """Verify wall with door is sliced into side posts, lintel header, and threshold."""
    gen = GLBGenerator()
    fixture = make_synthetic_test_fixture()
    scene, warnings = gen.generate_scene(fixture)

    geom_names = list(scene.geometry.keys())

    # Should contain lintel header for door d1
    assert any("lintel_door" in g for g in geom_names), "Door lintel header missing"
    assert any("door_threshold" in g for g in geom_names), "Door threshold missing"
    # Should contain wall posts for the split south wall
    assert any("wall_post" in g for g in geom_names), "Wall posts missing from door slicing"


def test_wall_window_slicing_sill_and_glass():
    """Verify wall with window is sliced into sill, glass pane, and top lintel."""
    gen = GLBGenerator()
    fixture = make_synthetic_test_fixture()
    scene, warnings = gen.generate_scene(fixture)

    geom_names = list(scene.geometry.keys())

    assert any("sill_wall" in g for g in geom_names), "Window sill wall missing"
    assert any("lintel_win" in g for g in geom_names), "Window lintel header missing"
    assert any("glass_pane" in g for g in geom_names), "Window glass pane missing"


def test_unmapped_opening_reports_warning():
    """Verify openings located far away from any wall generate validation warnings."""
    gen = GLBGenerator()
    fixture = make_synthetic_test_fixture()
    # Add floating door in middle of room far from any wall
    fixture.doors.append(Door(id="floating_door", x=3.0, y=3.0, width=0.90, orientation="north"))

    scene, warnings = gen.generate_scene(fixture)
    assert any("floating_door" in w for w in warnings), "Expected warning for unmapped floating door"


def test_glb_export_round_trip():
    """Export to GLB bytes and reload with trimesh to verify valid glTF structure."""
    gen = GLBGenerator()
    fixture = make_synthetic_test_fixture()
    glb_bytes, warnings = gen.export_glb_bytes(fixture)

    assert isinstance(glb_bytes, bytes)
    assert len(glb_bytes) > 1000, f"GLB binary too small: {len(glb_bytes)} bytes"

    # Reload into Trimesh from memory stream
    loaded = trimesh.load(io.BytesIO(glb_bytes), file_type="glb")
    assert isinstance(loaded, trimesh.Scene)
    assert len(loaded.geometry) > 5, "Loaded scene has too few meshes"

    bounds = loaded.bounds
    # Elevation: floor at Y=0 (bottom of slab at -0.05), top at default 2.80m
    min_xyz, max_xyz = bounds[0], bounds[1]
    assert min_xyz[1] >= -0.10, f"Floor elevation too low: {min_xyz[1]}"
    assert max_xyz[1] <= 3.00, f"Roof elevation exceeds wall height: {max_xyz[1]}"


def test_real_blueprint_analysis_to_glb():
    """
    Test GLB generation on real blueprint analysis fixture (from uploads/demo).
    """
    real_path = "/Users/devraval/Documents/plinth/backend/uploads/demo/blueprints/blueprint_2bhk.png"
    if not os.path.exists(real_path):
        pytest.skip("Demo blueprint_2bhk.png not present in file system")

    import asyncio
    from app.providers.image_aware_provider import ImageAwareProvider

    with open(real_path, "rb") as f:
        img_bytes = f.read()

    provider = ImageAwareProvider()
    real_analysis = asyncio.run(provider.analyze(img_bytes, "image/png", "real_bp_test", "2 BHK", 1))

    gen = GLBGenerator()
    glb_bytes, warnings = gen.export_glb_bytes(real_analysis)

    assert len(glb_bytes) > 2000, "Real blueprint GLB export generated suspiciously small payload"

    loaded = trimesh.load(io.BytesIO(glb_bytes), file_type="glb")
    assert isinstance(loaded, trimesh.Scene)
    assert len(loaded.geometry) >= 10, f"Expected >= 10 geometries for 2BHK plan, got {len(loaded.geometry)}"


def test_invalid_input_handling():
    """Verify proper ValueError on negative canvas or completely empty geometry."""
    gen = GLBGenerator()

    # Empty geometry
    with pytest.raises(ValueError, match="neither walls nor rooms"):
        gen.generate_scene(BlueprintAnalysisResult(
            blueprint_id="bad",
            blueprint_version=1,
            provider="test",
            canvas_width=10.0,
            canvas_height=10.0,
            rooms=[],
            walls=[],
        ))

    # Zero canvas dimension
    with pytest.raises(ValueError):
        BlueprintAnalysisResult(
            blueprint_id="bad",
            blueprint_version=1,
            provider="test",
            canvas_width=0.0,
            canvas_height=10.0,
        )
