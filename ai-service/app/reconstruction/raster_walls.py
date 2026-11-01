"""
Raster wall extraction for drawings whose walls are drawn as solid / filled strokes
(the vast majority of builder unit plans and rendered brochures).

Why this exists
---------------
The previous pipeline thresholded the plan with a *local adaptive* threshold. That turns
the inside of every solid wall into background and only keeps its edges, so walls fall
apart into broken outlines, furniture outlines look like walls, and thin partitions
vanish. Here walls are recovered the way they are drawn:

  1. pick the darkness level at which the wall network forms one connected building,
  2. keep only straight horizontal / vertical *bars* of wall-like thickness (this
     removes text, furniture outlines, hatching, arcs, and large dark blobs),
  3. turn each bar into a centreline, merge collinear pieces, snap junctions,
  4. look at every gap between collinear pieces and classify it as a window (glazing
     lines inside the gap), a door (clear gap of door width) or an open passage.

Everything is in cropped-image pixels; the pipeline converts to metres afterwards.
"""
from dataclasses import dataclass, field
import math
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

THRESHOLDS = (70, 100, 130, 150, 170, 190)


@dataclass
class Bar:
    orient: str          # "h" (constant y) or "v" (constant x)
    pos: float           # perpendicular coordinate of the centreline
    a0: float            # extent along the wall
    a1: float
    th: float            # thickness (px)

    @property
    def length(self) -> float:
        return self.a1 - self.a0

    def endpoints(self) -> Tuple[Tuple[float, float], Tuple[float, float]]:
        if self.orient == "h":
            return (self.a0, self.pos), (self.a1, self.pos)
        return (self.pos, self.a0), (self.pos, self.a1)


@dataclass
class GapOpening:
    orient: str          # orientation of the host wall
    pos: float           # centreline coordinate of the host wall
    a0: float            # gap extent along the wall
    a1: float
    th: float
    kind: str            # "door" | "window" | "opening"
    glazing_lines: int = 0

    @property
    def width(self) -> float:
        return self.a1 - self.a0

    @property
    def center(self) -> Tuple[float, float]:
        m = (self.a0 + self.a1) / 2.0
        return (m, self.pos) if self.orient == "h" else (self.pos, m)


@dataclass
class RasterWallResult:
    ok: bool
    threshold: int
    bars: List[Bar] = field(default_factory=list)
    openings: List[GapOpening] = field(default_factory=list)
    mask: Optional[np.ndarray] = None       # bar mask used (uint8 0/255)
    median_thickness: float = 0.0
    score: float = 0.0


# ─── mask selection ───────────────────────────────────────────────────────────

def _params(dim: int) -> Tuple[int, int, int]:
    tmin = max(3, int(round(dim * 0.0035)))
    tmax = max(10, int(round(dim * 0.06)))
    min_len = max(12, int(dim * 0.03))
    return tmin, tmax, min_len


def _bar_masks(gray: np.ndarray, thr: int) -> Tuple[np.ndarray, np.ndarray]:
    dim = max(gray.shape[:2])
    tmin, tmax, L = _params(dim)
    ink = (gray < thr).astype(np.uint8) * 255
    # large dark blobs (filled floors, plants, columns, big furniture) are not walls
    blob = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (tmax, tmax)))
    blob = cv2.dilate(blob, np.ones((3, 3), np.uint8))
    ink2 = cv2.bitwise_and(ink, cv2.bitwise_not(blob))
    h = cv2.morphologyEx(ink2, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (L, tmin)))
    v = cv2.morphologyEx(ink2, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (tmin, L)))
    return h, v


def _network_score(mask: np.ndarray) -> float:
    """Total length of long straight wall runs, in multiples of the image's long side."""
    dim = max(mask.shape[:2])
    n, _, st, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    total = 0.0
    for i in range(1, n):
        ext = max(st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT])
        if ext >= dim * 0.12:
            total += ext
    return total / dim


def select_masks(gray: np.ndarray) -> Tuple[np.ndarray, np.ndarray, int, float]:
    """Lowest darkness threshold that already recovers (almost) all long wall runs."""
    cands = []
    for thr in THRESHOLDS:
        h, v = _bar_masks(gray, thr)
        cands.append((h, v, thr, _network_score(cv2.bitwise_or(h, v))))
    top = max(c[3] for c in cands)
    for c in cands:
        if c[3] >= 0.85 * top:
            return c
    return cands[-1]


# ─── bars ─────────────────────────────────────────────────────────────────────

def _bars_from_mask(mask: np.ndarray, orient: str, min_len: int) -> List[Bar]:
    """Connected runs of an axis-opened mask -> centreline bars (handles stepped / thick blobs)."""
    work = mask.copy()
    bars: List[Bar] = []
    for _ in range(6):
        n, lab, st, cen = cv2.connectedComponentsWithStats(work, connectivity=8)
        if n < 2:
            break
        leftover = np.zeros_like(work)
        any_left = False
        for i in range(1, n):
            x, y, w, h, area = st[i]
            length = w if orient == "h" else h
            if length < min_len:
                continue
            comp = lab[y:y + h, x:x + w] == i
            thick_axis = h if orient == "h" else w
            prof = comp.sum(axis=1) if orient == "h" else comp.sum(axis=0)
            mean_th = area / float(length)
            if thick_axis <= mean_th * 1.35 + 1:
                band = (0, thick_axis)
            else:
                # irregular blob: keep the densest band of rows/cols, re-process the remainder
                pk = prof.max()
                idx = np.where(prof >= pk * 0.55)[0]
                # largest contiguous run containing the peak
                p = int(np.argmax(prof))
                lo = hi = p
                while lo - 1 >= 0 and prof[lo - 1] >= pk * 0.55:
                    lo -= 1
                while hi + 1 < len(prof) and prof[hi + 1] >= pk * 0.55:
                    hi += 1
                band = (lo, hi + 1)
                rest = comp.copy()
                if orient == "h":
                    rest[band[0]:band[1], :] = False
                    sub = np.zeros_like(work)
                    sub[y:y + h, x:x + w][rest] = 255
                else:
                    rest[:, band[0]:band[1]] = False
                    sub = np.zeros_like(work)
                    sub[y:y + h, x:x + w][rest] = 255
                leftover = cv2.bitwise_or(leftover, sub)
                any_left = True
                if orient == "h":
                    sel = comp[band[0]:band[1], :]
                    cols = np.where(sel.any(axis=0))[0]
                    a0, a1 = x + cols.min(), x + cols.max() + 1
                    th = float(sel.sum() / max(1, (a1 - a0)))
                    pos = y + (band[0] + band[1]) / 2.0
                else:
                    sel = comp[:, band[0]:band[1]]
                    rows = np.where(sel.any(axis=1))[0]
                    a0, a1 = y + rows.min(), y + rows.max() + 1
                    th = float(sel.sum() / max(1, (a1 - a0)))
                    pos = x + (band[0] + band[1]) / 2.0
                if (a1 - a0) >= min_len:
                    bars.append(Bar(orient, float(pos), float(a0), float(a1), max(2.0, th)))
                continue
            # clean bar
            if orient == "h":
                pos = y + h / 2.0
                a0, a1 = x, x + w
            else:
                pos = x + w / 2.0
                a0, a1 = y, y + h
            bars.append(Bar(orient, float(pos), float(a0), float(a1), max(2.0, float(mean_th))))
        if not any_left:
            break
        work = leftover
    return bars


def _neutral_only(bars: List[Bar], bgr: np.ndarray, max_sat: int = 40) -> List[Bar]:
    """Walls are drawn neutral (black / grey); coloured strokes are furniture, plants, wood."""
    hsv_s = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[..., 1]
    h, w = hsv_s.shape
    keep: List[Bar] = []
    for b in bars:
        half = max(1, int(b.th / 2))
        if b.orient == "h":
            y0, y1 = int(max(0, b.pos - half)), int(min(h, b.pos + half + 1))
            sub = hsv_s[y0:y1, int(max(0, b.a0)):int(min(w, b.a1))]
        else:
            x0, x1 = int(max(0, b.pos - half)), int(min(w, b.pos + half + 1))
            sub = hsv_s[int(max(0, b.a0)):int(min(h, b.a1)), x0:x1]
        if sub.size == 0 or float(np.median(sub)) <= max_sat:
            keep.append(b)
    return keep


# ─── merging, gap classification, junction snapping ──────────────────────────

def _group_lines(bars: List[Bar], tol: float) -> List[List[Bar]]:
    bars = sorted(bars, key=lambda b: b.pos)
    groups: List[List[Bar]] = []
    for b in bars:
        if groups:
            g = groups[-1]
            ref = sum(x.pos * x.length for x in g) / sum(x.length for x in g)
            if abs(b.pos - ref) <= tol:
                g.append(b)
                continue
        groups.append([b])
    return groups


def _glazing_lines(gray: np.ndarray, orient: str, pos: float, a0: float, a1: float, th: float) -> int:
    """Count continuous thin lines across the wall band inside a gap (window glazing / sill lines)."""
    h, w = gray.shape[:2]
    half = th / 2.0 + 1.5
    shrink = max(2.0, (a1 - a0) * 0.12)       # ignore the jamb ends
    lo, hi = int(round(a0 + shrink)), int(round(a1 - shrink))
    if hi - lo < 4:
        return 0
    p0, p1 = int(round(pos - half)), int(round(pos + half)) + 1
    if orient == "h":
        sub = gray[max(0, p0):min(h, p1), max(0, lo):min(w, hi)]
        dark = sub < 200
        frac = dark.mean(axis=1) if dark.size else np.array([])
    else:
        sub = gray[max(0, lo):min(h, hi), max(0, p0):min(w, p1)]
        dark = sub < 200
        frac = dark.mean(axis=0) if dark.size else np.array([])
    if frac.size == 0:
        return 0
    on = frac >= 0.8
    # count runs of consecutive "on" rows
    runs, prev = 0, False
    for v in on:
        if v and not prev:
            runs += 1
        prev = bool(v)
    return runs


def _merge_line(group: List[Bar], gray: np.ndarray, door_max: float, window_max: float,
                orient: str) -> Tuple[List[Bar], List[GapOpening]]:
    pos = sum(b.pos * b.length for b in group) / sum(b.length for b in group)
    th = sum(b.th * b.length for b in group) / sum(b.length for b in group)
    spans = sorted((b.a0, b.a1, b.th) for b in group)
    merged: List[List[float]] = []
    for a0, a1, t in spans:
        if merged and a0 <= merged[-1][1] + 1.5:
            merged[-1][1] = max(merged[-1][1], a1)
        else:
            merged.append([a0, a1])
    out: List[Bar] = []
    openings: List[GapOpening] = []
    cur = list(merged[0])
    for nxt in merged[1:]:
        gap = nxt[0] - cur[1]
        n_lines = _glazing_lines(gray, orient, pos, cur[1], nxt[0], th)
        if (n_lines >= 2 and gap <= window_max * 1.7) or (n_lines >= 1 and gap <= window_max):
            kind = "window"
        elif gap <= door_max:
            kind = "door"
        else:
            kind = "opening"
        if kind in ("window", "door"):
            openings.append(GapOpening(orient, pos, cur[1], nxt[0], th, kind, n_lines))
            cur[1] = nxt[1]            # bridge: wall continues across the gap
            # keep the gap recorded; wall geometry is continuous, the viewer cuts the hole
        else:
            if gap <= window_max * 2:
                openings.append(GapOpening(orient, pos, cur[1], nxt[0], th, "opening", n_lines))
            out.append(Bar(orient, pos, cur[0], cur[1], th))
            cur = list(nxt)
    out.append(Bar(orient, pos, cur[0], cur[1], th))
    return out, openings


def _snap_junctions(hs: List[Bar], vs: List[Bar], openings: List[GapOpening]) -> None:
    """Move wall ends onto the centreline of the perpendicular wall they meet."""
    def snap(ends_owner: List[Bar], others: List[Bar]) -> None:
        for b in ends_owner:
            for end in ("a0", "a1"):
                e = getattr(b, end)
                best, best_d = None, None
                for o in others:
                    tol = o.th * 1.35 + 2.0
                    d = abs(o.pos - e)
                    if d > tol:
                        continue
                    # perpendicular wall must span this wall's centreline
                    if not (o.a0 - o.th <= b.pos <= o.a1 + o.th):
                        continue
                    if best is None or d < best_d:
                        best, best_d = o, d
                if best is not None:
                    setattr(b, end, best.pos)
    snap(hs, vs)
    snap(vs, hs)


def _trim_overshoots(hs: List[Bar], vs: List[Bar], dim: int) -> None:
    """
    A wall that runs a short way past a wall it crosses is almost always furniture lined up
    with it (bed edge, wardrobe side). Trim it back to the crossing wall.
    """
    max_stub = dim * 0.12

    def trim(owner: List[Bar], others: List[Bar]) -> None:
        for b in owner:
            crossers = [o for o in others
                        if b.a0 + b.th < o.pos < b.a1 - b.th and o.a0 - o.th <= b.pos <= o.a1 + o.th
                        and o.length >= b.th * 6]
            if not crossers:
                continue
            lo = min(c.pos for c in crossers)
            hi = max(c.pos for c in crossers)
            if 0 < lo - b.a0 <= max_stub and (hi - lo) >= 0 and (b.a1 - lo) > (lo - b.a0) * 1.2:
                b.a0 = lo
            if 0 < b.a1 - hi <= max_stub and (hi - b.a0) > (b.a1 - hi) * 1.2:
                b.a1 = hi

    trim(hs, vs)
    trim(vs, hs)


def _prune_isolated(bars: List[Bar], dim: int) -> List[Bar]:
    """Drop small unattached wall fragments (furniture, fixtures, stair risers)."""
    n = len(bars)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def touches(a: Bar, b: Bar) -> bool:
        pad = max(a.th, b.th) * 1.3 + 2
        if a.orient == b.orient:
            if abs(a.pos - b.pos) > pad:
                return False
            return a.a0 <= b.a1 + pad and b.a0 <= a.a1 + pad
        h, v = (a, b) if a.orient == "h" else (b, a)
        return (v.a0 - pad <= h.pos <= v.a1 + pad) and (h.a0 - pad <= v.pos <= h.a1 + pad)

    for i in range(n):
        for j in range(i + 1, n):
            if touches(bars[i], bars[j]):
                parent[find(i)] = find(j)
    comps: Dict[int, List[int]] = {}
    for i in range(n):
        comps.setdefault(find(i), []).append(i)
    long_len = dim * 0.08
    keep: List[Bar] = []
    for idxs in comps.values():
        total = sum(bars[i].length for i in idxs)
        longest = max(bars[i].length for i in idxs)
        if not (total >= dim * 0.12 or longest >= dim * 0.10 or len(idxs) >= 3):
            continue
        longs = [i for i in idxs if bars[i].length >= long_len]
        for i in idxs:
            if bars[i].length >= long_len:
                keep.append(bars[i])
            elif any(touches(bars[i], bars[j]) for j in longs):
                keep.append(bars[i])      # short piece (jamb, return) attached to a real wall
    return keep


# ─── public entry ─────────────────────────────────────────────────────────────

def extract_raster_walls(bgr: np.ndarray, mpp_hint: Optional[float] = None) -> RasterWallResult:
    """
    bgr: cropped plan image. mpp_hint: metres per pixel if known (OCR calibration); otherwise
    estimated from wall thickness (typical interior wall ~ 0.13 m).
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    dim = max(h, w)
    tmin, tmax, min_len = _params(dim)
    hm, vm, thr, score = select_masks(gray)
    if score < 1.2:
        return RasterWallResult(False, thr, mask=cv2.bitwise_or(hm, vm), score=score)

    hbars = _neutral_only(_bars_from_mask(hm, "h", min_len), bgr)
    vbars = _neutral_only(_bars_from_mask(vm, "v", min_len), bgr)
    allbars = hbars + vbars
    if len(allbars) < 4:
        return RasterWallResult(False, thr, mask=cv2.bitwise_or(hm, vm), score=score)
    med_th = float(np.median([b.th for b in allbars]))

    if mpp_hint and mpp_hint > 0:
        mpp = mpp_hint
    else:
        mpp = 0.13 / max(2.0, med_th)
    door_max = 1.35 / mpp
    window_max = 3.6 / mpp

    tol = max(2.5, med_th * 0.8)
    lines_h: List[Bar] = []
    lines_v: List[Bar] = []
    openings: List[GapOpening] = []
    for orient, bars, sink in (("h", hbars, lines_h), ("v", vbars, lines_v)):
        for grp in _group_lines(bars, tol):
            b, o = _merge_line(grp, gray, door_max, window_max, orient)
            sink.extend(b)
            openings.extend(o)

    _snap_junctions(lines_h, lines_v, openings)
    _trim_overshoots(lines_h, lines_v, dim)
    bars_out = _prune_isolated(lines_h + lines_v, dim)
    bars_out = [b for b in bars_out if b.length >= min_len * 0.8]

    # drop openings whose host wall was pruned away; re-anchor remaining ones to final bars
    final_openings: List[GapOpening] = []
    for o in openings:
        host = [b for b in bars_out if b.orient == o.orient and abs(b.pos - o.pos) <= 1.0
                and b.a0 - 2 <= o.a0 and b.a1 + 2 >= o.a1]
        if host or o.kind == "opening":
            final_openings.append(o)

    mask = np.zeros((h, w), np.uint8)
    for b in bars_out:
        (x0, y0), (x1, y1) = b.endpoints()
        cv2.line(mask, (int(round(x0)), int(round(y0))), (int(round(x1)), int(round(y1))),
                 255, max(1, int(round(b.th))))
    return RasterWallResult(True, thr, bars_out, final_openings, mask, med_th, score)
