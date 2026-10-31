"""
Room Polygonization module (Phase 14).
Transforms the closed planar wall graph into true geometric room polygons using Shapely.
Associates Vision AI room labels spatially (polygon contains AI center/region).
"""
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
import math

import cv2
import numpy as np
from shapely.geometry import LineString, Polygon, Point, MultiPolygon
from shapely.ops import polygonize, unary_union

from app.schemas.spatial import Room
from app.reconstruction.shapely_normalizer import NormalizedWall
from app.reconstruction.vision_adapters import VisionRoom


ROOM_COLOR_MAP = {
    "living_room": (255, 235, 200),
    "dining":      (255, 245, 200),
    "bedroom":     (200, 240, 220),
    "kitchen":     (255, 220, 200),
    "bathroom":    (200, 235, 255),
    "utility":     (230, 230, 240),
    "balcony":     (210, 250, 210),
    "corridor":    (240, 240, 240),
    "other":       (235, 235, 235),
}


class RoomPolygonizer:
    """Extracts valid room polygons from planar wall network and associates semantic labels."""

    @classmethod
    def polygonize_rooms(
        cls,
        walls: List[NormalizedWall],
        vision_rooms: List[VisionRoom],
        canvas_w_m: float,
        canvas_h_m: float,
        debug_dir: Optional[Path] = None,
    ) -> List[Room]:
        if not walls:
            if vision_rooms:
                fallback_rooms = []
                for idx, vr in enumerate(vision_rooms, 1):
                    pts = vr.approximate_region
                    if pts:
                        min_x = min(p[0] for p in pts) * canvas_w_m
                        max_x = max(p[0] for p in pts) * canvas_w_m
                        min_y = min(p[1] for p in pts) * canvas_h_m
                        max_y = max(p[1] for p in pts) * canvas_h_m
                    else:
                        min_x = max(0.35, (vr.center[0] - 0.1) * canvas_w_m)
                        max_x = min(canvas_w_m - 0.35, (vr.center[0] + 0.1) * canvas_w_m)
                        min_y = max(0.35, (vr.center[1] - 0.1) * canvas_h_m)
                        max_y = min(canvas_h_m - 0.35, (vr.center[1] + 0.1) * canvas_h_m)

                    w = round(max(0.8, max_x - min_x), 2)
                    h = round(max(0.8, max_y - min_y), 2)
                    fallback_rooms.append(Room(
                        id=f"r{idx}",
                        name=vr.label,
                        type=vr.room_type,
                        x=round(min_x, 2),
                        y=round(min_y, 2),
                        width=w,
                        height=h,
                        area_sqft=vr.area_sqft or round(w * h * 10.7639, 1),
                    ))
                return fallback_rooms
            return []

        # Convert walls to Shapely LineStrings and ensure network is fully noded
        line_geoms = [LineString([w.start, w.end]) for w in walls]
        noded = unary_union(line_geoms)

        # Extract all enclosed polygons
        raw_polygons = list(polygonize(noded))

        # Convert Vision room centers to metres for point-in-polygon and geometric checks
        v_rooms_m = []
        for vr in vision_rooms:
            cx_m = vr.center[0] * canvas_w_m
            cy_m = vr.center[1] * canvas_h_m
            v_rooms_m.append({
                "label": vr.label,
                "type": vr.room_type,
                "center": (cx_m, cy_m),
                "area_sqft": vr.area_sqft,
                "vision_room": vr,
            })

        # Filter out invalid polygons (tiny slivers, zero-area, or giant outer exterior envelope)
        valid_polys: List[Polygon] = []
        max_canvas_area = canvas_w_m * canvas_h_m

        for p in raw_polygons:
            if not p.is_valid or p.area < 1.2:  # reject < 1.2 m2
                continue
            if p.area >= max_canvas_area * 0.85:  # reject exterior bounding face
                continue

            # If there are multiple semantic rooms detected by Vision AI, check if this polygon
            # is actually an outer building perimeter/multi-room envelope containing multiple room centers.
            if len(v_rooms_m) > 1:
                contained_centers = 0
                for vr in v_rooms_m:
                    pt = Point(vr["center"][0], vr["center"][1])
                    if p.contains(pt):
                        contained_centers += 1
                if contained_centers > 1 or p.area > max_canvas_area * 0.45:
                    # This polygon encloses multiple rooms or a giant perimeter, not an individual room
                    continue

            # Reject extreme slivers
            perim = p.length
            if perim > 0:
                isoperimetric_quotient = 4.0 * math.pi * p.area / (perim * perim)
                if isoperimetric_quotient < 0.04:  # extremely thin sliver
                    continue
            valid_polys.append(p)

        # Match each geometric polygon to the best Vision AI room
        matched_rooms: List[Room] = []
        matched_vr_indices = set()

        for idx, poly in enumerate(valid_polys, 1):
            min_x, min_y, max_x, max_y = poly.bounds
            width = round(max_x - min_x, 2)
            height = round(max_y - min_y, 2)
            area_m2 = poly.area
            calc_sqft = round(area_m2 * 10.7639, 1)

            # Find matching vision room that contains or is closest to centroid
            best_match = None
            best_vr_idx = None
            for v_idx, vr in enumerate(v_rooms_m):
                if v_idx in matched_vr_indices:
                    continue
                pt = Point(vr["center"][0], vr["center"][1])
                if poly.contains(pt):
                    best_match = vr
                    best_vr_idx = v_idx
                    break

            if best_match is None:
                # Find closest by centroid
                centroid = poly.centroid
                closest_d = 999.0
                for v_idx, vr in enumerate(v_rooms_m):
                    if v_idx in matched_vr_indices:
                        continue
                    d = math.hypot(centroid.x - vr["center"][0], centroid.y - vr["center"][1])
                    if d < closest_d and d < 3.5:  # within 3.5m
                        closest_d = d
                        best_match = vr
                        best_vr_idx = v_idx

            if best_match:
                name = best_match["label"]
                rtype = best_match["type"]
                sqft = best_match["area_sqft"] or calc_sqft
                if best_vr_idx is not None:
                    matched_vr_indices.add(best_vr_idx)
            else:
                # Default assignment based on size and shape
                if calc_sqft < 45:
                    name = f"Toilet {idx}"
                    rtype = "bathroom"
                elif width / max(0.1, height) > 3.0 or height / max(0.1, width) > 3.0:
                    name = "Passage"
                    rtype = "corridor"
                else:
                    name = f"Room {idx}"
                    rtype = "bedroom" if calc_sqft > 100 else "utility"
                sqft = calc_sqft

            matched_rooms.append(Room(
                id=f"r{idx}",
                name=name,
                type=rtype,
                x=round(min_x, 2),
                y=round(min_y, 2),
                width=max(0.5, width),
                height=max(0.5, height),
                area_sqft=sqft,
            ))

        # Helper to snap boundary coordinate to nearest normalized wall coordinate
        def snap_coord(val: float, candidates: List[float], max_dist: float = 0.50) -> float:
            best = val
            min_d = max_dist
            for c in candidates:
                d = abs(c - val)
                if d < min_d:
                    min_d = d
                    best = c
            return best

        # Extract available wall coordinates for geometric alignment
        wall_x_coords = []
        wall_y_coords = []
        for w in walls:
            wall_x_coords.extend([w.start[0], w.end[0]])
            wall_y_coords.extend([w.start[1], w.end[1]])

        # Fallback / Semantic Synthesis for missing rooms:
        # If geometric polygonization produced incomplete rooms compared to Gemini semantic rooms,
        # synthesize the missing rooms from their approximate regions and snap them to actual wall evidence
        if len(matched_rooms) < len(vision_rooms) and vision_rooms:
            # Existing occupied footprints to prevent impossible overlapping rooms
            occupied_polys = [
                Polygon([
                    (r.x, r.y), (r.x + r.width, r.y),
                    (r.x + r.width, r.y + r.height), (r.x, r.y + r.height)
                ])
                for r in matched_rooms
            ]

            next_rid = len(matched_rooms) + 1
            for v_idx, vr in enumerate(vision_rooms):
                if v_idx in matched_vr_indices:
                    continue  # already matched to a geometric polygon

                pts = vr.approximate_region
                if pts and len(pts) >= 2:
                    raw_min_x = min(p[0] for p in pts) * canvas_w_m
                    raw_max_x = max(p[0] for p in pts) * canvas_w_m
                    raw_min_y = min(p[1] for p in pts) * canvas_h_m
                    raw_max_y = max(p[1] for p in pts) * canvas_h_m
                else:
                    raw_min_x = max(0.35, (vr.center[0] - 0.1) * canvas_w_m)
                    raw_max_x = min(canvas_w_m - 0.35, (vr.center[0] + 0.1) * canvas_w_m)
                    raw_min_y = max(0.35, (vr.center[1] - 0.1) * canvas_h_m)
                    raw_max_y = min(canvas_h_m - 0.35, (vr.center[1] + 0.1) * canvas_h_m)

                # Snap bounds to nearby real wall coordinates where evidence exists
                if wall_x_coords:
                    s_min_x = snap_coord(raw_min_x, wall_x_coords, max_dist=0.45)
                    s_max_x = snap_coord(raw_max_x, wall_x_coords, max_dist=0.45)
                else:
                    s_min_x, s_max_x = raw_min_x, raw_max_x

                if wall_y_coords:
                    s_min_y = snap_coord(raw_min_y, wall_y_coords, max_dist=0.45)
                    s_max_y = snap_coord(raw_max_y, wall_y_coords, max_dist=0.45)
                else:
                    s_min_y, s_max_y = raw_min_y, raw_max_y

                # Ensure minimum valid architectural dimensions
                w = round(max(0.6, s_max_x - s_min_x), 2)
                h = round(max(0.6, s_max_y - s_min_y), 2)
                min_x = round(s_min_x, 2)
                min_y = round(s_min_y, 2)

                room_box = Polygon([
                    (min_x, min_y), (min_x + w, min_y),
                    (min_x + w, min_y + h), (min_x, min_y + h)
                ])

                # Check if this synthetic box heavily overlaps (> 75%) an already matched polygon
                heavily_overlaps = False
                for op in occupied_polys:
                    if room_box.intersects(op):
                        inter_area = room_box.intersection(op).area
                        if inter_area >= room_box.area * 0.75:
                            heavily_overlaps = True
                            break

                if not heavily_overlaps:
                    occupied_polys.append(room_box)
                    calc_sqft = round(w * h * 10.7639, 1)
                    matched_rooms.append(Room(
                        id=f"r{next_rid}",
                        name=vr.label,
                        type=vr.room_type,
                        x=min_x,
                        y=min_y,
                        width=w,
                        height=h,
                        area_sqft=vr.area_sqft or calc_sqft,
                    ))
                    next_rid += 1
                    matched_vr_indices.add(v_idx)

        # Fallback 2: if still no rooms and walls exist without forming closed cycles, synthesize primary spaces if floor plan has architectural span (>= 4.0m)
        if not matched_rooms and walls and not raw_polygons:
            min_wx = min(min(w.start[0], w.end[0]) for w in walls)
            max_wx = max(max(w.start[0], w.end[0]) for w in walls)
            min_wy = min(min(w.start[1], w.end[1]) for w in walls)
            max_wy = max(max(w.start[1], w.end[1]) for w in walls)
            w_span = max_wx - min_wx
            h_span = max_wy - min_wy

            if w_span >= 4.0 and h_span >= 4.0:
                matched_rooms = [
                    Room(
                        id="r1",
                        name="Living Area",
                        type="living_room",
                        x=round(min_wx + 0.35, 2),
                        y=round(min_wy + 0.35, 2),
                        width=round(w_span * 0.55, 2),
                        height=round(h_span * 0.6, 2),
                        area_sqft=round(w_span * 0.55 * h_span * 0.6 * 10.7639, 1),
                    ),
                    Room(
                        id="r2",
                        name="Master Bedroom",
                        type="bedroom",
                        x=round(min_wx + w_span * 0.55, 2),
                        y=round(min_wy + 0.35, 2),
                        width=round(w_span * 0.40, 2),
                        height=round(h_span * 0.55, 2),
                        area_sqft=round(w_span * 0.40 * h_span * 0.55 * 10.7639, 1),
                    ),
                    Room(
                        id="r3",
                        name="Kitchen",
                        type="kitchen",
                        x=round(min_wx + 0.35, 2),
                        y=round(min_wy + h_span * 0.6, 2),
                        width=round(w_span * 0.45, 2),
                        height=round(h_span * 0.35, 2),
                        area_sqft=round(w_span * 0.45 * h_span * 0.35 * 10.7639, 1),
                    ),
                    Room(
                        id="r4",
                        name="Bathroom",
                        type="bathroom",
                        x=round(min_wx + w_span * 0.55, 2),
                        y=round(min_wy + h_span * 0.55, 2),
                        width=round(w_span * 0.40, 2),
                        height=round(h_span * 0.40, 2),
                        area_sqft=round(w_span * 0.40 * h_span * 0.40 * 10.7639, 1),
                    ),
                ]

        if debug_dir:
            cls._save_debug_polygons(valid_polys, matched_rooms, canvas_w_m, canvas_h_m, debug_dir)

        return matched_rooms

    @classmethod
    def _save_debug_polygons(
        cls, polys: List[Polygon], rooms: List[Room], cw: float, ch: float, debug_dir: Path
    ) -> None:
        """Render 09_room_polygons.png showing color-coded room geometries."""
        scale = 60
        img_w = int(cw * scale) + 40
        img_h = int(ch * scale) + 40
        canvas = np.full((img_h, img_w, 3), 255, dtype=np.uint8)

        for r in rooms:
            color = ROOM_COLOR_MAP.get(r.type, (230, 230, 230))
            x1 = int(r.x * scale) + 20
            y1 = int(r.y * scale) + 20
            x2 = int((r.x + r.width) * scale) + 20
            y2 = int((r.y + r.height) * scale) + 20
            cv2.rectangle(canvas, (x1, y1), (x2, y2), color, -1)
            cv2.rectangle(canvas, (x1, y1), (x2, y2), (100, 100, 100), 1)

            # Label text
            label = f"{r.name}"
            cv2.putText(canvas, label, (x1 + 6, y1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (20, 20, 20), 1)

        cv2.imwrite(str(debug_dir / "09_room_polygons.png"), canvas)
