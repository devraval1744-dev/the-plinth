"""
Vision AI Provider Abstraction (Phase 7 & 8).
Connects to Gemini Vision or OpenAI Vision to obtain semantic architectural understanding:
- Property footprint
- Semantic walls (EXTERNAL, INTERNAL, PARTITION)
- Rooms (labels, approximate boundaries, types)
- Doors and windows
Coordinates are normalized to [0, 1] drawing space.
"""
from abc import ABC, abstractmethod
import asyncio
from dataclasses import dataclass, field
import json
import logging
import math
import os
import re
from typing import List, Tuple, Dict, Any, Optional

import httpx
from google import genai
from google.genai import types as genai_types

logger = logging.getLogger(__name__)


@dataclass
class VisionSemanticWall:
    id: str
    type: str  # "EXTERNAL", "INTERNAL", "PARTITION"
    start: Tuple[float, float]  # (norm_x, norm_y) in [0, 1]
    end: Tuple[float, float]    # (norm_x, norm_y) in [0, 1]
    confidence: float


@dataclass
class VisionRoom:
    label: str
    room_type: str  # "living_room", "bedroom", "kitchen", "bathroom", "balcony", etc.
    approximate_region: List[Tuple[float, float]]  # List of (x, y) corners in [0, 1]
    center: Tuple[float, float]
    area_sqft: Optional[float] = None
    confidence: float = 0.9


@dataclass
class VisionDoor:
    id: str
    position: Tuple[float, float]
    connects_to: Optional[str] = None


@dataclass
class VisionWindow:
    id: str
    position: Tuple[float, float]
    connects_to: Optional[str] = None


@dataclass
class VisionIntermediateResult:
    footprint: Dict[str, float]
    semantic_walls: List[VisionSemanticWall]
    rooms: List[VisionRoom]
    doors: List[VisionDoor]
    windows: List[VisionWindow]
    uncertain_regions: List[Dict[str, Any]]
    unit_type: Optional[str] = None
    provider_name: str = "gemini"
    model_name: str = "gemini-3.1-flash-lite"


_VISION_PROMPT = """You are an expert architectural blueprint and CAD draftsman analyzer.
Analyze this residential floor plan image and return ONLY a valid JSON object describing the architectural elements.
Coordinates must be normalized numbers between 0 and 1000 representing drawing coordinates (0 = top/left, 1000 = bottom/right).

Return EXACTLY this JSON structure:
{
  "unit_type": "<e.g. 2 BHK, 3 BHK, 4 BHK>",
  "total_area_sqft": <estimated total carpet area as number>,
  "footprint": { "min_x": 0, "min_y": 0, "max_x": 1000, "max_y": 1000 },
  "semantic_walls": [
    {
      "id": "w1",
      "type": "EXTERNAL",
      "start": {"x": 50, "y": 50},
      "end": {"x": 950, "y": 50},
      "confidence": 0.95
    }
  ],
  "rooms": [
    {
      "label": "Master Bedroom",
      "type": "bedroom",
      "approximate_region": [
        {"x": 100, "y": 100},
        {"x": 400, "y": 100},
        {"x": 400, "y": 500},
        {"x": 100, "y": 500}
      ],
      "center": {"x": 250, "y": 300},
      "area_sqft": 150
    }
  ],
  "doors": [
    { "id": "d1", "position": {"x": 250, "y": 100}, "connects_to": "Master Bedroom" }
  ],
  "windows": [
    { "id": "win1", "position": {"x": 100, "y": 300}, "connects_to": "Master Bedroom" }
  ],
  "uncertain_regions": []
}

CRITICAL ARCHITECTURAL RULES:
1. Room types must be one of: living_room, dining, bedroom, kitchen, bathroom, utility, balcony, corridor, other.
2. Label every room exactly as written in the blueprint.
3. EXTRACT ALL WALLS:
   - Include the full outer building perimeter (EXTERNAL).
   - Crucial: Include EVERY interior partition wall (INTERNAL) that separates rooms (e.g. between Bedroom & Hall, between Bedroom & Toilet, between Kitchen & Utility, etc.).
   - Do NOT include furniture outlines (beds, sofas, tables, sinks, stove) as walls. Walls are ONLY structural room dividing boundaries.
4. Return ONLY the JSON object. No markdown fences. No explanations."""


class BaseVisionAdapter(ABC):
    @abstractmethod
    async def extract_semantic_geometry(
        self,
        image_bytes: bytes,
        mime_type: str,
        unit_type: Optional[str] = None,
    ) -> VisionIntermediateResult:
        pass


class GeminiVisionAdapter(BaseVisionAdapter):
    """Google Gemini Vision adapter using google-genai v2 SDK."""

    def __init__(self, api_key: str, model_name: str = "gemini-3.1-flash-lite"):
        self._api_key = api_key
        self._model = model_name
        self._client = genai.Client(api_key=api_key)

    async def extract_semantic_geometry(
        self,
        image_bytes: bytes,
        mime_type: str,
        unit_type: Optional[str] = None,
    ) -> VisionIntermediateResult:
        hint = f"\nThis floor plan is labeled as a {unit_type} unit." if unit_type else ""
        prompt = _VISION_PROMPT + hint

        contents = [
            genai_types.Content(
                role="user",
                parts=[
                    genai_types.Part(text=prompt),
                    genai_types.Part(
                        inline_data=genai_types.Blob(data=image_bytes, mime_type=mime_type)
                    ),
                ],
            )
        ]

        for attempt in range(3):
            try:
                response = await self._client.aio.models.generate_content(
                    model=self._model,
                    contents=contents,
                    config=genai_types.GenerateContentConfig(
                        temperature=0.05,
                        max_output_tokens=4096,
                    ),
                )
                return self._parse_vision_json(response.text, self._model, "gemini")
            except Exception as e:
                err_str = str(e)
                if ("503" in err_str or "429" in err_str or "UNAVAILABLE" in err_str or "RESOURCE_EXHAUSTED" in err_str) and attempt < 2:
                    logger.warning(f"Gemini Vision call transient error ({err_str[:80]}), retrying in {(attempt + 1) * 2}s...")
                    await asyncio.sleep(float((attempt + 1) * 2))
                    continue
                raise

    def _parse_vision_json(self, raw_text: str, model_name: str, provider_name: str) -> VisionIntermediateResult:
        # Strip markdown fences
        clean = re.sub(r"```(?:json)?", "", raw_text, flags=re.I).strip().rstrip("`").strip()
        data = None
        try:
            data = json.loads(clean)
        except Exception:
            start = clean.find("{")
            end = clean.rfind("}")
            if start != -1 and end != -1:
                data = json.loads(clean[start : end + 1])

        if not data or not isinstance(data, dict):
            logger.warning(f"Could not parse valid JSON from Vision provider text: {raw_text[:200]}")
            return VisionIntermediateResult(
                footprint={"min_x": 0, "min_y": 0, "max_x": 1000, "max_y": 1000},
                semantic_walls=[],
                rooms=[],
                doors=[],
                windows=[],
                uncertain_regions=[],
                unit_type=None,
                provider_name=provider_name,
                model_name=model_name,
            )

        # Detect scale (is it 0-1000 or 0-100 or 0-1?)
        scale = 1000.0
        # Check coordinates across walls and rooms
        sample_vals = []
        for w in data.get("semantic_walls", []):
            st = w.get("start", {})
            sample_vals.extend([st.get("x", 0), st.get("y", 0)])
        for r in data.get("rooms", []):
            c = r.get("center", {})
            sample_vals.extend([c.get("x", 0), c.get("y", 0)])
            for pt in r.get("approximate_region", []):
                sample_vals.extend([pt.get("x", 0), pt.get("y", 0)])
            for k in ("x_pct", "y_pct", "w_pct", "h_pct", "x", "y", "width", "height"):
                if k in r and r[k] is not None:
                    sample_vals.append(r[k])

        max_sample = max([float(v) for v in sample_vals if v is not None] or [1000.0])
        if max_sample <= 1.2:
            scale = 1.0
        elif max_sample <= 120.0:
            scale = 100.0
        else:
            scale = 1000.0

        def to_norm(val: Any) -> float:
            try:
                return max(0.0, min(1.0, float(val) / scale))
            except Exception:
                return 0.0

        # Parse rooms first so we can synthesize walls if needed
        rooms: List[VisionRoom] = []
        for r in data.get("rooms", []):
            label = str(r.get("name") or r.get("label") or "Room").strip()
            rtype = str(r.get("type", "other")).strip().lower()
            region_pts = []
            for pt in r.get("approximate_region", []):
                region_pts.append((to_norm(pt.get("x", 0)), to_norm(pt.get("y", 0))))

            c = r.get("center", {})
            cx = to_norm(c.get("x", 0)) if c else 0.0
            cy = to_norm(c.get("y", 0)) if c else 0.0

            # Handle bounding box pct format (x_pct, y_pct, w_pct, h_pct)
            if not region_pts and ("x_pct" in r or "w_pct" in r or "width" in r or "x" in r):
                rx = to_norm(r.get("x_pct", r.get("x", 0)))
                ry = to_norm(r.get("y_pct", r.get("y", 0)))
                rw = to_norm(r.get("w_pct", r.get("w", r.get("width", 0))))
                rh = to_norm(r.get("h_pct", r.get("h", r.get("height", 0))))
                rx1 = min(1.0, rx + rw)
                ry1 = min(1.0, ry + rh)
                region_pts = [(rx, ry), (rx1, ry), (rx1, ry1), (rx, ry1)]
                cx = (rx + rx1) / 2.0
                cy = (ry + ry1) / 2.0

            if not region_pts and (cx or cy):
                # Synthesize 4 points if only center was provided
                d = 0.08
                region_pts = [(cx - d, cy - d), (cx + d, cy - d), (cx + d, cy + d), (cx - d, cy + d)]

            if not (cx and cy) and region_pts:
                cx = sum(p[0] for p in region_pts) / len(region_pts)
                cy = sum(p[1] for p in region_pts) / len(region_pts)

            rooms.append(VisionRoom(
                label=label,
                room_type=rtype,
                approximate_region=region_pts,
                center=(cx, cy),
                area_sqft=float(r["area_sqft"]) if r.get("area_sqft") is not None else None,
                confidence=float(r.get("confidence", 0.9)),
            ))

        # Parse walls
        semantic_walls: List[VisionSemanticWall] = []
        for idx, w in enumerate(data.get("semantic_walls", []), 1):
            st = w.get("start", {})
            en = w.get("end", {})
            p1 = (to_norm(st.get("x", 0)), to_norm(st.get("y", 0)))
            p2 = (to_norm(en.get("x", 0)), to_norm(en.get("y", 0)))
            wtype = str(w.get("type", "INTERNAL")).upper()
            if wtype not in ("EXTERNAL", "INTERNAL", "PARTITION"):
                wtype = "INTERNAL"
            semantic_walls.append(VisionSemanticWall(
                id=str(w.get("id", f"sw_{idx}")),
                type=wtype,
                start=p1,
                end=p2,
                confidence=float(w.get("confidence", 0.9)),
            ))

        # Fallback: if semantic_walls is missing from LLM response or mock, derive from room boundaries
        if not semantic_walls and rooms:
            sw_idx = 1
            for rm in rooms:
                pts = rm.approximate_region
                if len(pts) >= 4:
                    for i in range(len(pts)):
                        p_a = pts[i]
                        p_b = pts[(i + 1) % len(pts)]
                        if math.hypot(p_b[0] - p_a[0], p_b[1] - p_a[1]) > 0.02:
                            semantic_walls.append(VisionSemanticWall(
                                id=f"sw_synth_{sw_idx}",
                                type="INTERNAL",
                                start=p_a,
                                end=p_b,
                                confidence=0.85,
                            ))
                            sw_idx += 1

        # Parse doors & windows
        doors = [
            VisionDoor(
                id=str(d.get("id", f"d_{i}")),
                position=(to_norm(d.get("position", {}).get("x", 0)), to_norm(d.get("position", {}).get("y", 0))),
                connects_to=d.get("connects_to"),
            )
            for i, d in enumerate(data.get("doors", []), 1)
        ]
        windows = [
            VisionWindow(
                id=str(w.get("id", f"win_{i}")),
                position=(to_norm(w.get("position", {}).get("x", 0)), to_norm(w.get("position", {}).get("y", 0))),
                connects_to=w.get("connects_to"),
            )
            for i, w in enumerate(data.get("windows", []), 1)
        ]

        fp_raw = data.get("footprint", {})
        footprint = {
            "min_x": to_norm(fp_raw.get("min_x", 0)),
            "min_y": to_norm(fp_raw.get("min_y", 0)),
            "max_x": to_norm(fp_raw.get("max_x", scale)),
            "max_y": to_norm(fp_raw.get("max_y", scale)),
        }

        return VisionIntermediateResult(
            footprint=footprint,
            semantic_walls=semantic_walls,
            rooms=rooms,
            doors=doors,
            windows=windows,
            uncertain_regions=data.get("uncertain_regions", []),
            unit_type=data.get("unit_type"),
            provider_name=provider_name,
            model_name=model_name,
        )


class OpenAIVisionAdapter(BaseVisionAdapter):
    """OpenAI Vision adapter (optional adapter if OPENAI_API_KEY is configured)."""

    def __init__(self, api_key: str, model_name: str = "gpt-4o"):
        self._api_key = api_key
        self._model = model_name

    async def extract_semantic_geometry(
        self,
        image_bytes: bytes,
        mime_type: str,
        unit_type: Optional[str] = None,
    ) -> VisionIntermediateResult:
        import base64
        b64_img = base64.b64encode(image_bytes).decode("utf-8")
        data_uri = f"data:{mime_type};base64,{b64_img}"

        payload = {
            "model": self._model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _VISION_PROMPT},
                        {"type": "image_url", "image_url": {"url": data_uri, "detail": "high"}},
                    ],
                }
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.05,
        }

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post("https://api.openai.com/v1/chat/completions", json=payload, headers=headers)
            resp.raise_for_status()
            res_json = resp.json()
            raw_text = res_json["choices"][0]["message"]["content"]

        # Delegate parsing to GeminiVisionAdapter helper
        dummy = GeminiVisionAdapter(api_key="none")
        return dummy._parse_vision_json(raw_text, self._model, "openai")


def get_vision_adapter(provider_override: Optional[str] = None) -> BaseVisionAdapter:
    """Factory creating configured Vision Adapter without exposing keys."""
    provider = (provider_override or os.getenv("VISION_PROVIDER") or os.getenv("AI_PROVIDER") or "gemini").lower()

    if "openai" in provider:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("VISION_PROVIDER=openai requires OPENAI_API_KEY.")
        model = os.getenv("OPENAI_MODEL", "gpt-4o")
        return OpenAIVisionAdapter(api_key=api_key, model_name=model)

    # Default to Gemini Vision
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("VISION_PROVIDER=gemini requires GEMINI_API_KEY.")
    model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    return GeminiVisionAdapter(api_key=api_key, model_name=model)
