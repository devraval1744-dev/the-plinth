"""
Image-Aware Blueprint Analysis Provider.

⚠️  This is an APPROXIMATE provider, NOT production-grade AI vision.
    It uses classical image processing (Pillow only, no neural networks)
    to extract rough room geometry from the actual uploaded blueprint image.

What it does:
    1. Converts the blueprint to grayscale.
    2. Locates the floor-plan bounding box (where wall lines concentrate).
    3. Applies a coarse grid segmentation to identify light (room-interior)
       vs dark (wall/structure) regions.
    4. Detects rectangular room-shaped light regions using a connected-
       component sweep over a downsampled binary grid.
    5. Maps detected regions to room types using position/size heuristics
       (e.g. central = living/dining, corner = bedroom, edge near center = kitchen).
    6. Scales pixel coordinates to metres using the unit_type to set an
       approximate total area reference.

What it does NOT do:
    - Real computer vision / neural network inference
    - Text recognition (room labels)
    - Precise dimension extraction from dimension lines
    - Door/window detection from architectural symbols

Result: the generated 3D reflects the ACTUAL spatial arrangement of the
uploaded blueprint rather than a generic BHK-type template.

The provider is still marked  is_demo=True  and provider="image_aware_demo"
throughout the system so the UI can display an honest disclosure.
"""
import io
import math
from typing import Optional, List, Tuple

from PIL import Image, ImageOps, ImageFilter

from app.providers.base import BlueprintAnalysisProvider
from app.providers.demo_provider import (
    DemoAnalysisProvider,
    _perimeter_walls,
    _2bhk_layout,
)
from app.schemas.spatial import (
    BlueprintAnalysisResult, Room, Wall, Door, Window, Balcony,
)

# ─── Constants ────────────────────────────────────────────────────────────────

# Pixel brightness below which a pixel is considered structural (wall/line)
WALL_THRESHOLD = 110

# Coarse analysis grid dimensions
GRID_COLS = 16
GRID_ROWS = 12

# Minimum fraction of the grid a detected room must occupy
MIN_ROOM_FRACTION_X = 1 / GRID_COLS
MIN_ROOM_FRACTION_Y = 1 / GRID_ROWS

# Approximate total floor areas (m²) by unit type — used to set canvas scale
UNIT_AREAS: dict[str, float] = {
    "studio":    45.0,
    "1 bhk":     60.0,
    "1.5 bhk":   70.0,
    "2 bhk":     95.0,
    "2.5 bhk":  110.0,
    "3 bhk":    135.0,
    "4 bhk":    175.0,
    "5 bhk":    220.0,
    "5+ bhk":   260.0,
}

# Typical aspect ratio of Indian residential floor plans
ASPECT_RATIO = 1.2   # width:height

# Room type classification heuristics (by normalised position on plan)
# Each entry: (norm_x_range, norm_y_range) → room_type, display_name
# Applied in order; first match wins.
_ROOM_HEURISTICS: List[Tuple[Tuple[float,float], Tuple[float,float], str, str]] = [
    # Balcony: very thin strip along any edge
    # (handled separately by shape analysis)
    # Entry/foyer: bottom-center
    ((0.3, 0.7), (0.8, 1.0), "corridor", "Entry"),
    # Bathrooms: small cells anywhere
    # (handled separately by size analysis)
    # Kitchen: rear area (top in blueprint = far from entry)
    ((0.0, 0.4), (0.0, 0.4), "kitchen", "Kitchen"),
    # Dining: central top
    ((0.35, 0.65), (0.0, 0.45), "dining", "Dining"),
    # Living: large central front
    ((0.0, 0.5), (0.4, 0.85), "living_room", "Living Room"),
    # Master bedroom: corner (top-right typical in Indian plans)
    ((0.55, 1.0), (0.0, 0.5), "bedroom", "Master Bedroom"),
    # Bedroom 2: another corner
    ((0.55, 1.0), (0.5, 1.0), "bedroom", "Bedroom 2"),
    # Bedroom 3: remaining rear
    ((0.0, 0.5), (0.0, 0.4), "bedroom", "Bedroom 3"),
    # Default
    ((0.0, 1.0), (0.0, 1.0), "other", "Room"),
]


# ─── Image processing helpers ─────────────────────────────────────────────────

def _load_gray(image_bytes: bytes, mime_type: str) -> Optional[Image.Image]:
    """Load image bytes and convert to grayscale. Returns None on failure."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        return ImageOps.grayscale(img)
    except Exception:
        return None


def _find_plan_bbox(
    gray: Image.Image,
    threshold: int = WALL_THRESHOLD,
    scan_step: int = 8,
) -> Tuple[int, int, int, int]:
    """
    Find the bounding box of the floor-plan content by locating
    rows and columns that contain a significant density of dark pixels.
    Returns (x0, y0, x1, y1) in pixels.
    """
    w, h = gray.size
    min_dark = 2  # minimum dark pixels per row/col to count as plan content

    plan_rows = []
    for y in range(0, h, scan_step):
        dark = sum(
            1 for x in range(0, w, scan_step)
            if gray.getpixel((x, y)) < threshold
        )
        if dark >= min_dark:
            plan_rows.append(y)

    plan_cols = []
    for x in range(0, w, scan_step):
        dark = sum(
            1 for y in range(0, h, scan_step)
            if gray.getpixel((x, y)) < threshold
        )
        if dark >= min_dark:
            plan_cols.append(x)

    if not plan_rows or not plan_cols:
        # Fall back to full image
        return 0, 0, w, h

    return (
        max(0, min(plan_cols) - scan_step),
        max(0, min(plan_rows) - scan_step),
        min(w, max(plan_cols) + scan_step),
        min(h, max(plan_rows) + scan_step),
    )


def _build_grid(
    plan: Image.Image,
    cols: int,
    rows: int,
    threshold: int = WALL_THRESHOLD,
) -> List[List[float]]:
    """
    Build a 2D grid of dark-pixel density values (0.0–1.0) for the
    plan image.  High values = wall/structural; low values = room interior.
    """
    pw, ph = plan.size
    cell_w = pw / cols
    cell_h = ph / rows
    sample = 5  # sample points per cell dimension

    grid: List[List[float]] = []
    for gy in range(rows):
        row: List[float] = []
        for gx in range(cols):
            dark_count = 0
            total = 0
            for sx in range(sample):
                for sy in range(sample):
                    px = int((gx + (sx + 0.5) / sample) * cell_w)
                    py = int((gy + (sy + 0.5) / sample) * cell_h)
                    px = min(px, pw - 1)
                    py = min(py, ph - 1)
                    if plan.getpixel((px, py)) < threshold:
                        dark_count += 1
                    total += 1
            row.append(dark_count / total if total else 0.0)
        grid.append(row)
    return grid


def _detect_light_regions(
    grid: List[List[float]],
    cols: int,
    rows: int,
    light_threshold: float = 0.25,
    min_w: int = 1,
    min_h: int = 1,
) -> List[Tuple[int, int, int, int]]:
    """
    Find rectangular regions of the grid where darkness is below
    light_threshold (i.e., mostly room interior, not wall).
    Uses a maximal-rectangle scan to find contiguous light blocks.
    Returns list of (col0, row0, col1, row1) in grid coordinates.
    """
    # Binary: 1 = light (room interior), 0 = wall/structural
    binary = [
        [1 if grid[r][c] < light_threshold else 0 for c in range(cols)]
        for r in range(rows)
    ]

    visited = [[False] * cols for _ in range(rows)]
    regions: List[Tuple[int, int, int, int]] = []

    for r0 in range(rows):
        for c0 in range(cols):
            if not binary[r0][c0] or visited[r0][c0]:
                continue
            # Flood expand to find largest contiguous light rectangle from (r0, c0)
            # Simple greedy expansion: find max extent right, then down
            c1 = c0
            while c1 < cols - 1 and binary[r0][c1 + 1]:
                c1 += 1
            r1 = r0
            while r1 < rows - 1:
                # check entire row is still light in column range
                if all(binary[r1 + 1][c] for c in range(c0, c1 + 1)):
                    r1 += 1
                else:
                    break

            w = c1 - c0 + 1
            h = r1 - r0 + 1
            if w >= min_w and h >= min_h:
                regions.append((c0, r0, c1, r1))
            # Mark visited
            for r in range(r0, r1 + 1):
                for c in range(c0, c1 + 1):
                    visited[r][c] = True

    return regions


def _deduplicate_regions(
    regions: List[Tuple[int, int, int, int]],
    cols: int,
    rows: int,
    overlap_threshold: float = 0.6,
) -> List[Tuple[int, int, int, int]]:
    """Remove regions that substantially overlap with a larger region."""
    def area(r: Tuple[int,int,int,int]) -> int:
        return (r[2]-r[0]+1) * (r[3]-r[1]+1)

    sorted_r = sorted(regions, key=area, reverse=True)
    kept: List[Tuple[int,int,int,int]] = []
    for reg in sorted_r:
        c0,r0,c1,r1 = reg
        dominated = False
        for k in kept:
            kc0,kr0,kc1,kr1 = k
            # Intersection
            ic0 = max(c0,kc0); ir0 = max(r0,kr0)
            ic1 = min(c1,kc1); ir1 = min(r1,kr1)
            if ic0 <= ic1 and ir0 <= ir1:
                inter = (ic1-ic0+1)*(ir1-ir0+1)
                if inter / area(reg) > overlap_threshold:
                    dominated = True
                    break
        if not dominated:
            kept.append(reg)
    return kept


def _classify_room(
    norm_x: float,  # normalised centre x [0,1]
    norm_y: float,  # normalised centre y [0,1]
    norm_w: float,  # normalised width
    norm_h: float,  # normalised height
    idx: int,
    bhk_count: int,
    existing_types: List[str],
) -> Tuple[str, str]:
    """
    Classify a detected region into a room type + display name
    using position and size heuristics.
    """
    norm_area = norm_w * norm_h

    # Very thin strips → balcony
    if norm_w < 0.12 or norm_h < 0.10:
        return "balcony", "Balcony"

    # Small cells → bathroom
    if norm_area < 0.045:
        bath_n = existing_types.count("bathroom") + 1
        return "bathroom", f"Bathroom {bath_n}" if bath_n > 1 else "Bathroom"

    # Small-ish utility
    if norm_area < 0.07 and norm_h < 0.25:
        return "utility", "Utility"

    # Count existing bedrooms to decide naming
    bed_count = existing_types.count("bedroom")

    # Apply positional heuristics (in priority order)
    for (x_range, y_range, rtype, rname) in _ROOM_HEURISTICS:
        if x_range[0] <= norm_x <= x_range[1] and y_range[0] <= norm_y <= y_range[1]:
            # Don't over-assign kitchen/dining/living if we've already added them
            if rtype in ("kitchen", "dining", "living_room", "corridor") and rtype in existing_types:
                continue
            if rtype == "bedroom":
                bed_count = existing_types.count("bedroom")
                if bed_count == 0:
                    return "bedroom", "Master Bedroom"
                elif bed_count == 1:
                    return "bedroom", "Bedroom 2"
                elif bed_count == 2:
                    return "bedroom", "Bedroom 3"
                elif bed_count == 3:
                    return "bedroom", "Bedroom 4"
                continue
            return rtype, rname

    # Final fallback
    return "other", f"Room {idx + 1}"


# ─── Main extraction ──────────────────────────────────────────────────────────

def _extract_spatial(
    image_bytes: bytes,
    mime_type: str,
    blueprint_id: str,
    unit_type: Optional[str],
    blueprint_version: int,
) -> Optional[BlueprintAnalysisResult]:
    """
    Attempt to extract a blueprint-faithful spatial layout from the image.
    Returns None if extraction is not feasible (non-image format, too small, etc.)
    """
    # Only attempt for raster images
    if mime_type not in ("image/png", "image/jpeg", "image/jpg", "image/webp"):
        return None

    gray = _load_gray(image_bytes, mime_type)
    if gray is None:
        return None

    w, h = gray.size
    if w < 64 or h < 64:
        return None  # Too small to analyse

    # Find floor-plan bounding box
    x0, y0, x1, y1 = _find_plan_bbox(gray)
    plan_w = x1 - x0
    plan_h = y1 - y0

    if plan_w < 40 or plan_h < 40:
        return None

    plan = gray.crop((x0, y0, x1, y1))

    # Lightly blur to reduce noise before analysis
    plan = plan.filter(ImageFilter.GaussianBlur(radius=1))

    # Build darkness grid
    grid = _build_grid(plan, GRID_COLS, GRID_ROWS)

    # Find light (room interior) regions
    raw_regions = _detect_light_regions(
        grid, GRID_COLS, GRID_ROWS,
        light_threshold=0.3,
        min_w=1, min_h=1,
    )

    if not raw_regions:
        return None

    regions = _deduplicate_regions(raw_regions, GRID_COLS, GRID_ROWS)

    # Sort largest first so important rooms come out first
    regions.sort(key=lambda r: (r[2]-r[0]+1)*(r[3]-r[1]+1), reverse=True)

    # ── Determine canvas scale ────────────────────────────────────────────────
    key = (unit_type or "").strip().lower()
    total_area = UNIT_AREAS.get(key, 95.0)   # m²
    bhk_count = int(key.split()[0]) if key and key[0].isdigit() else 2

    # canvas_width × canvas_height ≈ total_area (with aspect ratio)
    canvas_height = math.sqrt(total_area / ASPECT_RATIO)
    canvas_width  = canvas_height * ASPECT_RATIO
    canvas_width  = round(canvas_width,  2)
    canvas_height = round(canvas_height, 2)

    MARGIN = 0.15  # outer margin in metres

    # ── Convert grid regions to Room objects ─────────────────────────────────
    rooms: List[Room] = []
    existing_types: List[str] = []

    for idx, (c0, r0, c1, r1) in enumerate(regions[:14]):  # cap at 14 rooms
        # Normalised grid position [0, 1]
        nc0 = c0 / GRID_COLS
        nr0 = r0 / GRID_ROWS
        nc1 = (c1 + 1) / GRID_COLS
        nr1 = (r1 + 1) / GRID_ROWS

        norm_cx = (nc0 + nc1) / 2
        norm_cy = (nr0 + nr1) / 2
        norm_w  = nc1 - nc0
        norm_h  = nr1 - nr0

        room_type, room_name = _classify_room(
            norm_cx, norm_cy, norm_w, norm_h, idx, bhk_count, existing_types
        )
        existing_types.append(room_type)

        # Scale to metres (with margin)
        usable_w = canvas_width  - 2 * MARGIN
        usable_h = canvas_height - 2 * MARGIN

        rx = round(MARGIN + nc0 * usable_w, 2)
        ry = round(MARGIN + nr0 * usable_h, 2)
        rw = round(max(norm_w * usable_w, 0.5), 2)
        rh = round(max(norm_h * usable_h, 0.5), 2)

        # Clamp to canvas
        rw = min(rw, canvas_width  - rx - MARGIN)
        rh = min(rh, canvas_height - ry - MARGIN)

        if rw <= 0 or rh <= 0:
            continue

        rooms.append(Room(
            id=f"r{idx+1}",
            name=room_name,
            type=room_type,
            x=rx, y=ry,
            width=rw, height=rh,
        ))

    if len(rooms) < 2:
        return None  # Not enough rooms extracted — fall back to demo

    # ── Generate walls from room boundaries ──────────────────────────────────
    walls: List[Wall] = _perimeter_walls(canvas_width, canvas_height)

    # Add internal walls along room boundaries
    # For each room, add top/bottom/left/right boundary walls
    wall_idx = 0
    seen_walls: set = set()
    for room in rooms:
        for seg in [
            (room.x, room.y,              room.x + room.width, room.y),           # top
            (room.x, room.y + room.height, room.x + room.width, room.y + room.height),  # bottom
            (room.x, room.y,              room.x,              room.y + room.height),   # left
            (room.x + room.width, room.y, room.x + room.width, room.y + room.height),   # right
        ]:
            key_fwd = (round(seg[0],1), round(seg[1],1), round(seg[2],1), round(seg[3],1))
            key_rev = (round(seg[2],1), round(seg[3],1), round(seg[0],1), round(seg[1],1))
            # Skip perimeter (already added) and duplicates
            is_perimeter = (
                (seg[1] <= MARGIN and seg[3] <= MARGIN) or
                (seg[1] >= canvas_height - MARGIN and seg[3] >= canvas_height - MARGIN) or
                (seg[0] <= MARGIN and seg[2] <= MARGIN) or
                (seg[0] >= canvas_width - MARGIN and seg[2] >= canvas_width - MARGIN)
            )
            if is_perimeter or key_fwd in seen_walls or key_rev in seen_walls:
                continue
            length = math.sqrt((seg[2]-seg[0])**2 + (seg[3]-seg[1])**2)
            if length < 0.3:
                continue
            seen_walls.add(key_fwd)
            walls.append(Wall(
                id=f"iw{wall_idx}",
                start_x=seg[0], start_y=seg[1],
                end_x=seg[2],   end_y=seg[3],
                thickness=0.15,
            ))
            wall_idx += 1

    # ── Generate simplified doors ─────────────────────────────────────────────
    doors: List[Door] = []
    for di, room in enumerate(rooms):
        # One door per room on its most accessible edge
        cx = room.x + room.width  / 2
        cy = room.y + room.height / 2

        if cy > canvas_height * 0.6:  # room is in lower half → door on top
            doors.append(Door(
                id=f"d{di+1}", x=cx, y=room.y,
                width=0.9, orientation="north", connects_to=room.id
            ))
        else:  # room in upper half → door on bottom
            doors.append(Door(
                id=f"d{di+1}", x=cx, y=room.y + room.height,
                width=0.9, orientation="south", connects_to=room.id
            ))

    # ── Generate simplified windows ───────────────────────────────────────────
    windows: List[Window] = []
    ext_rooms = [r for r in rooms if r.x <= MARGIN + 0.1 or r.y <= MARGIN + 0.1 or
                 r.x + r.width >= canvas_width - MARGIN - 0.1 or
                 r.y + r.height >= canvas_height - MARGIN - 0.1]

    for wi, room in enumerate(ext_rooms[:8]):
        cx = room.x + room.width  / 2
        cy = room.y + room.height / 2

        if room.y <= MARGIN + 0.3:
            windows.append(Window(id=f"w{wi+1}", x=cx, y=room.y, width=1.2, orientation="north"))
        elif room.y + room.height >= canvas_height - MARGIN - 0.3:
            windows.append(Window(id=f"w{wi+1}", x=cx, y=room.y + room.height, width=1.2, orientation="south"))

    # ── Balconies from rooms classified as balcony ────────────────────────────
    balconies: List[Balcony] = []
    for room in rooms:
        if room.type == "balcony":
            balconies.append(Balcony(
                id=f"bal_{room.id}",
                x=room.x, y=room.y,
                width=room.width, height=room.height,
            ))

    return BlueprintAnalysisResult(
        blueprint_id=blueprint_id,
        unit_type=unit_type,
        blueprint_version=blueprint_version,
        provider="image_aware_demo",
        is_demo=True,
        canvas_width=canvas_width,
        canvas_height=canvas_height,
        rooms=rooms,
        walls=walls,
        doors=doors,
        windows=windows,
        balconies=balconies,
    )


# ─── Provider class ───────────────────────────────────────────────────────────

class ImageAwareProvider(BlueprintAnalysisProvider):
    """
    Blueprint-aware analysis provider.

    Attempts to derive room geometry from the actual uploaded blueprint image
    using classical image processing (Pillow).  Falls back to the static demo
    layout when image analysis is not feasible (PDF, very small image, etc.).

    Still marked is_demo=True and provider='image_aware_demo' because this
    is approximate, non-AI analysis — not a professional architectural CAD tool.
    The 3D reflects real spatial proportions from the uploaded blueprint.
    """

    def __init__(self) -> None:
        self._fallback = DemoAnalysisProvider()

    @property
    def provider_name(self) -> str:
        return "image_aware_demo"

    @property
    def is_demo(self) -> bool:
        return True

    async def analyze(
        self,
        image_bytes: bytes,
        mime_type: str,
        blueprint_id: str,
        unit_type: Optional[str],
        blueprint_version: int,
    ) -> BlueprintAnalysisResult:
        # Attempt image-derived layout
        result = _extract_spatial(
            image_bytes, mime_type, blueprint_id, unit_type, blueprint_version
        )

        if result is not None:
            return result

        # Fall back to static demo layout (PDF, tiny image, extraction failure)
        fallback = await self._fallback.analyze(
            image_bytes, mime_type, blueprint_id, unit_type, blueprint_version
        )
        # Override provider name so callers know it was a fallback
        return BlueprintAnalysisResult(
            **{
                **fallback.model_dump(),
                "provider": "image_aware_demo_fallback",
                "is_demo": True,
            }
        )
