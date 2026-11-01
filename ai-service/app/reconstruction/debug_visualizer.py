"""
Debug Visualizer module (Phase 19).
Generates the mandatory Blueprint Overlay showing:
ORIGINAL BLUEPRINT + FINAL WALL CENTERLINES + NODES.
"""
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import cv2
import numpy as np

from app.reconstruction.shapely_normalizer import NormalizedWall, Node
from app.reconstruction.region_detector import CropTransform


class DebugVisualizer:
    """Generates visual debug overlay of the final architectural geometry on the blueprint."""

    @classmethod
    def generate_final_overlay(
        cls,
        cropped_bgr: np.ndarray,
        walls: List[NormalizedWall],
        nodes: Dict[str, Node],
        canvas_w_m: float,
        canvas_h_m: float,
        debug_dir: Path,
        alpha: float = 0.85,
        doors=None,
        windows=None,
        rooms=None,
    ) -> Path:
        """
        Draws final wall centerlines and nodes directly over the cropped blueprint image.
        Saves 10_final_overlay.png in debug_dir.
        """
        h, w = cropped_bgr.shape[:2]
        overlay = cropped_bgr.copy()

        # Conversion: metres -> cropped pixel coordinates
        def m_to_px(mx: float, my: float) -> Tuple[int, int]:
            px = int(round((mx / max(0.1, canvas_w_m)) * w))
            py = int(round((my / max(0.1, canvas_h_m)) * h))
            return max(0, min(w - 1, px)), max(0, min(h - 1, py))

        # 1. Draw wall centerlines
        for wall in walls:
            p1 = m_to_px(wall.start[0], wall.start[1])
            p2 = m_to_px(wall.end[0], wall.end[1])
            
            # Exterior: Bright Cyan/Green, Interior: Vibrant Amber/Orange
            if wall.wall_type == "EXTERNAL":
                color = (255, 200, 0)  # BGR Cyan/Blue
                thickness = 3
            else:
                color = (0, 140, 255)  # BGR Orange
                thickness = 2

            cv2.line(overlay, p1, p2, color, thickness, cv2.LINE_AA)

        # 2. Draw junction nodes
        for nid, node in nodes.items():
            np_pt = m_to_px(node.x, node.y)
            cv2.circle(overlay, np_pt, 4, (0, 0, 255), -1, cv2.LINE_AA)  # Red node dot
            cv2.circle(overlay, np_pt, 5, (255, 255, 255), 1, cv2.LINE_AA)

        # 3. Doors / windows (raster pipeline) and room labels
        for d in (doors or []):
            cv2.circle(overlay, m_to_px(d.x, d.y), 6, (0, 200, 0), -1, cv2.LINE_AA)
        for wi in (windows or []):
            cv2.circle(overlay, m_to_px(wi.x, wi.y), 6, (255, 140, 0), -1, cv2.LINE_AA)
        for r in (rooms or []):
            cx, cy = m_to_px(r.x + r.width / 2.0, r.y + r.height / 2.0)
            cv2.putText(overlay, f"{r.name} {int(r.area_sqft or 0)}sqft", (cx - 30, cy + 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (160, 0, 160), 1, cv2.LINE_AA)

        # Blend with original image
        blended = cv2.addWeighted(overlay, alpha, cropped_bgr, 1.0 - alpha, 0)

        # Add watermark / legend banner at top
        banner_h = 32
        banner = np.full((banner_h, w, 3), 20, dtype=np.uint8)
        legend_text = f"THE PLINTH RECONSTRUCTION OVERLAY  |  Walls: {len(walls)}  |  Nodes: {len(nodes)}"
        cv2.putText(banner, legend_text, (15, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 255), 1, cv2.LINE_AA)
        final_img = np.vstack([banner, blended])

        debug_dir.mkdir(parents=True, exist_ok=True)
        out_path = debug_dir / "10_final_overlay.png"
        cv2.imwrite(str(out_path), final_img)
        return out_path
