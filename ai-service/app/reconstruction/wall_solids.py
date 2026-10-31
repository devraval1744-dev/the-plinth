"""
Wall Solids module (Phase 13).
Computes a unified, non-overlapping 2D wall footprint polygon using Shapely.
Buffers wall centerlines by thickness/2 and computes unary_union.
Generates seamless 2D polygonal shapes for Three.js ExtrudeGeometry.
Eliminates rectangular wall overlaps, double-thickness corners, and z-fighting.
"""
from dataclasses import dataclass
from typing import List, Tuple, Dict, Any, Optional
from shapely.geometry import LineString, Polygon, MultiPolygon
from shapely.ops import unary_union

from app.reconstruction.shapely_normalizer import NormalizedWall


@dataclass
class WallPolygonFootprint:
    exterior: List[Tuple[float, float]]
    holes: List[List[Tuple[float, float]]]


class WallSolidGenerator:
    """Generates a clean 2D polygonal footprint of the unified wall network."""

    @classmethod
    def generate_footprint(
        cls,
        walls: List[NormalizedWall],
    ) -> Dict[str, Any]:
        """
        Takes wall centerlines and generates seamless 2D polygon footprint.
        Returns dict suitable for JSON serialization into SpatialAnalysis.
        """
        if not walls:
            return {"polygons": []}

        buffered_patches = []
        for w in walls:
            line = LineString([w.start, w.end])
            half_th = max(0.06, w.thickness / 2.0)
            # Buffer with flat caps so walls terminate precisely at their endpoints
            patch = line.buffer(half_th, cap_style='flat', join_style='mitre')
            if patch.is_valid and not patch.is_empty:
                buffered_patches.append(patch)

        if not buffered_patches:
            return {"polygons": []}

        # Union all patches into a seamless 2D boundary
        unioned = unary_union(buffered_patches)

        # Simplify very slightly to remove floating point collinear noise (1mm tol)
        unioned = unioned.simplify(0.005, preserve_topology=True)

        polys: List[Polygon] = []
        if unioned.geom_type == "Polygon":
            polys.append(unioned)
        elif hasattr(unioned, "geoms"):
            for g in unioned.geoms:
                if g.geom_type == "Polygon" and g.area > 0.05:
                    polys.append(g)

        result_polygons = []
        for p in polys:
            ext_coords = [(round(pt[0], 3), round(pt[1], 3)) for pt in p.exterior.coords]
            holes_coords = []
            for hole in p.interiors:
                holes_coords.append([(round(pt[0], 3), round(pt[1], 3)) for pt in hole.coords])

            result_polygons.append({
                "exterior": ext_coords,
                "holes": holes_coords,
            })

        return {"polygons": result_polygons}
