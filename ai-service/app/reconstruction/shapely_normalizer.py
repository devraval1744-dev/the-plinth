"""
Computational Geometry & Shapely Normalization module (Phase 10, 11 & 12).
Converts raw fused candidates into a planar, noded wall graph:
- Removes duplicate segments
- Merges collinear overlaps
- Snaps endpoints within adaptive tolerance
- Nodes the line network and splits lines at T-junctions
- Merges degree-2 collinear segments into continuous walls
- Classifies and resolves intersections
"""
from dataclasses import dataclass, field
import math
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional

import cv2
import numpy as np
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import unary_union, linemerge

from app.reconstruction.geometry_fusion import FusedWallCandidate
from app.reconstruction.region_detector import CropTransform


@dataclass
class Node:
    id: str
    x: float
    y: float


@dataclass
class WallEdge:
    id: str
    node_a: str
    node_b: str
    wall_type: str
    thickness: float
    confidence: float
    source: str


@dataclass
class NormalizedWall:
    id: str
    start: Tuple[float, float]
    end: Tuple[float, float]
    wall_type: str
    thickness: float
    confidence: float
    source: str


import networkx as nx

@dataclass
class NormalizationReport:
    raw_count: int
    duplicates_removed: int
    collinear_merged: int
    endpoints_snapped: int
    t_junctions_split: int
    crossings_resolved: int
    final_count: int
    confidence: float
    needs_review: bool
    connected_components: int = 1
    dangling_endpoints: int = 0
    t_junctions: int = 0
    intersections: int = 0


class ShapelyNormalizer:
    """Normalizes wall geometry into a planar, watertight line graph using Shapely."""

    @classmethod
    def normalize(
        cls,
        fused_walls: List[FusedWallCandidate],
        transform: CropTransform,
        canvas_w_m: float,
        canvas_h_m: float,
        debug_dir: Optional[Path] = None,
    ) -> Tuple[List[NormalizedWall], Dict[str, Node], List[WallEdge], NormalizationReport]:
        raw_count = len(fused_walls)
        if raw_count == 0:
            rep = NormalizationReport(0, 0, 0, 0, 0, 0, 0, 0.0, True)
            return [], {}, [], rep

        # Conversion helper: normalized [0, 1] to metres
        def to_m(nx: float, ny: float) -> Tuple[float, float]:
            return (round(nx * canvas_w_m, 3), round(ny * canvas_h_m, 3))

        # 1. Convert to initial Shapely LineStrings in metres and pre-axis snap
        raw_lines: List[Dict[str, Any]] = []
        for w in fused_walls:
            p1 = to_m(w.start[0], w.start[1])
            p2 = to_m(w.end[0], w.end[1])
            p1, p2 = cls._final_axis_snap(p1, p2)
            length = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            if length > 0.15:  # reject < 15cm noise
                raw_lines.append({
                    "id": w.id,
                    "geom": LineString([p1, p2]),
                    "type": w.wall_type,
                    "thickness": w.thickness_m,
                    "confidence": w.confidence,
                    "source": w.source,
                })

        # 2. Merge Collinear Overlapping / Adjacent segments (gap_tol=0.85 bridges doorway gaps)
        collinear_merged_count = 0
        merged_lines, merged_count = cls._merge_collinear_segments(raw_lines, dist_tol=0.25, gap_tol=0.85)
        collinear_merged_count += merged_count

        # 3. Snap nearby endpoints within adaptive tolerance
        adaptive_snap_tol = max(0.18, min(0.35, raw_lines[0]["thickness"] * 1.8 if raw_lines else 0.25))
        snapped_lines, snapped_count = cls._snap_endpoints(merged_lines, snap_tol=adaptive_snap_tol)

        # 4. Ray-Casting T-Junction Extension:
        # Cast orthogonal rays from dangling endpoints to meet perpendicular/adjacent walls
        extended_lines = cls._extend_to_t_junctions(snapped_lines, max_ray_len=0.75)

        # 5. Node the Network & Split at T-Junctions / Crossings
        # unary_union on LineStrings splits all intersecting lines at exact shared vertices
        line_geoms = [item["geom"] for item in extended_lines]
        noded_multiline = unary_union(line_geoms)

        # Decompose MultiLineString / GeometryCollection into individual segments
        noded_segments: List[LineString] = []
        if noded_multiline.geom_type == "LineString":
            noded_segments.append(noded_multiline)
        elif hasattr(noded_multiline, "geoms"):
            for g in noded_multiline.geoms:
                if g.geom_type == "LineString" and g.length > 0.08:
                    noded_segments.append(g)

        # 6. Collinear Degree-2 Merging (re-merge fragments that were over-split across non-junctions)
        continuous_lines = cls._merge_degree2_collinear(noded_segments, angle_tol_deg=4.0)

        # 7. Build Planar Graph (Nodes & WallEdges) with exact shared vertex coordinates
        nodes: Dict[str, Node] = {}
        node_lookup: Dict[Tuple[float, float], str] = {}
        wall_edges: List[WallEdge] = []
        normalized_walls: List[NormalizedWall] = []

        def get_or_create_node(pt: Tuple[float, float]) -> str:
            key = (round(pt[0], 3), round(pt[1], 3))
            if key not in node_lookup:
                nid = f"n{len(nodes) + 1}"
                nodes[nid] = Node(id=nid, x=key[0], y=key[1])
                node_lookup[key] = nid
            return node_lookup[key]

        wid = 1
        for line in continuous_lines:
            coords = list(line.coords)
            if len(coords) < 2:
                continue
            start_pt = coords[0]
            end_pt = coords[-1]

            p1 = (round(start_pt[0], 3), round(start_pt[1], 3))
            p2 = (round(end_pt[0], 3), round(end_pt[1], 3))
            seg_len = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            if seg_len < 0.10:
                continue

            node_a = get_or_create_node(p1)
            node_b = get_or_create_node(p2)
            if node_a == node_b:
                continue

            # Check if exterior by distance to canvas boundary
            is_ext = (
                min(p1[0], p2[0]) <= 0.40 or max(p1[0], p2[0]) >= canvas_w_m - 0.40 or
                min(p1[1], p2[1]) <= 0.40 or max(p1[1], p2[1]) >= canvas_h_m - 0.40
            )
            w_type = "EXTERNAL" if is_ext else "INTERNAL"
            thickness = 0.20 if is_ext else 0.12

            wall_id = f"w{wid}"
            wall_edges.append(WallEdge(
                id=wall_id,
                node_a=node_a,
                node_b=node_b,
                wall_type=w_type,
                thickness=thickness,
                confidence=0.92,
                source="FUSED",
            ))
            normalized_walls.append(NormalizedWall(
                id=wall_id,
                start=p1,
                end=p2,
                wall_type=w_type,
                thickness=thickness,
                confidence=0.92,
                source="FUSED",
            ))
            wid += 1

        # 8. Topology Graph Validation using NetworkX
        topo_g = nx.Graph()
        for w in normalized_walls:
            topo_g.add_edge(w.start, w.end)

        conn_comps = nx.number_connected_components(topo_g) if topo_g.number_of_nodes() > 0 else 0
        degrees = dict(topo_g.degree()) if topo_g.number_of_nodes() > 0 else {}
        dangling_count = sum(1 for d in degrees.values() if d == 1)
        t_junc_count = sum(1 for d in degrees.values() if d == 3)
        x_inter_count = sum(1 for d in degrees.values() if d >= 4)

        # 9. Quality and Confidence Score
        confidence = 0.94 if len(normalized_walls) >= 6 else (0.75 if len(normalized_walls) >= 3 else 0.40)
        needs_review = len(normalized_walls) < 4 or confidence < 0.60

        report = NormalizationReport(
            raw_count=raw_count,
            duplicates_removed=max(0, raw_count - len(snapped_lines)),
            collinear_merged=collinear_merged_count,
            endpoints_snapped=snapped_count,
            t_junctions_split=t_junc_count,
            crossings_resolved=x_inter_count,
            final_count=len(normalized_walls),
            confidence=confidence,
            needs_review=needs_review,
            connected_components=conn_comps,
            dangling_endpoints=dangling_count,
            t_junctions=t_junc_count,
            intersections=x_inter_count,
        )

        # 10. Save debug artifact 08_normalized_graph.png
        if debug_dir:
            cls._save_debug_graph(normalized_walls, nodes, canvas_w_m, canvas_h_m, debug_dir)

        return normalized_walls, nodes, wall_edges, report

    @classmethod
    def _merge_collinear_segments(
        cls, lines: List[Dict[str, Any]], dist_tol: float = 0.18, gap_tol: float = 0.35
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Merge collinear overlapping or nearly touching segments."""
        merged = []
        used = set()
        count = 0

        for i in range(len(lines)):
            if i in used:
                continue
            item1 = lines[i]
            geom1 = item1["geom"]
            p1a, p1b = list(geom1.coords)
            dx1, dy1 = p1b[0] - p1a[0], p1b[1] - p1a[1]
            is_h = abs(dy1) <= abs(dx1) * 0.1
            is_v = abs(dx1) <= abs(dy1) * 0.1

            curr_geom = geom1
            for j in range(i + 1, len(lines)):
                if j in used:
                    continue
                item2 = lines[j]
                geom2 = item2["geom"]
                p2a, p2b = list(geom2.coords)
                dx2, dy2 = p2b[0] - p2a[0], p2b[1] - p2a[1]

                if is_h and abs(dy2) <= abs(dx2) * 0.1:
                    avg_y1 = (p1a[1] + p1b[1]) / 2.0
                    avg_y2 = (p2a[1] + p2b[1]) / 2.0
                    if abs(avg_y1 - avg_y2) <= dist_tol:
                        # Overlap or close along x
                        x1_min, x1_max = min(p1a[0], p1b[0]), max(p1a[0], p1b[0])
                        x2_min, x2_max = min(p2a[0], p2b[0]), max(p2a[0], p2b[0])
                        if x2_min <= x1_max + gap_tol and x1_min <= x2_max + gap_tol:
                            # Merge!
                            new_x_min = min(x1_min, x2_min)
                            new_x_max = max(x1_max, x2_max)
                            new_y = (avg_y1 + avg_y2) / 2.0
                            curr_geom = LineString([(new_x_min, new_y), (new_x_max, new_y)])
                            p1a, p1b = list(curr_geom.coords)
                            used.add(j)
                            count += 1

                elif is_v and abs(dx2) <= abs(dy2) * 0.1:
                    avg_x1 = (p1a[0] + p1b[0]) / 2.0
                    avg_x2 = (p2a[0] + p2b[0]) / 2.0
                    if abs(avg_x1 - avg_x2) <= dist_tol:
                        y1_min, y1_max = min(p1a[1], p1b[1]), max(p1a[1], p1b[1])
                        y2_min, y2_max = min(p2a[1], p2b[1]), max(p2a[1], p2b[1])
                        if y2_min <= y1_max + gap_tol and y1_min <= y2_max + gap_tol:
                            new_y_min = min(y1_min, y2_min)
                            new_y_max = max(y1_max, y2_max)
                            new_x = (avg_x1 + avg_x2) / 2.0
                            curr_geom = LineString([(new_x, new_y_min), (new_x, new_y_max)])
                            p1a, p1b = list(curr_geom.coords)
                            used.add(j)
                            count += 1

            merged.append({
                "id": item1["id"],
                "geom": curr_geom,
                "type": item1["type"],
                "thickness": item1["thickness"],
                "confidence": item1["confidence"],
                "source": item1["source"],
            })
            used.add(i)

        return merged, count

    @classmethod
    def _snap_endpoints(cls, lines: List[Dict[str, Any]], snap_tol: float = 0.20) -> Tuple[List[Dict[str, Any]], int]:
        """Snap endpoints of lines that are within snap_tol to a single vertex."""
        pts = []
        for l in lines:
            c = list(l["geom"].coords)
            pts.append(list(c[0]))
            pts.append(list(c[1]))

        # Cluster nearby points
        snapped_count = 0
        n_pts = len(pts)
        for i in range(n_pts):
            for j in range(i + 1, n_pts):
                d = math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
                if 0.001 < d <= snap_tol:
                    mid_x = round((pts[i][0] + pts[j][0]) / 2.0, 3)
                    mid_y = round((pts[i][1] + pts[j][1]) / 2.0, 3)
                    pts[i] = [mid_x, mid_y]
                    pts[j] = [mid_x, mid_y]
                    snapped_count += 1

        # Rebuild lines with snapped endpoints
        snapped_lines = []
        for idx, l in enumerate(lines):
            p1 = pts[idx * 2]
            p2 = pts[idx * 2 + 1]
            if math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > 0.05:
                snapped_lines.append({
                    "id": l["id"],
                    "geom": LineString([p1, p2]),
                    "type": l["type"],
                    "thickness": l["thickness"],
                    "confidence": l["confidence"],
                    "source": l["source"],
                })
        return snapped_lines, snapped_count

    @classmethod
    def _extend_to_t_junctions(
        cls, lines: List[Dict[str, Any]], max_ray_len: float = 0.75
    ) -> List[Dict[str, Any]]:
        """
        Extends dangling endpoints along their axial orientation to intersect
        perpendicular or adjacent walls, establishing watertight T-junctions.
        """
        extended: List[Dict[str, Any]] = []
        raw_geoms = [item["geom"] for item in lines]

        for idx, item in enumerate(lines):
            line = item["geom"]
            coords = list(line.coords)
            p_start, p_end = coords[0], coords[-1]
            dx, dy = p_end[0] - p_start[0], p_end[1] - p_start[1]
            length = math.hypot(dx, dy)
            if length < 0.10:
                continue

            ux, uy = dx / length, dy / length

            # 1. Cast ray backwards from start endpoint
            ext_start = p_start
            ray_start = LineString([p_start, (p_start[0] - max_ray_len * ux, p_start[1] - max_ray_len * uy)])
            closest_dist = 999.0
            for j, other in enumerate(raw_geoms):
                if j == idx:
                    continue
                if ray_start.intersects(other):
                    inter = ray_start.intersection(other)
                    pts = [inter] if inter.geom_type == "Point" else (list(inter.geoms) if hasattr(inter, "geoms") else [])
                    for pt in pts:
                        if pt.geom_type == "Point":
                            d = math.hypot(pt.x - p_start[0], pt.y - p_start[1])
                            if 0.02 < d < closest_dist:
                                closest_dist = d
                                ext_start = (round(pt.x, 3), round(pt.y, 3))

            # 2. Cast ray forwards from end endpoint
            ext_end = p_end
            ray_end = LineString([p_end, (p_end[0] + max_ray_len * ux, p_end[1] + max_ray_len * uy)])
            closest_dist = 999.0
            for j, other in enumerate(raw_geoms):
                if j == idx:
                    continue
                if ray_end.intersects(other):
                    inter = ray_end.intersection(other)
                    pts = [inter] if inter.geom_type == "Point" else (list(inter.geoms) if hasattr(inter, "geoms") else [])
                    for pt in pts:
                        if pt.geom_type == "Point":
                            d = math.hypot(pt.x - p_end[0], pt.y - p_end[1])
                            if 0.02 < d < closest_dist:
                                closest_dist = d
                                ext_end = (round(pt.x, 3), round(pt.y, 3))

            extended.append({
                "id": item["id"],
                "geom": LineString([ext_start, ext_end]),
                "type": item["type"],
                "thickness": item["thickness"],
                "confidence": item["confidence"],
                "source": item["source"],
            })

        return extended

    @classmethod
    def _merge_degree2_collinear(cls, segments: List[LineString], angle_tol_deg: float = 6.0) -> List[LineString]:
        """Re-merge contiguous segments meeting at a degree-2 node ONLY if collinear and degree == 2."""
        # Deconstruct any multi-point lines into straight 2-point segments
        flat_segments: List[LineString] = []
        for s in segments:
            coords = list(s.coords)
            for k in range(len(coords) - 1):
                p_a, p_b = coords[k], coords[k + 1]
                if math.hypot(p_b[0] - p_a[0], p_b[1] - p_a[1]) > 0.05:
                    flat_segments.append(LineString([p_a, p_b]))

        # Count vertex degrees to identify T-junctions vs degree-2 collinear splits
        vertex_degrees: Dict[Tuple[float, float], int] = {}
        for s in flat_segments:
            p1, p2 = s.coords[0], s.coords[1]
            k1 = (round(p1[0], 3), round(p1[1], 3))
            k2 = (round(p2[0], 3), round(p2[1], 3))
            vertex_degrees[k1] = vertex_degrees.get(k1, 0) + 1
            vertex_degrees[k2] = vertex_degrees.get(k2, 0) + 1

        def is_deg2(pt: Tuple[float, float]) -> bool:
            k = (round(pt[0], 3), round(pt[1], 3))
            return vertex_degrees.get(k, 0) == 2

        # Group and merge only if collinear and sharing a degree-2 endpoint
        merged_lines: List[LineString] = []
        used = set()

        for i, s1 in enumerate(flat_segments):
            if i in used:
                continue
            coords1 = list(s1.coords)
            p1_start, p1_end = coords1[0], coords1[1]
            dx1, dy1 = p1_end[0] - p1_start[0], p1_end[1] - p1_start[1]
            len1 = math.hypot(dx1, dy1)
            if len1 < 0.05:
                continue
            angle1 = math.atan2(dy1, dx1) % math.pi

            curr_start = p1_start
            curr_end = p1_end

            extended = True
            while extended:
                extended = False
                for j, s2 in enumerate(flat_segments):
                    if j in used or j == i:
                        continue
                    coords2 = list(s2.coords)
                    p2_start, p2_end = coords2[0], coords2[1]
                    dx2, dy2 = p2_end[0] - p2_start[0], p2_end[1] - p2_start[1]
                    len2 = math.hypot(dx2, dy2)
                    if len2 < 0.05:
                        continue
                    angle2 = math.atan2(dy2, dx2) % math.pi
                    ang_diff = abs(angle1 - angle2)
                    ang_diff = min(ang_diff, math.pi - ang_diff)
                    if ang_diff > math.radians(angle_tol_deg):
                        continue

                    tol = 0.05
                    # MUST only merge across a true degree-2 node (NOT a T-junction or crossing)
                    if is_deg2(curr_end) and math.hypot(curr_end[0] - p2_start[0], curr_end[1] - p2_start[1]) <= tol:
                        curr_end = p2_end
                        used.add(j)
                        extended = True
                        break
                    elif is_deg2(curr_end) and math.hypot(curr_end[0] - p2_end[0], curr_end[1] - p2_end[1]) <= tol:
                        curr_end = p2_start
                        used.add(j)
                        extended = True
                        break
                    elif is_deg2(curr_start) and math.hypot(curr_start[0] - p2_end[0], curr_start[1] - p2_end[1]) <= tol:
                        curr_start = p2_start
                        used.add(j)
                        extended = True
                        break
                    elif is_deg2(curr_start) and math.hypot(curr_start[0] - p2_start[0], curr_start[1] - p2_start[1]) <= tol:
                        curr_start = p2_end
                        used.add(j)
                        extended = True
                        break

            merged_lines.append(LineString([curr_start, curr_end]))
            used.add(i)

        return merged_lines

    @classmethod
    def _final_axis_snap(cls, p1: Tuple[float, float], p2: Tuple[float, float]) -> Tuple[Tuple[float, float], Tuple[float, float]]:
        """Snap small angular deviations (up to ~10 degrees) to exact horizontal/vertical coordinates."""
        dx = abs(p2[0] - p1[0])
        dy = abs(p2[1] - p1[1])
        if (dy < 0.18 or dy <= dx * 0.12) and dx > 0.20:
            avg_y = (p1[1] + p2[1]) / 2.0
            return (p1[0], avg_y), (p2[0], avg_y)
        if (dx < 0.18 or dx <= dy * 0.12) and dy > 0.20:
            avg_x = (p1[0] + p2[0]) / 2.0
            return (avg_x, p1[1]), (avg_x, p2[1])
        return p1, p2

    @classmethod
    def _save_debug_graph(
        cls, walls: List[NormalizedWall], nodes: Dict[str, Node], cw: float, ch: float, debug_dir: Path
    ) -> None:
        """Render 08_normalized_graph.png showing noded planar graph with junctions."""
        scale = 60  # px per metre
        img_w = int(cw * scale) + 40
        img_h = int(ch * scale) + 40
        canvas = np.full((img_h, img_w, 3), 255, dtype=np.uint8)

        # Draw walls
        for w in walls:
            x1 = int(w.start[0] * scale) + 20
            y1 = int(w.start[1] * scale) + 20
            x2 = int(w.end[0] * scale) + 20
            y2 = int(w.end[1] * scale) + 20
            color = (30, 30, 30) if w.wall_type == "EXTERNAL" else (120, 120, 120)
            thickness = 4 if w.wall_type == "EXTERNAL" else 2
            cv2.line(canvas, (x1, y1), (x2, y2), color, thickness)

        # Draw junction nodes
        for nid, n in nodes.items():
            nx = int(n.x * scale) + 20
            ny = int(n.y * scale) + 20
            cv2.circle(canvas, (nx, ny), 5, (0, 0, 230), -1)

        cv2.imwrite(str(debug_dir / "08_normalized_graph.png"), canvas)
