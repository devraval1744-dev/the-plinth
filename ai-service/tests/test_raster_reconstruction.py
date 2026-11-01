"""
Tests for the pixel + text grounded reconstruction path (raster walls, OCR labels,
room segmentation, scale calibration).

These guard the failure modes seen on builder unit plans (grey filled walls, furniture
outlines, door arcs, printed room sizes):
  * every wall of the drawing must be recovered and rooms must be fully enclosed,
  * furniture must not become walls,
  * door / window gaps must be found, classified and bridged,
  * room names / sizes come from the drawing's own text,
  * metres-per-pixel is calibrated from printed room sizes.
"""
import asyncio
import math
import sys
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import pytest
from shapely.geometry import LineString
from shapely.ops import polygonize, unary_union

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.reconstruction.plan_text import (
    TextItem,
    classify_room_text,
    find_room_labels,
    parse_dimensions,
    FT_TO_M,
)
from app.reconstruction.raster_walls import extract_raster_walls
from app.reconstruction.room_segmenter import calibrate_mpp, segment_rooms
from app.reconstruction.raster_pipeline import run_raster_reconstruction

DEMO_DIR = Path(__file__).resolve().parents[2] / "backend" / "uploads" / "demo" / "blueprints"

MPP = 0.02            # metres per pixel of the synthetic plan
WALL = (140, 140, 140)  # mid-grey filled walls, like a builder brochure
T = 6                 # wall thickness (px)


def _ft(px: float) -> float:
    return px * MPP / FT_TO_M


def _hline(img, y, x0, x1, t=T):
    cv2.rectangle(img, (x0, y - t // 2), (x1, y + t // 2 - 1), WALL, -1)


def _vline(img, x, y0, y1, t=T):
    cv2.rectangle(img, (x - t // 2, y0), (x + t // 2 - 1, y1), WALL, -1)


def build_plan():
    """Four rooms in a 580x460 shell. Returns (image, truth) with truth in pixels."""
    img = np.full((500, 620, 3), 255, np.uint8)
    x0, x1, y0, y1, xm, ym = 20, 600, 20, 480, 310, 250

    # outer shell: window gap on the top wall (glazing lines), entrance gap on the bottom wall
    _hline(img, y0, x0, 110)
    _hline(img, y0, 230, x1)
    for yy in (y0 - 1, y0 + 1):                       # glazing inside the gap
        cv2.line(img, (110, yy), (230, yy), (60, 60, 60), 1)
    _hline(img, y1, x0, 250)
    _hline(img, y1, 300, x1)                          # entrance door gap 250..300
    _vline(img, x0, y0, y1 + 3)
    _vline(img, x1, y0, y1 + 3)
    # partitions with door gaps
    _vline(img, xm, y0, 110)
    _vline(img, xm, 160, y1)                          # door gap 110..160
    _hline(img, ym, x0, 120)
    _hline(img, ym, 170, 440)                         # door gap 120..170
    _hline(img, ym, 490, x1)                          # door gap 440..490

    # furniture: coloured fill + thin dark outline; must NOT become walls
    cv2.rectangle(img, (60, 60), (150, 170), (60, 110, 180), -1)
    cv2.rectangle(img, (60, 60), (150, 170), (30, 30, 30), 1)
    cv2.rectangle(img, (380, 300), (520, 420), (90, 150, 90), -1)
    cv2.rectangle(img, (380, 300), (520, 420), (30, 30, 30), 1)
    cv2.line(img, (330, 60), (330, 100), (30, 30, 30), 1)

    rooms = {
        "Bedroom":        (x0 + T // 2, y0 + T // 2, xm - T // 2, ym - T // 2),
        "Kitchen":        (xm + T // 2, y0 + T // 2, x1 - T // 2, ym - T // 2),
        "Living":         (x0 + T // 2, ym + T // 2, xm - T // 2, y1 - T // 2),
        "Master Bedroom": (xm + T // 2, ym + T // 2, x1 - T // 2, y1 - T // 2),
    }
    return img, rooms


def _ocr_items(rooms):
    """What OCR would return for the plan: a name line and a printed-size line per room."""
    items = []
    for name, (a, b, c, d) in rooms.items():
        cx, cy = (a + c) / 2.0, (b + d) / 2.0 + 30
        w_ft, h_ft = _ft(c - a), _ft(d - b)
        ft_in = lambda v: f"{int(v)}'{int(round((v - int(v)) * 12)) % 12}\""
        items.append(TextItem(name.upper(), cx, cy - 6, 70, 9, 0.9))
        items.append(TextItem(f"{ft_in(w_ft)} x {ft_in(h_ft)}", cx, cy + 6, 70, 9, 0.9))
    return items


# ─── text parsing ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("14'5\" x 12'10\"", (14 + 5 / 12, 12 + 10 / 12)),
    ("145x910", (14 + 5 / 12, 9 + 10 / 12)),          # OCR drops the tick marks
    ("102x3'5%", (10 + 2 / 12, 3 + 5 / 12)),          # '102' must read as 10'2", not 1'2"
    ("1010x114%", (10 + 10 / 12, 11 + 4 / 12)),
    ("27~x411", (2 + 7 / 12, 4 + 11 / 12)),
])
def test_parse_dimensions_tolerates_ocr_noise(text, expected):
    got = parse_dimensions(text)
    assert got is not None
    assert got[0] == pytest.approx(expected[0], abs=1e-6)
    assert got[1] == pytest.approx(expected[1], abs=1e-6)


@pytest.mark.parametrize("text,name,rtype", [
    ("MASTER BEDROOM", "Master Bedroom", "bedroom"),
    ("MASTERBEDRCOM", "Master Bedroom", "bedroom"),   # OCR damage
    ("BECROCM1", "Bedroom 1", "bedroom"),
    ("LVING", "Living", "living_room"),
    ("TOILET", "Toilet", "bathroom"),
    ("POOJA", "Pooja", "other"),
    ("BALCONY", "Balcony", "balcony"),
])
def test_room_label_classification(text, name, rtype):
    assert classify_room_text(text) == (name, rtype)


def test_non_room_text_is_ignored():
    assert classify_room_text("ENTRANCE") is None
    assert classify_room_text("N") is None


def test_label_gets_dimension_line_below_it():
    items = [
        TextItem("BEDROOM", 100, 50, 45, 9, 0.9),
        TextItem("145x910", 100, 60, 49, 9, 0.9),
        TextItem("KITCHEN", 300, 50, 33, 9, 0.9),
    ]
    labels = {l.name: l for l in find_room_labels(items)}
    assert labels["Bedroom"].dims_ft == pytest.approx((14 + 5 / 12, 9 + 10 / 12))
    assert labels["Kitchen"].dims_ft is None


# ─── raster walls ─────────────────────────────────────────────────────────────

def test_all_walls_recovered_and_furniture_ignored():
    img, _ = build_plan()
    res = extract_raster_walls(img, MPP)
    assert res.ok

    horiz = sorted((round(b.pos), round(b.a0), round(b.a1)) for b in res.bars if b.orient == "h")
    vert = sorted((round(b.pos), round(b.a0), round(b.a1)) for b in res.bars if b.orient == "v")
    # shell + partitions, each bridged across its doors / windows into one continuous wall
    ys = {p for p, _, _ in horiz}
    xs = {p for p, _, _ in vert}
    assert ys >= {20, 250, 480}
    assert xs >= {20, 310, 600}
    top = next(b for b in res.bars if b.orient == "h" and round(b.pos) == 20)
    assert top.a0 <= 22 and top.a1 >= 598
    # nothing invented from the furniture: the bed / counter outlines and the 40px tick stay out
    for b in res.bars:
        assert b.length > 100, f"short bar {b}"
    assert len(res.bars) <= 8


def test_door_and_window_gaps_are_classified():
    img, _ = build_plan()
    res = extract_raster_walls(img, MPP)
    kinds = {}
    for o in res.openings:
        kinds.setdefault(o.kind, []).append(o)
    # the glazed gap in the top wall is a window, the clear gaps are doors
    windows = [o for o in res.openings if o.kind == "window"]
    assert len(windows) == 1 and windows[0].orient == "h" and round(windows[0].pos) == 20
    assert 100 <= windows[0].a0 <= 115 and 225 <= windows[0].a1 <= 235
    doors = [o for o in res.openings if o.kind == "door"]
    assert len(doors) == 4
    assert {round(o.pos) for o in doors} == {480, 310, 250}


# ─── rooms + scale ────────────────────────────────────────────────────────────

def test_rooms_are_enclosed_and_scale_is_calibrated_from_printed_sizes():
    img, truth = build_plan()
    res = extract_raster_walls(img, MPP)
    labels = find_room_labels(_ocr_items(truth))
    assert {l.name for l in labels} == set(truth)

    seg = segment_rooms(img.shape[:2], res.bars, labels)
    assert {r.name for r in seg.rooms} == set(truth)
    mpp, reliable = calibrate_mpp(seg.rooms)
    assert reliable
    assert mpp == pytest.approx(MPP, rel=0.04)

    seg = segment_rooms(img.shape[:2], res.bars, labels, mpp)
    for r in seg.rooms:
        a, b, c, d = truth[r.name]
        x0, y0, x1, y1 = r.rect
        assert abs(x0 - a) <= 6 and abs(y0 - b) <= 6 and abs(x1 - c) <= 6 and abs(y1 - d) <= 6, r.name


def test_wall_centrelines_enclose_every_room():
    """Planar check: polygonizing the wall centrelines must give one closed cell per room."""
    img, truth = build_plan()
    res = extract_raster_walls(img, MPP)
    lines = [LineString([*b.endpoints()]) for b in res.bars]
    cells = [p for p in polygonize(unary_union(lines)) if p.area > 2000]
    assert len(cells) == len(truth)


# ─── whole raster path (OCR patched so the test is deterministic) ──────────────

def _run(img, items, vision=None):
    with patch("app.reconstruction.raster_pipeline.read_text", return_value=items):
        return asyncio.run(run_raster_reconstruction(img, "3 BHK", 90.0, vision_adapter=vision))


def test_raster_pipeline_outputs_metric_rooms_doors_and_windows():
    img, truth = build_plan()
    out = _run(img, _ocr_items(truth))
    assert out is not None
    assert out.mpp_source == "printed_room_sizes"
    assert out.mpp == pytest.approx(MPP, rel=0.04)
    assert out.canvas_w_m == pytest.approx(img.shape[1] * MPP, rel=0.04)

    by_name = {r.name: r for r in out.rooms}
    assert set(by_name) == set(truth)
    for name, (a, b, c, d) in truth.items():
        r = by_name[name]
        assert r.width == pytest.approx((c - a) * MPP, abs=0.15)
        assert r.height == pytest.approx((d - b) * MPP, abs=0.15)
        # the area shown in the viewer is what the drawing prints
        assert r.area_sqft == pytest.approx(
            round(_ft(c - a) * _ft(d - b), 0), rel=0.03)
        assert r.printed_size

    assert len(out.windows) == 1
    assert len(out.doors) >= 3
    ext = [w for w in out.walls if w.wall_type == "EXTERNAL"]
    assert len(ext) >= 4
    assert all(0.09 <= w.thickness <= 0.25 for w in out.walls)
    # a door joins two rooms: its centre sits on a wall line
    for d in out.doors:
        assert any(
            LineString([w.start, w.end]).distance(LineString([(d.x, d.y), (d.x, d.y + 1e-6)])) < 0.2
            for w in out.walls
        )


def test_raster_pipeline_rejects_a_blank_page():
    blank = np.full((400, 500, 3), 255, np.uint8)
    assert _run(blank, []) is None


# ─── regression on the shipped sample plans (real OCR, no network) ────────────

class _OfflineVision:
    async def extract_semantic_geometry(self, *a, **k):
        raise RuntimeError("offline")


@pytest.mark.skipif(not DEMO_DIR.exists(), reason="sample blueprints not available")
@pytest.mark.parametrize("fname,unit,must_have", [
    ("blueprint_2bhk.png", "2 BHK", {"Kitchen", "Balcony", "Toilet 1", "Toilet 2"}),
    ("blueprint_3bhk.png", "3 BHK", {"Kitchen", "Balcony", "Utility"}),
    ("blueprint_4bhk.png", "4 BHK", {"Kitchen", "Pooja"}),
    ("blueprint_5bhk.png", "2 BHK", {"Kitchen", "Balcony", "Utility"}),
])
def test_sample_plans_keep_every_labelled_room(fname, unit, must_have):
    from app.reconstruction.hybrid_pipeline import HybridReconstructionPipeline

    data = (DEMO_DIR / fname).read_bytes()
    pipe = HybridReconstructionPipeline(vision_adapter=_OfflineVision())
    res = asyncio.run(pipe.reconstruct(data, "image/png", "regress", unit, 1))
    assert res.pipeline_version == "3.0-raster"
    names = {r.name for r in res.rooms}
    assert must_have <= names, f"missing {must_have - names}"
    assert len(res.walls) >= 15
    assert res.validation_report["scaleSource"].startswith("printed_room_sizes")
    # rooms stay inside the canvas and wall coordinates are metric
    for r in res.rooms:
        assert r.x >= -0.1 and r.y >= -0.1
        assert r.x + r.width <= res.canvas_width + 0.5 and r.y + r.height <= res.canvas_height + 0.5
    # the model builder accepts the result
    from app.services.glb_generator import GLBGenerator
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        GLBGenerator().export_glb_file(res, Path(td) / "m.glb")
        assert (Path(td) / "m.glb").stat().st_size > 500
