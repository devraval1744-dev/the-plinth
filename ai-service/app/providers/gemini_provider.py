"""
Gemini Vision Blueprint Analysis Provider with Hybrid Reconstruction Engine.

Combines:
1. File Normalizer (PNG, JPG, PDF)
2. Region Detector (isolates floor plan from legends/borders)
3. Image Preprocessor (deterministic multi-scale filters, wall mask, edges)
4. Computer Vision Centerline Extractor (skeletonization, LSD, parallel pairing)
5. Vision AI (Gemini Vision / OpenAI structured semantic extraction)
6. Geometry Fusion Engine (pixel evidence as primary truth)
7. Shapely Planar Geometry Normalization (noding, T-junction splitting, collinear merge)
8. Room Polygonization (closed topological polygons, spatial label matching)
9. Wall Solid Generator (seamless 2D footprint union for Three.js extrusion)
10. Debug Overlay Visualizer (generates 10_final_overlay.png)
"""
from __future__ import annotations

import io
import math
import hashlib
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

from google import genai

from app.providers.base import BlueprintAnalysisProvider
from app.schemas.spatial import (
    BlueprintAnalysisResult,
    Room,
    Wall,
    Door,
    Window,
    Balcony,
)
from app.reconstruction import (
    HybridReconstructionPipeline,
    GeminiVisionAdapter,
    NormalizedWall,
    ShapelyNormalizer,
    WallSolidGenerator,
)

logger = logging.getLogger(__name__)

# Constants preserved for backwards-compatibility with tests
WALL_THICKNESS_EXTERIOR = 0.20
WALL_THICKNESS_INTERIOR = 0.12
CANVAS_MARGIN           = 0.35
MIN_CANVAS_DIM          = 6.0
MAX_CANVAS_DIM          = 30.0

UNIT_AREAS_M2: Dict[str, float] = {
    "studio":    35.0,
    "1 bhk":     45.0,
    "1.5 bhk":   55.0,
    "2 bhk":     70.0,
    "2.5 bhk":   85.0,
    "3 bhk":    110.0,
    "4 bhk":    150.0,
    "5 bhk":    190.0,
    "5+ bhk":   230.0,
}

VALID_ROOM_TYPES = {
    "living_room", "dining", "bedroom", "kitchen",
    "bathroom", "utility", "balcony", "corridor", "other"
}


def _extract_json(raw: str) -> Optional[Dict[str, Any]]:
    """Helper preserved for unit tests: extracts JSON object from raw LLM text."""
    import re, json
    clean = re.sub(r"```(?:json)?", "", raw, flags=re.I).strip().rstrip("`").strip()
    try:
        return json.loads(clean)
    except Exception:
        start = clean.find("{")
        end = clean.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(clean[start : end + 1])
            except Exception:
                pass
    return None


def _build_walls(rooms: List[Room]) -> List[Wall]:
    """Helper preserved for backwards compatibility with legacy tests."""
    from shapely.geometry import box
    from shapely.ops import unary_union
    walls: List[Wall] = []
    wid = 1
    for r in rooms:
        x0, y0 = r.x, r.y
        x1, y1 = r.x + r.width, r.y + r.height
        is_ext = r.type in ("balcony", "living_room")
        th = WALL_THICKNESS_EXTERIOR if is_ext else WALL_THICKNESS_INTERIOR
        walls.append(Wall(id=f"w{wid}", start_x=x0, start_y=y0, end_x=x1, end_y=y0, thickness=th))
        wid += 1
        walls.append(Wall(id=f"w{wid}", start_x=x1, start_y=y0, end_x=x1, end_y=y1, thickness=th))
        wid += 1
        walls.append(Wall(id=f"w{wid}", start_x=x1, start_y=y1, end_x=x0, end_y=y1, thickness=th))
        wid += 1
        walls.append(Wall(id=f"w{wid}", start_x=x0, start_y=y1, end_x=x0, end_y=y0, thickness=th))
        wid += 1
    return walls


def _snap_and_build_rooms(rooms_raw: List[Dict[str, Any]], usable_w: float, usable_h: float, margin: float) -> List[Room]:
    """Helper preserved for backwards compatibility with tests."""
    rooms: List[Room] = []
    for idx, r in enumerate(rooms_raw, 1):
        x = round(margin + (r.get("x_pct", 0) / 100.0) * usable_w, 2)
        y = round(margin + (r.get("y_pct", 0) / 100.0) * usable_h, 2)
        w = round((r.get("w_pct", 10) / 100.0) * usable_w, 2)
        h = round((r.get("h_pct", 10) / 100.0) * usable_h, 2)
        rooms.append(Room(
            id=f"r{idx}",
            name=r.get("name", f"Room {idx}"),
            type=r.get("type", "other"),
            x=x, y=y, width=max(0.5, w), height=max(0.5, h),
            area_sqft=r.get("area_sqft") or round(w * h * 10.7639, 1),
        ))
    return rooms


def _build_doors_windows(rooms: List[Room]) -> Tuple[List[Door], List[Window]]:
    """Helper preserved for backwards compatibility with tests."""
    doors = [Door(id="d1", x=rooms[0].x, y=rooms[0].y, width=0.9, orientation="north", connects_to=rooms[0].id)] if rooms else []
    windows = [Window(id="win1", x=rooms[0].x, y=rooms[0].y, width=1.2, orientation="north", connects_to=rooms[0].id)] if rooms else []
    return doors, windows


class GeminiProvider(BlueprintAnalysisProvider):
    """
    Real Vision AI Blueprint Analysis Provider using Google Gemini
    integrated with the Master Hybrid Reconstruction Pipeline.
    """

    def __init__(self, api_key: str, model: str = "gemini-3.1-flash-lite") -> None:
        self._api_key = api_key
        self._model = model
        self._vision_adapter = GeminiVisionAdapter(api_key=api_key, model_name=model)
        # Expose _client for mock compatibility in test suites
        self._client = self._vision_adapter._client
        self._pipeline = HybridReconstructionPipeline(vision_adapter=self._vision_adapter)
        logger.info(f"GeminiProvider (Hybrid Pipeline 2.0) initialized with model={model}")

    @property
    def provider_name(self) -> str:
        return "gemini_vision"

    @property
    def is_demo(self) -> bool:
        return False

    async def analyze(
        self,
        image_bytes: bytes,
        mime_type: str,
        blueprint_id: str,
        unit_type: Optional[str] = None,
        blueprint_version: int = 1,
    ) -> BlueprintAnalysisResult:
        debug_base = Path(__file__).parent.parent.parent / "debug_artifacts"
        # Sync mock client if test modified self._client
        if self._client is not self._vision_adapter._client:
            self._vision_adapter._client = self._client

        return await self._pipeline.reconstruct(
            image_bytes=image_bytes,
            mime_type=mime_type,
            blueprint_id=blueprint_id,
            unit_type=unit_type,
            blueprint_version=blueprint_version,
            debug_base_dir=debug_base,
        )
