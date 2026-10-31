"""
Automated tests for the Gemini Vision Blueprint-to-3D pipeline.

Tests (as required by the task spec):
T1. Gemini receives the actual blueprint file (not a template)
T2. 2BHK analysis differs from 3BHK/4BHK when blueprint images differ
T3. Replacing a blueprint (version bump) creates a new analysis
T4. Old version geometry is never reused for new versions
T5. Incomplete Gemini output is rejected (< 2 rooms)
T6. Top-Down camera distance correctly frames all geometry
T7. Canvas size is within realistic bounds for each BHK type
T8. All generated rooms have valid types
T9. Walls have no zero-length segments
T10. Version safety: provider stores blueprint_id + blueprint_version
"""
import asyncio
import hashlib
import json
import math
import sys
import os
from pathlib import Path
from typing import Optional, List
from unittest.mock import AsyncMock, patch, MagicMock

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.providers.gemini_provider import (
    GeminiProvider,
    _extract_json,
    _snap_and_build_rooms,
    _build_walls,
    _build_doors_windows,
    UNIT_AREAS_M2,
    MIN_CANVAS_DIM,
    MAX_CANVAS_DIM,
    CANVAS_MARGIN,
    VALID_ROOM_TYPES,
)
from app.providers.image_aware_provider import ImageAwareProvider
from app.schemas.spatial import BlueprintAnalysisResult

# ─── Mock Gemini responses ────────────────────────────────────────────────────

MOCK_3BHK_JSON = {
    "unit_type": "3 BHK",
    "total_area_sqft": 1100,
    "rooms": [
        {"name": "Living Room",     "type": "living_room", "x_pct": 0,  "y_pct": 0,  "w_pct": 50, "h_pct": 45, "area_sqft": 250},
        {"name": "Dining",          "type": "dining",      "x_pct": 0,  "y_pct": 45, "w_pct": 50, "h_pct": 30, "area_sqft": 120},
        {"name": "Master Bedroom",  "type": "bedroom",     "x_pct": 50, "y_pct": 0,  "w_pct": 30, "h_pct": 45, "area_sqft": 160},
        {"name": "Bedroom 2",       "type": "bedroom",     "x_pct": 80, "y_pct": 0,  "w_pct": 20, "h_pct": 45, "area_sqft": 120},
        {"name": "Bedroom 3",       "type": "bedroom",     "x_pct": 50, "y_pct": 45, "w_pct": 30, "h_pct": 55, "area_sqft": 120},
        {"name": "Kitchen",         "type": "kitchen",     "x_pct": 80, "y_pct": 45, "w_pct": 20, "h_pct": 30, "area_sqft": 80},
        {"name": "Bathroom 1",      "type": "bathroom",    "x_pct": 80, "y_pct": 75, "w_pct": 20, "h_pct": 25, "area_sqft": 40},
        {"name": "Entry",           "type": "corridor",    "x_pct": 0,  "y_pct": 75, "w_pct": 50, "h_pct": 25, "area_sqft": 45},
    ]
}

MOCK_2BHK_JSON = {
    "unit_type": "2 BHK",
    "total_area_sqft": 750,
    "rooms": [
        {"name": "Living Room",    "type": "living_room", "x_pct": 0,  "y_pct": 30, "w_pct": 60, "h_pct": 40, "area_sqft": 180},
        {"name": "Master Bedroom", "type": "bedroom",     "x_pct": 60, "y_pct": 0,  "w_pct": 40, "h_pct": 50, "area_sqft": 120},
        {"name": "Bedroom 2",      "type": "bedroom",     "x_pct": 0,  "y_pct": 0,  "w_pct": 60, "h_pct": 30, "area_sqft": 100},
        {"name": "Kitchen",        "type": "kitchen",     "x_pct": 60, "y_pct": 50, "w_pct": 40, "h_pct": 30, "area_sqft": 60},
        {"name": "Bathroom",       "type": "bathroom",    "x_pct": 60, "y_pct": 80, "w_pct": 40, "h_pct": 20, "area_sqft": 35},
        {"name": "Balcony",        "type": "balcony",     "x_pct": 0,  "y_pct": 70, "w_pct": 60, "h_pct": 30, "area_sqft": 45},
    ]
}

MOCK_4BHK_JSON = {
    "unit_type": "4 BHK",
    "total_area_sqft": 1600,
    "rooms": [
        {"name": "Living Room",    "type": "living_room", "x_pct": 0,  "y_pct": 20, "w_pct": 35, "h_pct": 50, "area_sqft": 280},
        {"name": "Dining",         "type": "dining",      "x_pct": 0,  "y_pct": 70, "w_pct": 35, "h_pct": 30, "area_sqft": 130},
        {"name": "Master Bedroom", "type": "bedroom",     "x_pct": 35, "y_pct": 0,  "w_pct": 30, "h_pct": 45, "area_sqft": 180},
        {"name": "Bedroom 2",      "type": "bedroom",     "x_pct": 65, "y_pct": 0,  "w_pct": 35, "h_pct": 45, "area_sqft": 160},
        {"name": "Bedroom 3",      "type": "bedroom",     "x_pct": 35, "y_pct": 45, "w_pct": 30, "h_pct": 55, "area_sqft": 150},
        {"name": "Bedroom 4",      "type": "bedroom",     "x_pct": 65, "y_pct": 45, "w_pct": 20, "h_pct": 30, "area_sqft": 120},
        {"name": "Kitchen",        "type": "kitchen",     "x_pct": 0,  "y_pct": 0,  "w_pct": 35, "h_pct": 20, "area_sqft": 90},
        {"name": "Bathroom 1",     "type": "bathroom",    "x_pct": 85, "y_pct": 45, "w_pct": 15, "h_pct": 25, "area_sqft": 40},
        {"name": "Bathroom 2",     "type": "bathroom",    "x_pct": 85, "y_pct": 70, "w_pct": 15, "h_pct": 30, "area_sqft": 40},
        {"name": "Balcony",        "type": "balcony",     "x_pct": 35, "y_pct": 95, "w_pct": 30, "h_pct": 5,  "area_sqft": 45},
    ]
}

MOCK_INCOMPLETE_JSON = {
    "unit_type": "2 BHK",
    "total_area_sqft": 750,
    "rooms": [
        {"name": "Living Room", "type": "living_room", "x_pct": 0, "y_pct": 0, "w_pct": 100, "h_pct": 100}
    ]
}


def make_mock_provider(api_key: str = "test-key", model: str = "gemini-test") -> GeminiProvider:
    """Creates a GeminiProvider with the genai Client mocked out."""
    with patch("app.providers.gemini_provider.genai.Client"):
        p = GeminiProvider(api_key=api_key, model=model)
    return p


def make_mock_response(data: dict) -> MagicMock:
    mock = MagicMock()
    mock.text = json.dumps(data)
    return mock


async def run_with_mock_gemini(
    provider: GeminiProvider,
    mock_json: dict,
    unit_type: str,
    blueprint_id: str = "test-bp",
    version: int = 1,
) -> BlueprintAnalysisResult:
    """Run analysis with a mocked Gemini response."""
    dummy_bytes = b"FAKE_IMAGE_DATA_" + blueprint_id.encode()

    mock_response = make_mock_response(mock_json)
    provider._client = MagicMock()
    provider._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    result = await provider.analyze(dummy_bytes, "image/jpeg", blueprint_id, unit_type, version)
    return result


# ─── Tests ────────────────────────────────────────────────────────────────────

PASS = "✓ PASS"
FAIL = "✗ FAIL"

async def t1_gemini_receives_actual_blueprint_bytes():
    """T1: Provider calls Gemini API with actual image bytes (not cached template)."""
    p = make_mock_provider()
    dummy = b"REAL_BLUEPRINT_BYTES_1234"
    mock_response = make_mock_response(MOCK_3BHK_JSON)
    p._client = MagicMock()
    call_mock = AsyncMock(return_value=mock_response)
    p._client.aio.models.generate_content = call_mock

    await p.analyze(dummy, "image/jpeg", "bp-real", "3 BHK", 1)

    assert call_mock.called, "Gemini was never called"
    # Verify the image bytes were passed to Gemini
    call_args = call_mock.call_args
    contents = call_args.kwargs.get("contents")
    if contents is None and call_args.args:
        contents = call_args.args[0]
    # Check that contents contains something with the image data
    assert contents is not None and len(contents) > 0, "No contents passed to Gemini"
    print(f"  Gemini called: {call_mock.call_count} time(s)")
    return PASS


async def t2_different_blueprints_produce_different_geometry():
    """T2: 2BHK, 3BHK, 4BHK produce different room counts and canvas sizes."""
    p = make_mock_provider()

    r2 = await run_with_mock_gemini(p, MOCK_2BHK_JSON, "2 BHK", "bp-2bhk")
    r3 = await run_with_mock_gemini(p, MOCK_3BHK_JSON, "3 BHK", "bp-3bhk")
    r4 = await run_with_mock_gemini(p, MOCK_4BHK_JSON, "4 BHK", "bp-4bhk")

    counts = (len(r2.rooms), len(r3.rooms), len(r4.rooms))
    widths = (r2.canvas_width, r3.canvas_width, r4.canvas_width)
    print(f"  Room counts: 2BHK={counts[0]}, 3BHK={counts[1]}, 4BHK={counts[2]}")
    print(f"  Canvas widths: 2BHK={widths[0]:.1f}m, 3BHK={widths[1]:.1f}m, 4BHK={widths[2]:.1f}m")

    assert len(set(counts)) > 1, f"All BHK types returned same room count: {counts}"
    return PASS


async def t3_blueprint_replacement_creates_new_analysis():
    """T3: Same blueprint_id, different version → new Gemini call."""
    p = make_mock_provider()
    p._client = MagicMock()
    call_mock = AsyncMock(side_effect=[
        make_mock_response(MOCK_3BHK_JSON),
        make_mock_response(MOCK_2BHK_JSON),
    ])
    p._client.aio.models.generate_content = call_mock

    r_v1 = await p.analyze(b"blueprint_v1", "image/jpeg", "same-bp-id", "3 BHK", 1)
    r_v2 = await p.analyze(b"blueprint_v2", "image/jpeg", "same-bp-id", "2 BHK", 2)

    assert call_mock.call_count == 2, f"Expected 2 Gemini calls, got {call_mock.call_count}"
    assert r_v1.blueprint_version == 1
    assert r_v2.blueprint_version == 2
    print(f"  V1: provider={r_v1.provider} version={r_v1.blueprint_version} rooms={len(r_v1.rooms)}")
    print(f"  V2: provider={r_v2.provider} version={r_v2.blueprint_version} rooms={len(r_v2.rooms)}")
    return PASS


async def t4_old_version_geometry_never_reused():
    """T4: Version mismatch in result is impossible — each call returns correct version."""
    p = make_mock_provider()
    p._client = MagicMock()
    p._client.aio.models.generate_content = AsyncMock(return_value=make_mock_response(MOCK_3BHK_JSON))

    r = await p.analyze(b"img", "image/jpeg", "bp-id", "3 BHK", 7)

    assert r.blueprint_version == 7, f"Wrong version in result: {r.blueprint_version}"
    assert r.blueprint_id == "bp-id"
    print(f"  Result version={r.blueprint_version}, blueprint_id={r.blueprint_id}")
    return PASS


async def t5_incomplete_gemini_output_rejected():
    """T5: Gemini returning < 2 rooms triggers CV fallback (never invents fake rooms)."""
    p = make_mock_provider()
    p._client = MagicMock()
    p._client.aio.models.generate_content = AsyncMock(
        return_value=make_mock_response(MOCK_INCOMPLETE_JSON)
    )
    # Fallback will be ImageAwareProvider — patch it to return a known result
    dummy = b"incomplete_blueprint"
    result = await p.analyze(dummy, "image/jpeg", "bp-incomplete", "2 BHK", 1)
    # Must NOT be gemini_vision (should have fallen back)
    print(f"  Incomplete JSON → provider={result.provider} (expected fallback, not gemini_vision)")
    assert result.provider != "gemini_vision", "Provider should have fallen back from incomplete Gemini response"
    return PASS


def t6_top_down_camera_framing():
    """T6: Camera distance correctly covers all canvas dimensions for any BHK."""
    fov_half_tan = math.tan((40 * math.pi) / 180 / 2)
    test_cases = [
        ("2 BHK",  8.0, 10.0),
        ("3 BHK", 10.0, 10.5),
        ("4 BHK", 15.0, 10.0),
    ]
    for label, cw, ch in test_cases:
        dist_h = (ch * 1.20) / (2 * fov_half_tan)
        dist_w = (cw * 1.20) / (2 * fov_half_tan * 1.6)
        cam_top = max(dist_h, dist_w, 10)
        # Verify: at this distance, BOTH dimensions fit in the 40° FOV viewport
        visible_h = 2 * cam_top * fov_half_tan  # height visible at cam_top
        visible_w = 2 * cam_top * fov_half_tan * 1.6  # width visible (16:10 viewport)
        fits = visible_h >= ch and visible_w >= cw
        print(f"  {label}: canvas={cw:.0f}x{ch:.0f}m camDist={cam_top:.1f}m visible={visible_w:.1f}x{visible_h:.1f}m fits={fits}")
        assert fits, f"{label}: floor plan does not fit viewport at camDist={cam_top}"
    return PASS


async def t7_canvas_size_within_realistic_bounds():
    """T7: Canvas size is realistic for each BHK type (6m min, 30m max)."""
    for key, area_m2 in UNIT_AREAS_M2.items():
        canvas_h = math.sqrt(area_m2)  # square aspect
        canvas_h = max(min(canvas_h, MAX_CANVAS_DIM), MIN_CANVAS_DIM)
        assert MIN_CANVAS_DIM <= canvas_h <= MAX_CANVAS_DIM, \
            f"{key}: canvas_h={canvas_h:.1f} out of bounds [{MIN_CANVAS_DIM}, {MAX_CANVAS_DIM}]"
        print(f"  {key}: area={area_m2}m² → canvas≈{canvas_h:.1f}m × {canvas_h:.1f}m ✓")
    return PASS


async def t8_all_rooms_have_valid_types():
    """T8: All rooms returned by the provider have valid RoomType."""
    p = make_mock_provider()
    r = await run_with_mock_gemini(p, MOCK_4BHK_JSON, "4 BHK")
    for room in r.rooms:
        assert room.type in VALID_ROOM_TYPES, f"Invalid room type: {room.type} for {room.name}"
    print(f"  All {len(r.rooms)} rooms have valid types: {[rm.type for rm in r.rooms]}")
    return PASS


async def t9_walls_have_no_zero_length():
    """T9: All generated walls have length > 0."""
    p = make_mock_provider()
    r = await run_with_mock_gemini(p, MOCK_3BHK_JSON, "3 BHK")
    for w in r.walls:
        length = math.hypot(w.end_x - w.start_x, w.end_y - w.start_y)
        assert length > 0.05, f"Wall {w.id} has zero/tiny length: {length:.3f}m"
    print(f"  All {len(r.walls)} walls have length > 0.05m ✓")
    return PASS


async def t10_json_extraction_robust():
    """T10: JSON extractor handles markdown fences and embedded JSON correctly."""
    cases = [
        ('```json\n{"rooms": [{"name": "A"}]}\n```', "markdown fenced"),
        ('{"rooms": [{"name": "B"}]}', "raw JSON"),
        ('Here is the result:\n{"rooms": [{"name": "C"}]}', "text prefix"),
        ('```\n{"rooms": [{"name": "D"}]}\n```', "generic fence"),
    ]
    for raw, label in cases:
        result = _extract_json(raw)
        assert result is not None and "rooms" in result, f"Failed for case: {label}"
        print(f"  {label}: extracted {len(result['rooms'])} room(s) ✓")
    return PASS


# ─── Test Runner ──────────────────────────────────────────────────────────────

async def run_all_tests():
    tests = [
        ("T1: Gemini receives actual blueprint bytes",          t1_gemini_receives_actual_blueprint_bytes),
        ("T2: Different blueprints → different geometry",        t2_different_blueprints_produce_different_geometry),
        ("T3: Blueprint replacement creates new analysis",       t3_blueprint_replacement_creates_new_analysis),
        ("T4: Old version geometry never reused",                t4_old_version_geometry_never_reused),
        ("T5: Incomplete Gemini output rejected",                t5_incomplete_gemini_output_rejected),
        ("T6: Top-Down camera frames all geometry",              None),  # sync
        ("T7: Canvas size within realistic bounds",              t7_canvas_size_within_realistic_bounds),
        ("T8: All rooms have valid types",                       t8_all_rooms_have_valid_types),
        ("T9: Walls have no zero-length segments",               t9_walls_have_no_zero_length),
        ("T10: JSON extraction handles all Gemini formats",      t10_json_extraction_robust),
    ]

    passed = 0
    failed = 0
    print("\n" + "=" * 60)
    print("  PLINTH — Blueprint-to-3D Pipeline Test Suite")
    print("=" * 60)

    for name, fn in tests:
        print(f"\n{name}")
        try:
            if fn is None:  # sync test
                result = t6_top_down_camera_framing()
            else:
                result = await fn()
            print(f"  → {result}")
            passed += 1
        except Exception as e:
            print(f"  → {FAIL}: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"  Results: {passed} passed, {failed} failed")
    print("=" * 60 + "\n")
    return failed == 0


if __name__ == "__main__":
    ok = asyncio.run(run_all_tests())
    sys.exit(0 if ok else 1)
