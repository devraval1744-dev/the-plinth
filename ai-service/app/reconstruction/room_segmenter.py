"""
Raster room segmentation.

Rooms are the enclosed (or label-bounded) floor areas of the drawing, found directly on
the wall raster instead of being inferred from an LLM's rough boxes:

  * the wall bars are rasterised,
  * every OCR room label is a seed,
  * a marker-controlled watershed on the distance transform grows each seed through the
    free floor, so splits fall on door necks / narrow passages,
  * where a printed size is known (14'5" x 12'10") and the grown region leaks into
    neighbouring open-plan space, the region is clipped to that size around its label,
  * the printed sizes are also used to calibrate metres-per-pixel.
"""
from dataclasses import dataclass, field
import math
from typing import List, Optional, Tuple

import cv2
import numpy as np
from skimage.segmentation import watershed

from app.reconstruction.plan_text import RoomLabel, FT_TO_M
from app.reconstruction.raster_walls import Bar

SQM_TO_SQFT = 10.7639
_OUTSIDE_OK_TYPES = ("balcony",)


@dataclass
class SegRoom:
    name: str
    room_type: str
    label: Optional[RoomLabel]
    mask: np.ndarray                         # bool, crop-sized
    polygon: List[Tuple[float, float]]       # px
    rect: Tuple[float, float, float, float]  # px x0, y0, x1, y1 (axis-aligned room box)
    area_px: float
    dims_ft: Optional[Tuple[float, float]] = None
    inferred: bool = False                   # no printed label (hall / passage)
    shared: bool = False                     # lives in an open-plan space shared with other labels


@dataclass
class SegmentationResult:
    rooms: List[SegRoom]
    wall_mask: np.ndarray
    label_map: np.ndarray                    # int32 room index + 1 (0 = none)
    interior: np.ndarray                     # bool, building interior (rooms + walls, closed)
    footprint: np.ndarray                    # bool
    mpp: Optional[float] = None


def render_walls(shape: Tuple[int, int], bars: List[Bar]) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    for b in bars:
        h = max(1.0, b.th) / 2.0
        if b.orient == "h":
            p0 = (int(round(b.a0)), int(round(b.pos - h)))
            p1 = (int(round(b.a1)) - 1, int(round(b.pos + h)) - 1)
        else:
            p0 = (int(round(b.pos - h)), int(round(b.a0)))
            p1 = (int(round(b.pos + h)) - 1, int(round(b.a1)) - 1)
        cv2.rectangle(m, p0, p1, 255, -1)
    return m


def _largest_rect(mask: np.ndarray) -> Tuple[int, int, int, int]:
    """Largest axis-aligned all-True rectangle (x0, y0, x1, y1), via histogram stacks."""
    h, w = mask.shape
    heights = np.zeros(w, np.int32)
    best_area, best = 0, (0, 0, 0, 0)
    for y in range(h):
        heights = np.where(mask[y], heights + 1, 0)
        stack: List[int] = []
        for x in range(w + 1):
            cur = int(heights[x]) if x < w else 0
            while stack and int(heights[stack[-1]]) >= cur:
                hh = int(heights[stack.pop()])
                left = stack[-1] + 1 if stack else 0
                area = hh * (x - left)
                if area > best_area:
                    best_area, best = area, (left, y - hh + 1, x, y + 1)
            stack.append(x)
    return best


def _region_rect(mask: np.ndarray) -> Tuple[float, float, float, float]:
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    box_area = float((x1 - x0) * (y1 - y0))
    if mask.sum() / max(1.0, box_area) >= 0.82:
        return float(x0), float(y0), float(x1), float(y1)
    # L / irregular rooms: use the largest inscribed rectangle (computed on a coarse grid)
    ds = max(1, int(max(mask.shape) // 220))
    sub = mask[y0:y1:ds, x0:x1:ds]
    rx0, ry0, rx1, ry1 = _largest_rect(sub)
    if (rx1 - rx0) * (ry1 - ry0) <= 0:
        return float(x0), float(y0), float(x1), float(y1)
    return float(x0 + rx0 * ds), float(y0 + ry0 * ds), float(x0 + rx1 * ds), float(y0 + ry1 * ds)


def _polygon(mask: np.ndarray, eps: float) -> List[Tuple[float, float]]:
    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs:
        return []
    c = max(cs, key=cv2.contourArea)
    ap = cv2.approxPolyDP(c, eps, True)
    return [(float(p[0][0]), float(p[0][1])) for p in ap]


def _fill_holes(m: np.ndarray) -> np.ndarray:
    h, w = m.shape
    pad = cv2.copyMakeBorder(m * 255, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    ff = pad.copy()
    cv2.floodFill(ff, np.zeros((h + 4, w + 4), np.uint8), (0, 0), 128)
    filled = np.where(ff == 128, 0, 255).astype(np.uint8)
    return filled[1:-1, 1:-1]


def _nearest_free(free: np.ndarray, x: int, y: int) -> Optional[Tuple[int, int]]:
    h, w = free.shape
    x = min(max(x, 0), w - 1)
    y = min(max(y, 0), h - 1)
    if free[y, x]:
        return x, y
    for r in range(1, max(h, w) // 6):
        y0, y1, x0, x1 = max(0, y - r), min(h, y + r + 1), max(0, x - r), min(w, x + r + 1)
        sub = free[y0:y1, x0:x1]
        if sub.any():
            ys, xs = np.where(sub)
            d = (ys + y0 - y) ** 2 + (xs + x0 - x) ** 2
            k = int(np.argmin(d))
            return int(xs[k] + x0), int(ys[k] + y0)
    return None


def _overlap(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> Tuple[float, float]:
    ox = min(a[2], b[2]) - max(a[0], b[0])
    oy = min(a[3], b[3]) - max(a[1], b[1])
    return ox, oy


def _place_shared_rooms(rooms: List[SegRoom], label_map: np.ndarray, free: np.ndarray,
                        mpp: Optional[float], shape: Tuple[int, int]) -> None:
    """Open-plan rooms (dining / living / pooja sharing one hall) get their printed size,
    placed around their label and pushed clear of the enclosed rooms and of each other."""
    if not mpp:
        return
    h, w = shape
    ys, xs = np.where(free)
    if len(xs) == 0:
        return
    fx0, fx1, fy0, fy1 = float(xs.min()), float(xs.max() + 1), float(ys.min()), float(ys.max() + 1)
    fixed = [r.rect for r in rooms if not r.shared]
    shared = [r for r in rooms if r.shared and r.dims_ft and r.label]
    shared.sort(key=lambda r: r.dims_ft[0] * r.dims_ft[1])
    for r in shared:
        dw, dh = r.dims_ft[0] * FT_TO_M / mpp, r.dims_ft[1] * FT_TO_M / mpp
        x0, y0, x1, y1 = r.rect
        if abs((x1 - x0) - dw) + abs((y1 - y0) - dh) > abs((x1 - x0) - dh) + abs((y1 - y0) - dw):
            dw, dh = dh, dw
        rw, rh = x1 - x0, y1 - y0
        if abs(rw - dw) <= 0.2 * dw and abs(rh - dh) <= 0.2 * dh:
            fixed.append(r.rect)
            continue
        cx, cy = r.label.cx, r.label.cy
        rect = [cx - dw / 2.0, cy - dh / 2.0, cx + dw / 2.0, cy + dh / 2.0]
        for _ in range(8):
            moved = False
            for f in fixed:
                ox, oy = _overlap(tuple(rect), f)
                if ox <= 1 or oy <= 1:
                    continue
                opts = [(ox, (-ox, 0)), (ox, (ox, 0)), (oy, (0, -oy)), (oy, (0, oy))]
                # push away from the neighbour along the shorter way out, towards the label side
                fc = ((f[0] + f[2]) / 2.0, (f[1] + f[3]) / 2.0)
                rc = ((rect[0] + rect[2]) / 2.0, (rect[1] + rect[3]) / 2.0)
                cand = []
                for cost, (dx, dy) in opts:
                    if (dx < 0 and rc[0] > fc[0]) or (dx > 0 and rc[0] < fc[0]):
                        continue
                    if (dy < 0 and rc[1] > fc[1]) or (dy > 0 and rc[1] < fc[1]):
                        continue
                    nr = [rect[0] + dx, rect[1] + dy, rect[2] + dx, rect[3] + dy]
                    if nr[0] < fx0 - 2 or nr[2] > fx1 + 2 or nr[1] < fy0 - 2 or nr[3] > fy1 + 2:
                        cost += 1e4
                    cand.append((cost, nr))
                if cand:
                    rect = min(cand, key=lambda t: t[0])[1]
                    moved = True
            if not moved:
                break
        rect = [max(fx0, rect[0]), max(fy0, rect[1]), min(fx1, rect[2]), min(fy1, rect[3])]
        r.rect = tuple(float(v) for v in rect)
        m = np.zeros((h, w), bool)
        m[int(rect[1]):int(rect[3]), int(rect[0]):int(rect[2])] = True
        m &= free
        r.mask = m
        r.area_px = float(m.sum())
        r.polygon = [(rect[0], rect[1]), (rect[2], rect[1]), (rect[2], rect[3]), (rect[0], rect[3])]
        fixed.append(r.rect)
    # rebuild ownership for the moved rooms
    for i, r in enumerate(rooms, 1):
        if r.shared:
            label_map[label_map == i] = 0
    for i, r in enumerate(rooms, 1):
        if r.shared:
            label_map[r.mask & (label_map == 0)] = i


def segment_rooms(
    shape: Tuple[int, int],
    bars: List[Bar],
    labels: List[RoomLabel],
    mpp: Optional[float] = None,
    min_inferred_m2: float = 2.0,
    use_printed_sizes: bool = True,
) -> SegmentationResult:
    h, w = shape
    dim = max(h, w)
    walls = render_walls(shape, bars)
    wall_b = walls > 0

    # footprint = box around all walls (+ margin for a thin outer wall)
    footprint = np.zeros((h, w), bool)
    if bars:
        xs = [b.a0 if b.orient == "h" else b.pos for b in bars] + [b.a1 if b.orient == "h" else b.pos for b in bars]
        ys = [b.pos if b.orient == "h" else b.a0 for b in bars] + [b.pos if b.orient == "h" else b.a1 for b in bars]
        x0, x1 = int(max(0, min(xs))), int(min(w, max(xs) + 1))
        y0, y1 = int(max(0, min(ys))), int(min(h, max(ys) + 1))
        footprint[y0:y1, x0:x1] = True
    # seal 1px pinholes
    sealed = cv2.dilate(walls, np.ones((3, 3), np.uint8)) > 0
    free_all = ~sealed
    free = free_all & footprint

    dist = cv2.distanceTransform(free.astype(np.uint8), cv2.DIST_L2, 5)

    # connected floor components; seeds that share one are an open-plan space
    n_comp, comp = cv2.connectedComponents(free.astype(np.uint8), connectivity=4)
    seeds: List[Tuple[int, RoomLabel, Tuple[int, int]]] = []
    for i, lb in enumerate(labels, 1):
        pt = _nearest_free(free, int(round(lb.cx)), int(round(lb.cy)))
        if pt is not None:
            seeds.append((i, lb, pt))
    by_comp: dict = {}
    for s in seeds:
        by_comp.setdefault(int(comp[s[2][1], s[2][0]]), []).append(s)

    def printed_box(lb: RoomLabel, pt: Tuple[int, int], reg_bbox: Tuple[int, int]) -> Optional[Tuple[float, float]]:
        """Printed room size in px, oriented like the region it should fill."""
        if not (mpp and lb.dims_ft and use_printed_sizes):
            return None
        dw, dh = lb.dims_ft[0] * FT_TO_M / mpp, lb.dims_ft[1] * FT_TO_M / mpp
        bw, bh = reg_bbox
        if abs(bw - dw) + abs(bh - dh) <= abs(bw - dh) + abs(bh - dw):
            return dw, dh
        return dh, dw

    def box_mask(cx: float, cy: float, bw: float, bh: float, pad: float) -> np.ndarray:
        m = np.zeros((h, w), bool)
        x0b, y0b = int(max(0, round(cx - bw / 2.0 - pad))), int(max(0, round(cy - bh / 2.0 - pad)))
        x1b, y1b = int(min(w, round(cx + bw / 2.0 + pad))), int(min(h, round(cy + bh / 2.0 + pad)))
        m[y0b:y1b, x0b:x1b] = True
        return m

    pad_px = (0.08 / mpp) if mpp else 2.0
    regions: List[Tuple[RoomLabel, Tuple[int, int], np.ndarray, bool]] = []
    for cid, group in by_comp.items():
        creg = comp == cid
        ys_, xs_ = np.where(creg)
        cbb = (int(xs_.max() - xs_.min() + 1), int(ys_.max() - ys_.min() + 1))
        if len(group) == 1:
            _, lb, pt = group[0]
            reg = creg
            touches_border = bool(reg[0, :].any() or reg[-1, :].any() or reg[:, 0].any() or reg[:, -1].any())
            pb = printed_box(lb, pt, cbb)
            if pb and lb.room_type in _OUTSIDE_OK_TYPES and (touches_border or reg.sum() > 3.0 * pb[0] * pb[1]):
                reg = box_mask(pt[0], pt[1], pb[0], pb[1], pad_px) & free_all
            elif pb and (cbb[0] > pb[0] * 1.3 + 4 or cbb[1] > pb[1] * 1.3 + 4):
                cx = min(max(pt[0], xs_.min() + pb[0] / 2.0), xs_.max() - pb[0] / 2.0)
                cy = min(max(pt[1], ys_.min() + pb[1] / 2.0), ys_.max() - pb[1] / 2.0)
                reg = creg & box_mask(cx, cy, pb[0], pb[1], pad_px)
            regions.append((lb, pt, reg, False))
            continue
        # open-plan / not fully enclosed: split the shared floor between its labels with a
        # compact watershed (geodesic-ish Voronoi), then trim leaks to the printed size
        mk = np.zeros((h, w), np.int32)
        for k, (_, lb, pt) in enumerate(group, 1):
            cv2.circle(mk, pt, max(2, int(dim * 0.006)), k, -1)
        mk[~creg] = 0
        ws = watershed(-dist, mk, mask=creg, compactness=0.05)
        for k, (_, lb, pt) in enumerate(group, 1):
            reg = ws == k
            if not reg.any():
                continue
            ys2, xs2 = np.where(reg)
            rbb = (int(xs2.max() - xs2.min() + 1), int(ys2.max() - ys2.min() + 1))
            pb = printed_box(lb, pt, rbb)
            if pb and (rbb[0] > pb[0] * 1.35 + 4 or rbb[1] > pb[1] * 1.35 + 4):
                cx = min(max(float(pt[0]), xs2.min() + pb[0] / 2.0), xs2.max() - pb[0] / 2.0)
                cy = min(max(float(pt[1]), ys2.min() + pb[1] / 2.0), ys2.max() - pb[1] / 2.0)
                reg = reg & box_mask(cx, cy, pb[0], pb[1], pad_px)
            regions.append((lb, pt, reg, True))

    rooms: List[SegRoom] = []
    label_map = np.zeros((h, w), np.int32)
    open_k = max(3, int(round(dim * 0.008)))
    kern = cv2.getStructuringElement(cv2.MORPH_RECT, (open_k, open_k))
    for lb, pt, reg, shared in regions:
        if not reg.any():
            continue
        reg_u8 = cv2.morphologyEx(reg.astype(np.uint8), cv2.MORPH_OPEN, kern)
        n, lab = cv2.connectedComponents(reg_u8, connectivity=4)
        if n > 1:
            sl = lab[pt[1], pt[0]]
            if sl == 0:
                sizes = [(lab == k).sum() for k in range(1, n)]
                sl = 1 + int(np.argmax(sizes))
            reg = lab == sl
        else:
            reg = reg_u8 > 0
        if reg.sum() < 20:
            continue
        rooms.append(SegRoom(
            name=lb.name, room_type=lb.room_type, label=lb, mask=reg,
            polygon=_polygon(reg, max(1.5, dim * 0.004)),
            rect=_region_rect(reg), area_px=float(reg.sum()),
            dims_ft=lb.dims_ft, shared=shared,
        ))
        label_map[reg & (label_map == 0)] = len(rooms)

    if use_printed_sizes:
        _place_shared_rooms(rooms, label_map, free, mpp, (h, w))

    # building interior = labelled rooms + walls, closed over thin gaps and hole-filled
    occupied = ((label_map > 0) | wall_b).astype(np.uint8)
    ck = max(5, int(round(0.45 / mpp))) if mpp else max(5, int(dim * 0.03))
    closed = cv2.morphologyEx(occupied, cv2.MORPH_CLOSE, np.ones((ck, ck), np.uint8))
    interior = _fill_holes(closed) > 0

    # unlabelled enclosed floor (hall / passage): must be ringed by walls / rooms, not open air
    leftover = (free & (label_map == 0)).astype(np.uint8)
    leftover = cv2.morphologyEx(leftover, cv2.MORPH_OPEN, kern)
    n, lab, st, _ = cv2.connectedComponentsWithStats(leftover, connectivity=4)
    min_px = (min_inferred_m2 / (mpp * mpp)) if mpp else dim * dim * 0.012
    solid = (label_map > 0) | wall_b
    for k in range(1, n):
        area = st[k, cv2.CC_STAT_AREA]
        if area < min_px:
            continue
        reg = lab == k
        x, y, bw, bh = st[k, cv2.CC_STAT_LEFT], st[k, cv2.CC_STAT_TOP], st[k, cv2.CC_STAT_WIDTH], st[k, cv2.CC_STAT_HEIGHT]
        if x <= 1 or y <= 1 or x + bw >= w - 1 or y + bh >= h - 1:
            continue
        ring = cv2.dilate(reg.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        ring &= ~reg
        if ring.sum() == 0 or (ring & solid).sum() / float(ring.sum()) < 0.6:
            continue
        if (reg & interior).sum() < 0.9 * reg.sum():
            continue                      # open air / notch, not an enclosed space
        aspect = max(bw, bh) / max(1.0, min(bw, bh))
        thin = aspect >= 2.6 and min(bw, bh) * (mpp or 0.02) < 1.9
        if not thin and area * (mpp or 0.02) ** 2 < 9.0:
            continue                      # small unlabelled pocket (stairs, shaft): not a room
        rooms.append(SegRoom(
            name="Passage" if thin else "Hall",
            room_type="corridor" if thin else "living_room",
            label=None, mask=reg,
            polygon=_polygon(reg, max(1.5, dim * 0.004)),
            rect=_region_rect(reg), area_px=float(area), inferred=True,
        ))
        label_map[reg] = len(rooms)

    return SegmentationResult(rooms, walls, label_map, interior, footprint, mpp)


def calibrate_mpp(rooms: List[SegRoom]) -> Tuple[Optional[float], bool]:
    """
    Metres-per-pixel from printed room sizes: median of sqrt(printed_area / region_area).
    Returns (mpp, reliable). `reliable` is False when the printed sizes disagree with the drawn
    proportions (conceptual brochures), in which case printed sizes must not be used to clip or
    place rooms - only to caption them.
    """
    ratios: List[float] = []
    for r in rooms:
        if not r.dims_ft or r.inferred:
            continue
        ys, xs = np.where(r.mask)
        if len(xs) == 0:
            continue
        bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        fill = r.area_px / float(bw * bh)
        if fill < 0.85:
            continue
        printed = r.dims_ft[0] * r.dims_ft[1] * FT_TO_M * FT_TO_M
        ratios.append(math.sqrt(printed / (bw * bh)))
    if len(ratios) < 2:
        return None, False
    med = float(np.median(ratios))
    good = [x for x in ratios if abs(x - med) / med <= 0.20]
    if len(good) < 2:
        return None, False
    reliable = len(good) >= 3 and len(good) / len(ratios) >= 0.6
    return float(np.median(good)), reliable
