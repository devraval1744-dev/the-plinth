"""
Floor-plan text reading (OCR).

Reads room labels ("MASTER BEDROOM"), printed dimensions ("14'5\" x 12'10\"") and
entrance markers directly from the drawing. These are deterministic, pixel-grounded
facts that the geometry pipeline uses to:
  - name and type every room (instead of trusting an LLM's guess of where rooms are),
  - calibrate pixels -> metres from the printed room sizes,
  - report the sizes the drawing itself states.

OCR is optional: if the engine is unavailable or fails, an empty list is returned and
the pipeline falls back to its previous behaviour.
"""
from dataclasses import dataclass
import difflib
import logging
import re
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

FT_TO_M = 0.3048

_engine = None
_engine_failed = False


@dataclass
class TextItem:
    text: str
    cx: float          # centre, cropped-image pixels
    cy: float
    w: float
    h: float
    conf: float


@dataclass
class RoomLabel:
    name: str                       # display name, e.g. "Master Bedroom"
    room_type: str                  # schema RoomType
    cx: float                       # label centre (cropped px)
    cy: float
    dims_ft: Optional[Tuple[float, float]] = None   # (a, b) as printed, feet
    dims_text: Optional[str] = None
    conf: float = 0.0


# keyword -> (display name, room type). Order matters: first match wins.
_ROOM_KEYWORDS: List[Tuple[str, str, str]] = [
    ("MASTERBEDROOM", "Master Bedroom", "bedroom"),
    ("MASTERBED", "Master Bedroom", "bedroom"),
    ("BEDROOM", "Bedroom", "bedroom"),
    ("BEDROCM", "Bedroom", "bedroom"),
    ("LIVINGDINING", "Living & Dining", "living_room"),
    ("LIVINGROOM", "Living Room", "living_room"),
    ("LIVING", "Living", "living_room"),
    ("LVING", "Living", "living_room"),
    ("DRAWING", "Drawing Room", "living_room"),
    ("LOUNGE", "Lounge", "living_room"),
    ("HALL", "Hall", "living_room"),
    ("DINING", "Dining", "dining"),
    ("KITCHEN", "Kitchen", "kitchen"),
    ("PANTRY", "Pantry", "kitchen"),
    ("TOILET", "Toilet", "bathroom"),
    ("BATHROOM", "Bathroom", "bathroom"),
    ("BATH", "Bathroom", "bathroom"),
    ("WASHROOM", "Washroom", "bathroom"),
    ("WC", "WC", "bathroom"),
    ("POOJA", "Pooja", "other"),
    ("PUJA", "Pooja", "other"),
    ("PUJAROOM", "Pooja", "other"),
    ("MANDIR", "Pooja", "other"),
    ("STORE", "Store", "utility"),
    ("UTILITY", "Utility", "utility"),
    ("WASHAREA", "Wash Area", "utility"),
    ("LAUNDRY", "Laundry", "utility"),
    ("WALKIN", "Walk-in Wardrobe", "other"),
    ("WARDROBE", "Wardrobe", "other"),
    ("DRESS", "Dressing", "other"),
    ("STUDY", "Study", "other"),
    ("BALCONY", "Balcony", "balcony"),
    ("TERRACE", "Terrace", "balcony"),
    ("PASSAGE", "Passage", "corridor"),
    ("CORRIDOR", "Corridor", "corridor"),
    ("LOBBY", "Lobby", "corridor"),
    ("FOYER", "Foyer", "corridor"),
    ("PORTICO", "Portico", "balcony"),
    ("PARKING", "Parking", "other"),
]

_FUZZY_WORDS = [k for k, _, _ in _ROOM_KEYWORDS if len(k) >= 5]

_ENTRY_WORDS = ("ENTRANCE", "ENTRY", "MAINDOOR")


def _get_engine():
    global _engine, _engine_failed
    if _engine is not None or _engine_failed:
        return _engine
    try:
        from rapidocr_onnxruntime import RapidOCR
        _engine = RapidOCR()
    except Exception as e:  # pragma: no cover - environment dependent
        logger.warning(f"[OCR] engine unavailable: {e}")
        _engine_failed = True
    return _engine


def read_text(bgr: np.ndarray, upscale: Optional[float] = None) -> List[TextItem]:
    """Run OCR on a plan crop. Coordinates are returned in the input image's pixels."""
    engine = _get_engine()
    if engine is None or bgr is None or bgr.size == 0:
        return []
    h, w = bgr.shape[:2]
    if upscale is None:
        # drawing text is small; bring the longer side to ~1500px for the recogniser
        upscale = float(np.clip(1500.0 / max(h, w), 1.0, 3.0))
    img = bgr
    if abs(upscale - 1.0) > 1e-3:
        img = cv2.resize(bgr, None, fx=upscale, fy=upscale, interpolation=cv2.INTER_CUBIC)
    try:
        res, _ = engine(img)
    except Exception as e:  # pragma: no cover
        logger.warning(f"[OCR] failed: {e}")
        return []
    items: List[TextItem] = []
    for box, txt, conf in res or []:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        items.append(TextItem(
            text=str(txt),
            cx=sum(xs) / 4.0 / upscale,
            cy=sum(ys) / 4.0 / upscale,
            w=(max(xs) - min(xs)) / upscale,
            h=(max(ys) - min(ys)) / upscale,
            conf=float(conf),
        ))
    return items


# ─── classification ───────────────────────────────────────────────────────────

def _letters(s: str) -> str:
    return re.sub(r"[^A-Z]", "", s.upper())


def classify_room_text(text: str) -> Optional[Tuple[str, str]]:
    """Map OCR text to (display name, room type) or None if it is not a room label."""
    letters = _letters(text)
    if len(letters) < 3:
        return None
    # numbered rooms: "BEDROOM 1", "TOILET 2" keep their number
    num = re.search(r"(\d)\s*$", text.strip())
    for key, name, rtype in _ROOM_KEYWORDS:
        if key in letters:
            if num and rtype in ("bedroom", "bathroom") and name in ("Bedroom", "Toilet", "Bathroom"):
                return f"{name} {num.group(1)}", rtype
            return name, rtype
    # fuzzy: tolerate a character or two of OCR damage ("BECROCM1" -> BEDROOM)
    if len(letters) >= 5:
        m = difflib.get_close_matches(letters, _FUZZY_WORDS, n=1, cutoff=0.74)
        if m:
            for key, name, rtype in _ROOM_KEYWORDS:
                if key == m[0]:
                    if num and rtype in ("bedroom", "bathroom") and name in ("Bedroom", "Toilet", "Bathroom"):
                        return f"{name} {num.group(1)}", rtype
                    return name, rtype
    return None


def is_entry_text(text: str) -> bool:
    letters = _letters(text)
    return any(w in letters for w in _ENTRY_WORDS) or (
        len(letters) >= 6 and bool(difflib.get_close_matches(letters, ["ENTRANCE"], n=1, cutoff=0.8))
    )


def _split_feet_inches(digits: str) -> Optional[Tuple[int, int]]:
    """'1210' -> (12, 10); '145' -> (14, 5); '102' -> (10, 2); '98' -> (9, 8); '35' -> (3, 5)."""
    n = len(digits)
    for cut in (n - 2, n - 1):       # inches are the last 2 digits, else the last digit
        if cut < 1:
            continue
        ft, inch = int(digits[:cut]), int(digits[cut:])
        if 2 <= ft <= 40 and 0 <= inch <= 11:
            return ft, inch
    return None


def parse_dimensions(text: str) -> Optional[Tuple[float, float]]:
    """Parse '14'5" x 9'10"' (tolerating OCR noise) into feet (a, b)."""
    t = text.upper().replace("×", "X").replace("*", "X")
    if "X" not in t:
        return None
    parts = [re.sub(r"\D", "", p) for p in t.split("X")[:2]]
    if len(parts) < 2 or not parts[0] or not parts[1]:
        return None
    a = _split_feet_inches(parts[0])
    b = _split_feet_inches(parts[1])
    if not a or not b:
        return None
    return a[0] + a[1] / 12.0, b[0] + b[1] / 12.0


def find_room_labels(items: List[TextItem]) -> List[RoomLabel]:
    """Group OCR items into room labels, attaching the dimension line printed below each."""
    labels: List[RoomLabel] = []
    dims_items = [(it, parse_dimensions(it.text)) for it in items]
    dims_items = [(it, d) for it, d in dims_items if d]
    used_dims = set()

    for it in items:
        cls = classify_room_text(it.text)
        if not cls or parse_dimensions(it.text):
            continue
        name, rtype = cls
        best, best_d = None, None
        for k, (dit, d) in enumerate(dims_items):
            if k in used_dims:
                continue
            dy = dit.cy - it.cy
            dx = abs(dit.cx - it.cx)
            if 0 < dy <= max(it.h * 3.2, 26) and dx <= max(it.w, dit.w) * 0.9:
                dist = dy + dx
                if best is None or dist < best:
                    best, best_d = dist, k
        dims = None
        dtext = None
        cx, cy = it.cx, it.cy
        if best_d is not None:
            used_dims.add(best_d)
            dit, dims = dims_items[best_d]
            dtext = dit.text
            cx = (it.cx + dit.cx) / 2.0
            cy = (it.cy + dit.cy) / 2.0
        labels.append(RoomLabel(name=name, room_type=rtype, cx=cx, cy=cy,
                                dims_ft=dims, dims_text=dtext, conf=it.conf))

    # merge duplicate detections of the same label (two-line OCR splits)
    merged: List[RoomLabel] = []
    for lb in sorted(labels, key=lambda l: -l.conf):
        if any(abs(lb.cx - m.cx) < 12 and abs(lb.cy - m.cy) < 12 and lb.room_type == m.room_type for m in merged):
            continue
        merged.append(lb)

    # a label word may be split across lines: "MASTER" + "BEDROOM" -> keep the longer match
    return _disambiguate_names(merged)


def _disambiguate_names(labels: List[RoomLabel]) -> List[RoomLabel]:
    """Give repeated names stable numbers (Toilet, Toilet -> Toilet 1, Toilet 2) in reading order."""
    counts: Dict[str, int] = {}
    for l in labels:
        counts[l.name] = counts.get(l.name, 0) + 1
    seen: Dict[str, int] = {}
    out = []
    for l in sorted(labels, key=lambda l: (round(l.cy / 40.0), l.cx)):
        if counts[l.name] > 1 and not re.search(r"\d$", l.name):
            seen[l.name] = seen.get(l.name, 0) + 1
            l.name = f"{l.name} {seen[l.name]}"
        out.append(l)
    return out
