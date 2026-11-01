"""
Pixel-grounded reconstruction path.

  crop -> OCR (room names + printed sizes)
       -> raster wall bars + door/window gaps
       -> room segmentation seeded by the labels
       -> metres-per-pixel calibrated from the printed room sizes
       -> walls / rooms / doors / windows in metres

Every element that reaches the 3D viewer is therefore tied to pixels (or text) in the
uploaded drawing. A vision LLM is consulted only when the drawing's own text cannot name
the rooms, and then only for room names/positions - never for wall geometry.
"""
from dataclasses import dataclass, field
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.schemas.spatial import Room, Door, Window
from app.reconstruction.plan_text import (
    RoomLabel, read_text, find_room_labels, is_entry_text, FT_TO_M,
)
from app.reconstruction.raster_walls import RasterWallResult, extract_raster_walls, Bar
from app.reconstruction.room_segmenter import (
    SegmentationResult, SegRoom, segment_rooms, calibrate_mpp, SQM_TO_SQFT,
)
from app.reconstruction.shapely_normalizer import NormalizedWall, Node

logger = logging.getLogger(__name__)

# room types a door should "belong" to, most private first (drives which way a leaf swings)
_PRIVACY = ["bathroom", "bedroom", "kitchen", "utility", "balcony", "dining", "living_room", "corridor", "other"]


@dataclass
class RasterOutput:
    walls: List[NormalizedWall]
    nodes: Dict[str, Node]
    rooms: List[Room]
    doors: List[Door]
    windows: List[Window]
    canvas_w_m: float
    canvas_h_m: float
    mpp: float
    mpp_source: str
    labels_from: str
    vision: Any = None
    stats: Dict[str, Any] = field(default_factory=dict)


def _fmt_ft(a: float, b: float) -> str:
    def f(x: float) -> str:
        ft = int(x)
        inch = int(round((x - ft) * 12))
        if inch == 12:
            ft, inch = ft + 1, 0
        return f"{ft}'{inch}\""
    return f"{f(a)} x {f(b)}"


def _vision_labels(vision, crop_w: int, crop_h: int) -> List[RoomLabel]:
    out: List[RoomLabel] = []
    for vr in vision.rooms:
        cx, cy = vr.center[0] * crop_w, vr.center[1] * crop_h
        rtype = vr.room_type if vr.room_type in (
            "living_room", "dining", "bedroom", "kitchen", "bathroom", "utility", "balcony", "corridor", "other"
        ) else "other"
        out.append(RoomLabel(name=vr.label, room_type=rtype, cx=cx, cy=cy, conf=vr.confidence))
    return out


def _prune_with_vision(res: RasterWallResult, vision, w: int, h: int) -> RasterWallResult:
    """Drop short bars that sit deep inside a room the vision model drew (beds, counters, wardrobes)."""
    boxes = []
    for vr in vision.rooms:
        if len(vr.approximate_region) < 3:
            continue
        xs = [p[0] * w for p in vr.approximate_region]
        ys = [p[1] * h for p in vr.approximate_region]
        bw, bh = max(xs) - min(xs), max(ys) - min(ys)
        if bw < 0.04 * w or bh < 0.04 * h:
            continue
        boxes.append((min(xs) + 0.25 * bw, min(ys) + 0.25 * bh, max(xs) - 0.25 * bw, max(ys) - 0.25 * bh,
                      max(bw, bh)))
    if not boxes:
        return res

    def furniture(b: Bar) -> bool:
        (x0, y0), (x1, y1) = b.endpoints()
        for bx0, by0, bx1, by1, span in boxes:
            if min(x0, x1) >= bx0 and max(x0, x1) <= bx1 and min(y0, y1) >= by0 and max(y0, y1) <= by1:
                if b.length < 0.6 * span:
                    return True
        return False

    keep = [b for b in res.bars if not furniture(b)]
    if len(keep) == len(res.bars):
        return res
    kept_ids = {id(b) for b in keep}
    openings = [o for o in res.openings if any(
        b.orient == o.orient and abs(b.pos - o.pos) <= 1.5 and b.a0 - 2 <= o.a0 and b.a1 + 2 >= o.a1 for b in keep
    ) or o.kind == "opening"]
    res.bars, res.openings = keep, openings
    return res


def _prune_non_separating(res: RasterWallResult, seg: SegmentationResult, mpp: float) -> int:
    """
    A wall divides two spaces. A short bar whose both sides lie in the *same* named room
    (a bed edge, a wardrobe side, a counter return) separates nothing, so it is not a wall.
    """
    h, w = seg.label_map.shape
    dim = max(h, w)
    lm = seg.label_map

    def rid(x: float, y: float) -> int:
        xi, yi = int(round(x)), int(round(y))
        return int(lm[yi, xi]) if 0 <= xi < w and 0 <= yi < h else -1

    keep: List[Bar] = []
    removed = 0
    for b in res.bars:
        if b.length >= 0.25 * dim:
            keep.append(b)
            continue
        off = b.th / 2.0 + max(3.0, 0.2 / mpp)
        same = 0
        probes = 0
        for t in (0.3, 0.5, 0.7):
            m = b.a0 + t * b.length
            if b.orient == "h":
                a, c = rid(m, b.pos - off), rid(m, b.pos + off)
            else:
                a, c = rid(b.pos - off, m), rid(b.pos + off, m)
            probes += 1
            if a > 0 and a == c:
                same += 1
        if probes and same >= 2:
            removed += 1
        else:
            keep.append(b)
    if removed:
        res.bars = keep
    return removed


async def run_raster_reconstruction(
    cropped_bgr: np.ndarray,
    unit_type: Optional[str],
    area_m2_hint: float,
    vision_adapter=None,
    crop_jpg_bytes: Optional[bytes] = None,
    debug_dir: Optional[Path] = None,
) -> Optional[RasterOutput]:
    h, w = cropped_bgr.shape[:2]

    # 1. text: room labels + printed sizes straight from the drawing
    items = read_text(cropped_bgr)
    labels = find_room_labels(items)
    labels_from = "ocr"
    entry_pts = [(it.cx, it.cy) for it in items if is_entry_text(it.text)]

    # 2. walls (first pass, scale unknown)
    res = extract_raster_walls(cropped_bgr)
    if not res.ok:
        return None

    # 3. vision model (when configured): names rooms the text could not, and flags furniture
    #    bars lying deep inside a room. It never supplies wall geometry.
    vision = None
    if vision_adapter is not None and crop_jpg_bytes:
        try:
            vision = await vision_adapter.extract_semantic_geometry(crop_jpg_bytes, "image/jpeg", unit_type)
        except Exception as e:
            logger.warning(f"[RASTER] vision call failed, continuing with pixels + text only: {e}")
    if vision is not None and vision.rooms:
        if len(labels) < 3:
            vlabels = _vision_labels(vision, w, h)
            far = 0.06 * max(w, h)
            labels = labels + [v for v in vlabels if all(math.hypot(v.cx - l.cx, v.cy - l.cy) > far for l in labels)]
            labels_from = "ocr+vision" if items else "vision"
        res = _prune_with_vision(res, vision, w, h)

    # 4. rooms (scale unknown) -> calibrate metres/pixel from printed sizes
    seg = segment_rooms((h, w), res.bars, labels)
    mpp, reliable = calibrate_mpp(seg.rooms)
    mpp_source = "printed_room_sizes"
    if not mpp:
        xs = [b.a0 if b.orient == "h" else b.pos for b in res.bars] + [b.a1 if b.orient == "h" else b.pos for b in res.bars]
        ys = [b.pos if b.orient == "h" else b.a0 for b in res.bars] + [b.pos if b.orient == "h" else b.a1 for b in res.bars]
        px_area = max(1.0, (max(xs) - min(xs)) * (max(ys) - min(ys)))
        mpp = math.sqrt(area_m2_hint / px_area)
        mpp_source = "unit_area_estimate"
        reliable = False
    # 5. second pass with the real scale: door / window gaps and open-plan sizes need it
    res = extract_raster_walls(cropped_bgr, mpp)
    if not res.ok:
        return None
    if vision is not None and vision.rooms:
        res = _prune_with_vision(res, vision, w, h)
    seg = segment_rooms((h, w), res.bars, labels, mpp, use_printed_sizes=reliable)
    pruned = _prune_non_separating(res, seg, mpp)
    if pruned:
        seg = segment_rooms((h, w), res.bars, labels, mpp, use_printed_sizes=reliable)

    out = _assemble(cropped_bgr, res, seg, labels, mpp, entry_pts)
    out.mpp_source = mpp_source if (reliable or mpp_source != "printed_room_sizes") else "printed_room_sizes_approx"
    out.labels_from = labels_from
    out.vision = vision
    out.stats.update({
        "ocrTextItems": len(items),
        "roomLabels": len(labels),
        "gapOpenings": len(res.openings),
        "wallThresholdLevel": res.threshold,
        "furnitureBarsRemoved": pruned,
    })
    if debug_dir:
        _save_debug(cropped_bgr, res, seg, out, debug_dir)
    return out


# ─── assembly (pixels -> metres) ──────────────────────────────────────────────

def _assemble(bgr, res: RasterWallResult, seg: SegmentationResult, labels, mpp: float, entry_pts) -> RasterOutput:
    h, w = bgr.shape[:2]
    interior = seg.interior
    label_map = seg.label_map

    def inside(x: float, y: float) -> bool:
        xi, yi = int(round(x)), int(round(y))
        return 0 <= xi < w and 0 <= yi < h and bool(interior[yi, xi])

    def room_at(x: float, y: float) -> int:
        xi, yi = int(round(x)), int(round(y))
        if 0 <= xi < w and 0 <= yi < h:
            v = int(label_map[yi, xi])
            if v:
                return v
            # near-miss (probe landed on a wall edge): look a few px around
            r = max(2, int(0.12 / mpp))
            sub = label_map[max(0, yi - r):yi + r + 1, max(0, xi - r):xi + r + 1]
            vals = sub[sub > 0]
            if vals.size:
                return int(np.bincount(vals).argmax())
        return 0

    # rooms
    rooms: List[Room] = []
    for i, r in enumerate(seg.rooms, 1):
        x0, y0, x1, y1 = r.rect
        width_m = max(0.5, (x1 - x0) * mpp)
        height_m = max(0.5, (y1 - y0) * mpp)
        if r.dims_ft:
            area_sqft = round(r.dims_ft[0] * r.dims_ft[1], 0)
            printed = _fmt_ft(r.dims_ft[0], r.dims_ft[1])
        else:
            area_sqft = round(r.area_px * mpp * mpp * SQM_TO_SQFT, 0)
            printed = None
        rooms.append(Room(
            id=f"r{i}", name=r.name, type=r.room_type,
            x=round(x0 * mpp, 2), y=round(y0 * mpp, 2),
            width=round(width_m, 2), height=round(height_m, 2),
            area_sqft=area_sqft,
            polygon=[[round(px * mpp, 3), round(py * mpp, 3)] for px, py in r.polygon] or None,
            printed_size=printed,
        ))

    # walls: centrelines in metres; exterior = exactly one side outside the building
    walls: List[NormalizedWall] = []
    nodes: Dict[str, Node] = {}
    node_key: Dict[Tuple[float, float], str] = {}

    def node_for(p: Tuple[float, float]) -> None:
        k = (round(p[0], 3), round(p[1], 3))
        if k not in node_key:
            nid = f"n{len(nodes) + 1}"
            nodes[nid] = Node(id=nid, x=k[0], y=k[1])
            node_key[k] = nid

    for i, b in enumerate(sorted(res.bars, key=lambda b: (b.orient, b.pos, b.a0)), 1):
        mid = (b.a0 + b.a1) / 2.0
        off = b.th / 2.0 + max(3.0, 0.22 / mpp)
        if b.orient == "h":
            p_a, p_b = (mid, b.pos - off), (mid, b.pos + off)
        else:
            p_a, p_b = (b.pos - off, mid), (b.pos + off, mid)
        ext = inside(*p_a) != inside(*p_b)
        th_m = float(np.clip(b.th * mpp, 0.09, 0.25))
        if ext:
            th_m = max(th_m, 0.15)
        (x0, y0), (x1, y1) = b.endpoints()
        s = (round(x0 * mpp, 3), round(y0 * mpp, 3))
        e = (round(x1 * mpp, 3), round(y1 * mpp, 3))
        node_for(s)
        node_for(e)
        walls.append(NormalizedWall(
            id=f"w{i}", start=s, end=e,
            wall_type="EXTERNAL" if ext else "INTERNAL",
            thickness=round(th_m, 3), confidence=0.92, source="RASTER",
        ))

    # doors / windows from wall gaps
    doors: List[Door] = []
    windows: List[Window] = []
    for o in res.openings:
        if o.kind == "opening":
            continue
        width_m = o.width * mpp
        if width_m < 0.45:
            continue
        cx, cy = o.center
        off = o.th / 2.0 + max(4.0, 0.35 / mpp)
        if o.orient == "h":
            pa, pb = (cx, cy - off), (cx, cy + off)
            outward_a, outward_b = "north", "south"
        else:
            pa, pb = (cx - off, cy), (cx + off, cy)
            outward_a, outward_b = "west", "east"
        in_a, in_b = inside(*pa), inside(*pb)
        ra, rb = room_at(*pa), room_at(*pb)
        exterior = in_a != in_b
        rtypes = [seg.rooms[r - 1].room_type for r in (ra, rb) if r]
        # which room does it serve? the more private of the two sides (interior side for exterior gaps)
        cand = [r for r, ins in ((ra, in_a), (rb, in_b)) if r and (ins or not exterior)]
        serve = min(cand, key=lambda r: _PRIVACY.index(seg.rooms[r - 1].room_type)
                    if seg.rooms[r - 1].room_type in _PRIVACY else 99) if cand else 0
        facing = "unknown"
        if exterior:
            facing = outward_a if not in_a else outward_b
        elif o.orient == "h":
            facing = "north"
        else:
            facing = "west"
        xm, ym = round(cx * mpp, 2), round(cy * mpp, 2)
        connects = f"r{serve}" if serve else None
        if "balcony" in rtypes and (exterior or len(set(rtypes)) > 1):
            bal = next(r for r in (ra, rb) if r and seg.rooms[r - 1].room_type == "balcony")
            windows.append(Window(id=f"win{len(windows) + 1}", x=xm, y=ym,
                                  width=round(min(width_m, 3.6), 2), orientation=facing,
                                  connects_to=f"r{bal}"))
        elif exterior and o.kind == "window":
            windows.append(Window(id=f"win{len(windows) + 1}", x=xm, y=ym,
                                  width=round(min(width_m, 3.2), 2), orientation=facing, connects_to=connects))
        else:
            doors.append(Door(id=f"d{len(doors) + 1}", x=xm, y=ym,
                              width=round(float(np.clip(width_m, 0.7, 1.2)), 2),
                              orientation=facing, connects_to=connects))

    return RasterOutput(
        walls=walls, nodes=nodes, rooms=rooms, doors=doors, windows=windows,
        canvas_w_m=round(w * mpp, 2), canvas_h_m=round(h * mpp, 2),
        mpp=mpp, mpp_source="", labels_from="",
        stats={"exteriorWalls": sum(1 for x in walls if x.wall_type == "EXTERNAL")},
    )


# ─── debug artifacts ──────────────────────────────────────────────────────────

def _save_debug(bgr, res: RasterWallResult, seg: SegmentationResult, out: RasterOutput, debug_dir: Path) -> None:
    h, w = bgr.shape[:2]
    cv2.imwrite(str(debug_dir / "05_wall_mask.png"), seg.wall_mask)

    cent = bgr.copy()
    for b in res.bars:
        (x0, y0), (x1, y1) = b.endpoints()
        cv2.line(cent, (int(x0), int(y0)), (int(x1), int(y1)), (0, 200, 0), 2)
        cv2.circle(cent, (int(x0), int(y0)), 3, (0, 0, 255), -1)
        cv2.circle(cent, (int(x1), int(y1)), 3, (0, 0, 255), -1)
    col = {"door": (0, 180, 0), "window": (255, 140, 0), "opening": (200, 0, 200)}
    for o in res.openings:
        if o.orient == "h":
            cv2.line(cent, (int(o.a0), int(o.pos)), (int(o.a1), int(o.pos)), col[o.kind], 3)
        else:
            cv2.line(cent, (int(o.pos), int(o.a0)), (int(o.pos), int(o.a1)), col[o.kind], 3)
    cv2.imwrite(str(debug_dir / "07_centerlines.png"), cent)

    rng = np.random.RandomState(7)
    ov = bgr.copy()
    for r in seg.rooms:
        c = tuple(int(x) for x in rng.randint(80, 255, 3))
        layer = ov.copy()
        layer[r.mask] = c
        ov = cv2.addWeighted(layer, 0.5, ov, 0.5, 0)
    for rm, room in zip(seg.rooms, out.rooms):
        x0, y0, x1, y1 = [int(v) for v in rm.rect]
        cv2.rectangle(ov, (x0, y0), (x1, y1), (30, 30, 30), 1)
        cv2.putText(ov, f"{room.name} {int(room.area_sqft or 0)}sqft", (x0 + 3, y0 + 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.imwrite(str(debug_dir / "09_room_polygons.png"), ov)
