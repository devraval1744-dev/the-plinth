"""
GLB 3D Model Generator for Plinth Real-Estate Intelligence Platform.

Converts structured SpatialAnalysis metric data (produced by Plinth AI pipeline)
into valid, high-fidelity 3D GLB models using Trimesh.

Core capabilities:
- True metric scale (1 unit = 1 metre).
- Coordinate transformation matching Plinth Three.js viewer:
    x_3d = x - cx
    y_3d = elevation (Y-up: 0.0 at floor surface)
    z_3d = -(y - cz)
- Wall slicing: reliably detects doors/windows on walls using Euclidean point-to-segment
  projection and creates lintel slabs (headers), window sills, and clear openings.
- Unaligned openings generate warning logs rather than silent bogus geometry.
- Fallback dimensions (wall height, door height, sill height) are configurable dataclass parameters,
  never masquerading as detected blueprint facts.
- Floor slab matches exact canvas dimensions (canvas_width x canvas_height).
- Optional procedural furniture generated strictly within valid room bounds without
  distorting or hiding structural geometry.
"""
from __future__ import annotations

import io
import math
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional, Union

import numpy as np
import trimesh

from app.schemas.spatial import (
    BlueprintAnalysisResult,
    Room,
    Wall,
    Door,
    Window,
    Balcony,
)

logger = logging.getLogger(__name__)


# ─── Configurable Architectural Fallback Assumptions ──────────────────────────

@dataclass
class ArchitecturalConfig:
    """
    Standard architectural parameters used when specific measurements
    are not extracted directly from blueprint dimension strings.
    """
    default_wall_height: float = 2.80       # metres
    default_door_height: float = 2.10       # metres
    default_window_sill_height: float = 0.90 # metres
    default_window_height: float = 1.20      # metres (top of window = sill + height = 2.10m)
    default_wall_thickness: float = 0.15    # metres
    floor_slab_thickness: float = 0.05      # metres
    door_projection_tolerance: float = 0.35 # metres (max distance to snap door to wall)
    window_projection_tolerance: float = 0.35 # metres (max distance to snap window to wall)
    enable_furniture: bool = False          # whether to place procedural furniture in rooms
    enable_door_leaves: bool = False        # whether to render protruding door panels (false = clean open doorway frames)


# ─── Color Palette for GLB Models (RGBA 0-255) ────────────────────────────────

COLORS = {
    "wall_exterior": [235, 237, 242, 255],    # Clean architectural off-white / light slate
    "wall_interior": [240, 242, 245, 255],    # Soft off-white interior
    "wall_lintel":   [191, 199, 209, 255],    # Muted lintel header
    "floor":         [245, 242, 237, 255],    # Architectural warm concrete / light stone
    "glass":         [64, 191, 242, 90],      # Translucent cyan glass
    "window_frame":  [180, 185, 195, 255],    # Aluminum frame
    "door_leaf":     [180, 140, 100, 255],    # Warm wood finish
    "door_frame":    [140, 105, 75, 255],     # Wood trim
    "balcony":       [200, 235, 215, 220],    # Soft mint green
    "furniture_wood":[170, 125, 85, 255],     # Warm architectural wood
    "furniture_soft":[235, 235, 240, 255],    # Light fabric / upholstery
}


# ─── Coordinate Helpers ───────────────────────────────────────────────────────

def blueprint_to_3d(x: float, y: float, cx: float, cz: float) -> Tuple[float, float]:
    """
    Converts 2D blueprint coordinates (metres) to Three.js / GLTF centered space.
    x_3d = x - cx
    z_3d = -(y - cz)
    """
    return float(x - cx), float(-(y - cz))


def point_to_segment_projection(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> Tuple[float, float, float, float]:
    """
    Projects point (px, py) onto line segment (x1, y1)-(x2, y2).
    Returns (proj_x, proj_y, distance, t) where t in [0.0, 1.0] is along segment.
    """
    dx = x2 - x1
    dy = y2 - y1
    len_sq = dx * dx + dy * dy
    if len_sq < 1e-6:
        dist = math.hypot(px - x1, py - y1)
        return x1, y1, dist, 0.0

    t = ((px - x1) * dx + (py - y1) * dy) / len_sq
    t_clamped = max(0.0, min(1.0, t))
    proj_x = x1 + t_clamped * dx
    proj_y = y1 + t_clamped * dy
    dist = math.hypot(px - proj_x, py - proj_y)
    return proj_x, proj_y, dist, t_clamped


# ─── Procedural Mesh Builders ─────────────────────────────────────────────────

def build_box_mesh(
    extents: Tuple[float, float, float],
    center: Tuple[float, float, float],
    rotation_y: float = 0.0,
    color: Optional[List[int]] = None,
    name: str = "box",
) -> trimesh.Trimesh:
    """Creates an oriented box mesh with architectural PBR material."""
    box = trimesh.creation.box(extents=extents)
    if rotation_y != 0.0:
        rot = trimesh.transformations.rotation_matrix(rotation_y, [0, 1, 0])
        box.apply_transform(rot)
    box.apply_translation(center)
    if color is not None:
        box.visual.vertex_colors = color
        rgba = [c / 255.0 for c in color[:4]]
        roughness = 0.10 if ("glass" in name) else (0.55 if "floor" in name else 0.70)
        box.visual.material = trimesh.visual.material.PBRMaterial(
            baseColorFactor=rgba,
            metallicFactor=0.05,
            roughnessFactor=roughness,
            alphaMode="BLEND" if rgba[3] < 0.99 else "OPAQUE"
        )
    box.metadata["name"] = name
    return box


def build_wall_segment(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    bottom_y: float,
    height: float,
    thickness: float,
    cx: float,
    cz: float,
    color: List[int],
    name: str = "wall_segment",
) -> Optional[trimesh.Trimesh]:
    """
    Builds a wall box from 2D start p1 to end p2.
    """
    x1, y1 = p1
    x2, y2 = p2
    dx = x2 - x1
    dy = y2 - y1
    length = math.hypot(dx, dy)
    if length < 0.02:
        return None

    # Midpoint in blueprint coords
    mid_bp_x = (x1 + x2) / 2.0
    mid_bp_y = (y1 + y2) / 2.0
    mid_x, mid_z = blueprint_to_3d(mid_bp_x, mid_bp_y, cx, cz)
    mid_y = bottom_y + (height / 2.0)

    # Angle: blueprint y -> Three.js -z, so angle is Math.atan2(-dy, dx)
    angle = math.atan2(-dy, dx)

    return build_box_mesh(
        extents=(length, height, max(0.08, thickness)),
        center=(mid_x, mid_y, mid_z),
        rotation_y=angle,
        color=color,
        name=name,
    )


# ─── Procedural Furniture Builders ────────────────────────────────────────────

def create_procedural_bed(
    center_3d: Tuple[float, float, float],
    width_m: float = 1.8,
    length_m: float = 2.0,
    height_m: float = 0.55,
) -> trimesh.Trimesh:
    """Procedural bed: base frame + mattress + pillows."""
    cx, _, cz = center_3d
    parts = []
    # Wooden frame / legs
    frame = build_box_mesh(
        extents=(width_m, 0.22, length_m),
        center=(cx, 0.11, cz),
        color=COLORS["furniture_wood"],
        name="bed_frame",
    )
    parts.append(frame)
    # Headboard
    hb = build_box_mesh(
        extents=(width_m, 0.85, 0.10),
        center=(cx, 0.425, cz - length_m / 2.0 + 0.05),
        color=COLORS["furniture_wood"],
        name="bed_headboard",
    )
    parts.append(hb)
    # Mattress
    mattress = build_box_mesh(
        extents=(width_m * 0.95, 0.22, length_m * 0.92),
        center=(cx, 0.33, cz + 0.05),
        color=COLORS["furniture_soft"],
        name="bed_mattress",
    )
    parts.append(mattress)
    # Pillow 1 & 2
    pw = width_m * 0.40
    pl = 0.35
    p1 = build_box_mesh(
        extents=(pw, 0.08, pl),
        center=(cx - pw / 2.0 - 0.05, 0.48, cz - length_m / 2.0 + 0.30),
        color=[255, 255, 255, 255],
        name="pillow_1",
    )
    p2 = build_box_mesh(
        extents=(pw, 0.08, pl),
        center=(cx + pw / 2.0 + 0.05, 0.48, cz - length_m / 2.0 + 0.30),
        color=[255, 255, 255, 255],
        name="pillow_2",
    )
    parts.extend([p1, p2])
    return trimesh.util.concatenate(parts)


def create_procedural_kitchen_counter(
    center_3d: Tuple[float, float, float],
    width_m: float = 1.4,
    depth_m: float = 0.60,
    height_m: float = 0.85,
) -> trimesh.Trimesh:
    """Procedural kitchen platform / counter with stainless sink & stove."""
    cx, _, cz = center_3d
    parts = []
    # Counter cabinet base
    base = build_box_mesh(
        extents=(width_m, height_m - 0.05, depth_m),
        center=(cx, (height_m - 0.05) / 2.0, cz),
        color=[220, 225, 230, 255],
        name="kitchen_cabinet",
    )
    parts.append(base)
    # Granite top slab
    top = build_box_mesh(
        extents=(width_m + 0.04, 0.05, depth_m + 0.04),
        center=(cx, height_m - 0.025, cz),
        color=[60, 65, 75, 255],
        name="kitchen_granite",
    )
    parts.append(top)
    # Stove burner top
    stove = build_box_mesh(
        extents=(0.45, 0.02, 0.35),
        center=(cx - width_m / 4.0, height_m + 0.01, cz),
        color=[30, 30, 35, 255],
        name="kitchen_stove",
    )
    parts.append(stove)
    return trimesh.util.concatenate(parts)


def create_procedural_bathroom_fixtures(
    center_3d: Tuple[float, float, float],
) -> trimesh.Trimesh:
    """Procedural toilet commode + wash basin fixture."""
    cx, _, cz = center_3d
    parts = []
    # Toilet commode pedestal & tank
    bowl = build_box_mesh(
        extents=(0.38, 0.42, 0.55),
        center=(cx - 0.25, 0.21, cz),
        color=[250, 250, 252, 255],
        name="toilet_bowl",
    )
    tank = build_box_mesh(
        extents=(0.38, 0.35, 0.18),
        center=(cx - 0.25, 0.42 + 0.175, cz - 0.20),
        color=[250, 250, 252, 255],
        name="toilet_tank",
    )
    # Vanity basin
    basin = build_box_mesh(
        extents=(0.45, 0.15, 0.40),
        center=(cx + 0.25, 0.75, cz),
        color=[245, 245, 250, 255],
        name="vanity_basin",
    )
    parts.extend([bowl, tank, basin])
    return trimesh.util.concatenate(parts)


def create_procedural_sofa(
    center_3d: Tuple[float, float, float],
    width_m: float = 1.8,
    depth_m: float = 0.75,
    height_m: float = 0.70,
) -> trimesh.Trimesh:
    """Procedural sofa: seat base + backrest + armrests."""
    cx, _, cz = center_3d
    parts = []
    # Seat base
    seat = build_box_mesh(
        extents=(width_m, 0.35, depth_m),
        center=(cx, 0.175, cz),
        color=COLORS["furniture_soft"],
        name="sofa_seat",
    )
    parts.append(seat)
    # Backrest
    back = build_box_mesh(
        extents=(width_m, height_m - 0.35, 0.16),
        center=(cx, 0.35 + (height_m - 0.35) / 2.0, cz - depth_m / 2.0 + 0.08),
        color=COLORS["furniture_soft"],
        name="sofa_back",
    )
    parts.append(back)
    # Coffee table in front of sofa
    coffee_tab = build_box_mesh(
        extents=(width_m * 0.60, 0.35, depth_m * 0.55),
        center=(cx, 0.175, cz + depth_m / 2.0 + 0.40),
        color=COLORS["furniture_wood"],
        name="coffee_table",
    )
    parts.append(coffee_tab)
    return trimesh.util.concatenate(parts)


def create_procedural_dining_table(
    center_3d: Tuple[float, float, float],
    length_m: float = 1.3,
    width_m: float = 0.8,
    height_m: float = 0.75,
) -> trimesh.Trimesh:
    """Procedural dining table: top slab + 4 legs."""
    cx, _, cz = center_3d
    parts = []
    # Table top
    top = build_box_mesh(
        extents=(length_m, 0.04, width_m),
        center=(cx, height_m - 0.02, cz),
        color=COLORS["furniture_wood"],
        name="table_top",
    )
    parts.append(top)
    # 4 legs
    leg_w = 0.06
    leg_h = height_m - 0.04
    for sx in (-1, 1):
        for sz in (-1, 1):
            lx = cx + sx * (length_m / 2.0 - 0.08)
            lz = cz + sz * (width_m / 2.0 - 0.08)
            leg = build_box_mesh(
                extents=(leg_w, leg_h, leg_w),
                center=(lx, leg_h / 2.0, lz),
                color=COLORS["furniture_wood"],
                name="table_leg",
            )
            parts.append(leg)
    return trimesh.util.concatenate(parts)


# ─── Main Generator Class ─────────────────────────────────────────────────────

class GLBGenerator:
    """
    Transforms structured SpatialAnalysis results into production-grade GLB 3D assets.
    """

    def __init__(self, config: Optional[ArchitecturalConfig] = None):
        self.config = config or ArchitecturalConfig()

    def generate_scene(
        self,
        analysis: Union[BlueprintAnalysisResult, Dict[str, Any]],
    ) -> Tuple[trimesh.Scene, List[str]]:
        """
        Builds a full 3D scene from SpatialAnalysis.
        Returns (scene, warnings_list).
        """
        # Accept either Pydantic model or dict
        if isinstance(analysis, dict):
            # Strict validation using schema
            data = BlueprintAnalysisResult(**analysis)
        elif isinstance(analysis, BlueprintAnalysisResult):
            data = analysis
        else:
            raise ValueError(f"Unsupported analysis type: {type(analysis)}")

        canvas_w = float(data.canvas_width)
        canvas_h = float(data.canvas_height)
        if canvas_w <= 0.0 or canvas_h <= 0.0:
            raise ValueError(f"Invalid canvas dimensions: {canvas_w} x {canvas_h}")

        if not data.walls and not data.rooms:
            raise ValueError("Analysis contains neither walls nor rooms to generate 3D geometry")

        # Centering constants matching Plinth Three.js viewer exactly:
        # cx = canvas_width / 2, cz = canvas_height / 2
        cx = canvas_w / 2.0
        cz = canvas_h / 2.0

        scene = trimesh.Scene()
        warnings: List[str] = []

        # ─── 1. Floor Slab ────────────────────────────────────────────────────
        # Exact canvas dimensions matching customer 3D viewer
        slab_thick = self.config.floor_slab_thickness
        floor_mesh = build_box_mesh(
            extents=(canvas_w, slab_thick, canvas_h),
            center=(0.0, -slab_thick / 2.0, 0.0),
            color=COLORS["floor"],
            name="floor_slab",
        )
        scene.add_geometry(floor_mesh, node_name="floor_slab", geom_name="floor_slab")

        # ─── 2. Room Floor Finishes ───────────────────────────────────────────
        for idx, room in enumerate(data.rooms, 1):
            rw = float(room.width)
            rh = float(room.height)
            if rw < 0.2 or rh < 0.2:
                continue

            rx_center = float(room.x) + rw / 2.0
            ry_center = float(room.y) + rh / 2.0
            r3d_x, r3d_z = blueprint_to_3d(rx_center, ry_center, cx, cz)

            # Room color tint based on room type
            room_color = list(COLORS["floor"])
            if room.type in ("bedroom", "master_bedroom"):
                room_color = [230, 245, 235, 255]
            elif room.type in ("living_room", "dining"):
                room_color = [254, 243, 199, 255]
            elif room.type == "kitchen":
                room_color = [255, 237, 213, 255]
            elif room.type == "bathroom":
                room_color = [224, 242, 254, 255]
            elif room.type == "balcony":
                room_color = COLORS["balcony"]

            rf_mesh = build_box_mesh(
                extents=(rw - 0.04, 0.005, rh - 0.04),
                center=(r3d_x, 0.003, r3d_z),
                color=room_color,
                name=f"room_{room.id}_finish",
            )
            node_id = f"room_finish_{idx:03d}_{room.type}"
            scene.add_geometry(rf_mesh, node_name=node_id, geom_name=node_id)

        # ─── 3. Match Doors & Windows to Wall Segments ────────────────────────
        # Slices walls into posts, headers (lintels), and sills
        wall_openings: Dict[int, List[Dict[str, Any]]] = {i: [] for i in range(len(data.walls))}

        # Process Doors
        for door in data.doors:
            dw = float(door.width) if door.width > 0 else 0.90
            best_idx = None
            min_dist = self.config.door_projection_tolerance
            best_t = 0.0
            best_proj = (door.x, door.y)

            for w_idx, w in enumerate(data.walls):
                px, py, dist, t = point_to_segment_projection(
                    door.x, door.y, w.start_x, w.start_y, w.end_x, w.end_y
                )
                if dist < min_dist:
                    min_dist = dist
                    best_idx = w_idx
                    best_t = t
                    best_proj = (px, py)

            if best_idx is not None:
                wall_openings[best_idx].append({
                    "type": "door",
                    "id": door.id,
                    "t": best_t,
                    "proj": best_proj,
                    "width": dw,
                    "clear_height": self.config.default_door_height,
                })
            else:
                msg = f"Door '{door.id}' at ({door.x:.2f}, {door.y:.2f}) cannot be mapped to any wall within {self.config.door_projection_tolerance}m tolerance"
                logger.warning(msg)
                warnings.append(msg)

        # Process Windows
        for win in data.windows:
            ww = float(win.width) if win.width > 0 else 1.20
            best_idx = None
            min_dist = self.config.window_projection_tolerance
            best_t = 0.0
            best_proj = (win.x, win.y)

            for w_idx, w in enumerate(data.walls):
                px, py, dist, t = point_to_segment_projection(
                    win.x, win.y, w.start_x, w.start_y, w.end_x, w.end_y
                )
                if dist < min_dist:
                    min_dist = dist
                    best_idx = w_idx
                    best_t = t
                    best_proj = (px, py)

            if best_idx is not None:
                wall_openings[best_idx].append({
                    "type": "window",
                    "id": win.id,
                    "t": best_t,
                    "proj": best_proj,
                    "width": ww,
                    "sill_height": self.config.default_window_sill_height,
                    "window_height": self.config.default_window_height,
                })
            else:
                msg = f"Window '{win.id}' at ({win.x:.2f}, {win.y:.2f}) cannot be mapped to any wall within {self.config.window_projection_tolerance}m tolerance"
                logger.warning(msg)
                warnings.append(msg)

        # ─── 4. Construct Walls with Opening Slicing ──────────────────────────
        wall_height = self.config.default_wall_height

        for w_idx, wall in enumerate(data.walls):
            w_start = (float(wall.start_x), float(wall.start_y))
            w_end = (float(wall.end_x), float(wall.end_y))
            w_len = math.hypot(w_end[0] - w_start[0], w_end[1] - w_start[1])
            if w_len < 0.05:
                continue

            thickness = float(wall.thickness) if wall.thickness > 0 else self.config.default_wall_thickness
            is_ext = thickness >= 0.18
            wall_color = COLORS["wall_exterior"] if is_ext else COLORS["wall_interior"]

            openings = wall_openings[w_idx]
            if not openings:
                # Solid wall without openings
                mesh = build_wall_segment(
                    w_start, w_end, 0.0, wall_height, thickness, cx, cz, wall_color, f"wall_{wall.id}"
                )
                if mesh:
                    node_id = f"wall_{w_idx:03d}_{wall.id}"
                    scene.add_geometry(mesh, node_name=node_id, geom_name=node_id)
                continue

            # Sort openings along wall by t parameter
            openings.sort(key=lambda o: o["t"])

            # Filter out overlapping openings along the same wall
            non_overlapping_ops: List[Dict[str, Any]] = []
            for op in openings:
                op_c = op["t"] * w_len
                op_hw = op["width"] / 2.0
                st = max(0.0, op_c - op_hw)
                en = min(w_len, op_c + op_hw)
                if not non_overlapping_ops:
                    non_overlapping_ops.append(op)
                else:
                    prev_c = non_overlapping_ops[-1]["t"] * w_len
                    prev_hw = non_overlapping_ops[-1]["width"] / 2.0
                    prev_en = min(w_len, prev_c + prev_hw)
                    # If start is beyond previous end minus 0.15m tolerance, keep it
                    if st >= prev_en - 0.15:
                        non_overlapping_ops.append(op)
                    else:
                        logger.debug(f"Skipping overlapping opening {op['id']} on wall {wall.id}")

            openings = non_overlapping_ops

            # Slice the wall along its length
            dx = (w_end[0] - w_start[0]) / w_len
            dy = (w_end[1] - w_start[1]) / w_len

            cur_dist = 0.0

            for op_idx, op in enumerate(openings):
                op_center_dist = op["t"] * w_len
                op_half_w = op["width"] / 2.0
                op_start_dist = max(cur_dist, min(w_len, op_center_dist - op_half_w))
                op_end_dist = min(w_len, max(op_start_dist + 0.10, op_center_dist + op_half_w))

                # 4a. Solid post before opening
                if op_start_dist > cur_dist + 0.04:
                    seg_start = (w_start[0] + dx * cur_dist, w_start[1] + dy * cur_dist)
                    seg_end = (w_start[0] + dx * op_start_dist, w_start[1] + dy * op_start_dist)
                    post = build_wall_segment(
                        seg_start, seg_end, 0.0, wall_height, thickness, cx, cz, wall_color, f"post_{wall.id}_{op_idx}"
                    )
                    if post:
                        node_id = f"wall_post_{w_idx:03d}_{op_idx:02d}"
                        scene.add_geometry(post, node_name=node_id, geom_name=node_id)

                op_seg_start = (w_start[0] + dx * op_start_dist, w_start[1] + dy * op_start_dist)
                op_seg_end = (w_start[0] + dx * op_end_dist, w_start[1] + dy * op_end_dist)

                if op["type"] == "door":
                    # 4b. Door lintel header above door clear height
                    clear_h = min(wall_height - 0.20, op["clear_height"])
                    lintel_h = wall_height - clear_h
                    if lintel_h > 0.05:
                        lintel = build_wall_segment(
                            op_seg_start, op_seg_end, clear_h, lintel_h, thickness, cx, cz,
                            COLORS["wall_lintel"], f"door_lintel_{op['id']}"
                        )
                        if lintel:
                            node_id = f"lintel_door_{w_idx:03d}_{op['id']}"
                            scene.add_geometry(lintel, node_name=node_id, geom_name=node_id)

                    # 4c. Door threshold / frame
                    mid_door_bp = ((op_seg_start[0] + op_seg_end[0]) / 2.0, (op_seg_start[1] + op_seg_end[1]) / 2.0)
                    d3_x, d3_z = blueprint_to_3d(mid_door_bp[0], mid_door_bp[1], cx, cz)
                    door_angle = math.atan2(-dy, dx)
                    threshold = build_box_mesh(
                        extents=(op["width"], 0.02, thickness),
                        center=(d3_x, 0.01, d3_z),
                        rotation_y=door_angle,
                        color=COLORS["door_frame"],
                        name=f"threshold_{op['id']}",
                    )
                    scene.add_geometry(threshold, node_name=f"door_threshold_{op['id']}", geom_name=f"door_threshold_{op['id']}")

                    # 4d. Architectural open door leaf (optional)
                    if self.config.enable_door_leaves:
                        leaf_h = clear_h - 0.05
                        leaf_w = op["width"] - 0.04
                        leaf_th = 0.035
                        # Hinge at one side of opening
                        hinge_bp_x = op_seg_start[0]
                        hinge_bp_y = op_seg_start[1]
                        h3_x, h3_z = blueprint_to_3d(hinge_bp_x, hinge_bp_y, cx, cz)
                        open_rot = door_angle + math.radians(55)
                        # Leaf center relative to hinge
                        leaf_center_x = h3_x + (leaf_w / 2.0) * math.cos(open_rot)
                        leaf_center_z = h3_z - (leaf_w / 2.0) * math.sin(open_rot)
                        door_leaf = build_box_mesh(
                            extents=(leaf_w, leaf_h, leaf_th),
                            center=(leaf_center_x, leaf_h / 2.0 + 0.02, leaf_center_z),
                            rotation_y=open_rot,
                            color=COLORS["door_leaf"],
                            name=f"door_leaf_{op['id']}",
                        )
                        scene.add_geometry(door_leaf, node_name=f"door_leaf_{op['id']}", geom_name=f"door_leaf_{op['id']}")

                elif op["type"] == "window":
                    sill_h = op["sill_height"]
                    win_h = op["window_height"]
                    header_y = sill_h + win_h
                    header_h = max(0.0, wall_height - header_y)

                    # 4d. Wall sill below window
                    if sill_h > 0.05:
                        sill = build_wall_segment(
                            op_seg_start, op_seg_end, 0.0, sill_h, thickness, cx, cz,
                            wall_color, f"window_sill_wall_{op['id']}"
                        )
                        if sill:
                            node_id = f"sill_wall_{w_idx:03d}_{op['id']}"
                            scene.add_geometry(sill, node_name=node_id, geom_name=node_id)

                    # 4e. Lintel header above window
                    if header_h > 0.05:
                        lintel = build_wall_segment(
                            op_seg_start, op_seg_end, header_y, header_h, thickness, cx, cz,
                            COLORS["wall_lintel"], f"win_lintel_{op['id']}"
                        )
                        if lintel:
                            node_id = f"lintel_win_{w_idx:03d}_{op['id']}"
                            scene.add_geometry(lintel, node_name=node_id, geom_name=node_id)

                    # 4f. Glass pane
                    mid_win_bp = ((op_seg_start[0] + op_seg_end[0]) / 2.0, (op_seg_start[1] + op_seg_end[1]) / 2.0)
                    w3_x, w3_z = blueprint_to_3d(mid_win_bp[0], mid_win_bp[1], cx, cz)
                    win_angle = math.atan2(-dy, dx)
                    glass = build_box_mesh(
                        extents=(op["width"] - 0.05, win_h - 0.05, 0.02),
                        center=(w3_x, sill_h + win_h / 2.0, w3_z),
                        rotation_y=win_angle,
                        color=COLORS["glass"],
                        name=f"glass_{op['id']}",
                    )
                    scene.add_geometry(glass, node_name=f"glass_pane_{op['id']}", geom_name=f"glass_pane_{op['id']}")

                cur_dist = op_end_dist

            # Final post to end of wall
            if cur_dist < w_len - 0.04:
                seg_start = (w_start[0] + dx * cur_dist, w_start[1] + dy * cur_dist)
                seg_end = w_end
                post = build_wall_segment(
                    seg_start, seg_end, 0.0, wall_height, thickness, cx, cz, wall_color, f"post_{wall.id}_final"
                )
                if post:
                    node_id = f"wall_post_{w_idx:03d}_final"
                    scene.add_geometry(post, node_name=node_id, geom_name=node_id)

        # ─── 5. Balconies with Railings ───────────────────────────────────────
        for idx, bal in enumerate(data.balconies, 1):
            bw = float(bal.width)
            bh = float(bal.height)
            if bw < 0.3 or bh < 0.3:
                continue
            bx_mid = float(bal.x) + bw / 2.0
            by_mid = float(bal.y) + bh / 2.0
            b3_x, b3_z = blueprint_to_3d(bx_mid, by_mid, cx, cz)

            # Low perimeter protective railing (height 1.05m)
            rail_h = 1.05
            rail_thick = 0.04
            railing = build_box_mesh(
                extents=(bw, rail_h, rail_thick),
                center=(b3_x, rail_h / 2.0, b3_z - bh / 2.0),
                color=COLORS["window_frame"],
                name=f"balcony_railing_{idx}",
            )
            node_id = f"balcony_rail_{idx:02d}"
            scene.add_geometry(railing, node_name=node_id, geom_name=node_id)

        # ─── 6. Procedural House Furnishing within Verified Room Bounds ───────
        if self.config.enable_furniture:
            for idx, r in enumerate(data.rooms, 1):
                rw = float(r.width)
                rh = float(r.height)
                rx_center = float(r.x) + rw / 2.0
                ry_center = float(r.y) + rh / 2.0
                r3d_x, r3d_z = blueprint_to_3d(rx_center, ry_center, cx, cz)

                if r.type in ("bedroom", "master_bedroom") and rw >= 1.8 and rh >= 1.8:
                    bed_w = min(1.8, rw - 0.40)
                    bed_l = min(2.0, rh - 0.40)
                    bed = create_procedural_bed((r3d_x, 0.0, r3d_z), width_m=bed_w, length_m=bed_l)
                    node_id = f"furniture_bed_{idx:02d}"
                    scene.add_geometry(bed, node_name=node_id, geom_name=node_id)

                elif r.type in ("living_room", "lounge") and rw >= 2.0 and rh >= 2.0:
                    sofa_w = min(2.0, rw - 0.60)
                    sofa = create_procedural_sofa((r3d_x, 0.0, r3d_z), width_m=sofa_w)
                    node_id = f"furniture_sofa_{idx:02d}"
                    scene.add_geometry(sofa, node_name=node_id, geom_name=node_id)

                elif r.type in ("dining", "dining_room") and rw >= 1.6 and rh >= 1.4:
                    tbl_l = min(1.4, rw - 0.40)
                    tbl_w = min(0.85, rh - 0.40)
                    table = create_procedural_dining_table((r3d_x, 0.0, r3d_z), length_m=tbl_l, width_m=tbl_w)
                    node_id = f"furniture_dining_{idx:02d}"
                    scene.add_geometry(table, node_name=node_id, geom_name=node_id)

                elif r.type in ("kitchen", "kitchenette") and rw >= 1.2 and rh >= 1.2:
                    k_w = min(1.5, rw - 0.20)
                    counter = create_procedural_kitchen_counter((r3d_x, 0.0, r3d_z), width_m=k_w)
                    node_id = f"furniture_kitchen_{idx:02d}"
                    scene.add_geometry(counter, node_name=node_id, geom_name=node_id)

                elif r.type in ("bathroom", "toilet", "powder_room") and rw >= 1.0 and rh >= 0.8:
                    bath = create_procedural_bathroom_fixtures((r3d_x, 0.0, r3d_z))
                    node_id = f"furniture_bathroom_{idx:02d}"
                    scene.add_geometry(bath, node_name=node_id, geom_name=node_id)

        return scene, warnings

    def export_glb_bytes(
        self,
        analysis: Union[BlueprintAnalysisResult, Dict[str, Any]],
    ) -> Tuple[bytes, List[str]]:
        """Exports scene directly to GLB binary bytes."""
        scene, warnings = self.generate_scene(analysis)
        glb_data = scene.export(file_type="glb")
        if isinstance(glb_data, str):
            glb_data = glb_data.encode("utf-8")
        return glb_data, warnings

    def export_glb_file(
        self,
        analysis: Union[BlueprintAnalysisResult, Dict[str, Any]],
        output_path: Union[str, Path],
    ) -> List[str]:
        """Exports scene directly to a .glb file on disk."""
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        glb_bytes, warnings = self.export_glb_bytes(analysis)
        path.write_bytes(glb_bytes)
        return warnings
