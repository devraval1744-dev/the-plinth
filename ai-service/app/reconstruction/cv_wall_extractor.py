"""
Computer-Vision Wall Extraction module (Phase 6).
Extracts true WALL CENTERLINES from pixel evidence (skeletonization, LSD, Hough lines, parallel pairing).
Filters out dimension lines, text underlines, door swing arcs, and furniture outlines.
"""
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple, Optional
import math

import cv2
import numpy as np
from skimage.morphology import skeletonize

from app.reconstruction.image_preprocessor import PreprocessedData


@dataclass
class CvWallCandidate:
    id: str
    start_pixel: Tuple[float, float]  # (x, y) in cropped image coordinates
    end_pixel: Tuple[float, float]    # (x, y) in cropped image coordinates
    orientation: str                 # "horizontal", "vertical", "diagonal"
    estimated_thickness: float       # thickness in pixels
    confidence: float                # 0.0 to 1.0
    evidence_type: str               # "skeleton_centerline", "parallel_pair", "lsd_wall"


class CvWallExtractor:
    """Extracts wall centerline candidates using multi-modal pixel evidence."""

    @classmethod
    def extract_candidates(
        cls,
        prep: PreprocessedData,
        debug_dir: Optional[Path] = None,
    ) -> List[CvWallCandidate]:
        h, w = prep.wall_mask.shape[:2]
        dim = max(h, w)
        min_line_len = max(20.0, dim * 0.02)
        base_thickness = prep.estimated_wall_thickness_px

        candidates: List[CvWallCandidate] = []
        cand_id = 1

        # ─── Method 1: Skeletonization Centerline Extraction ─────────────────
        # For filled or hatched walls, skeletonize produces the exact topological centerline
        bool_mask = prep.wall_mask > 0
        skel = skeletonize(bool_mask)
        skel_uint8 = (skel * 255).astype(np.uint8)

        # Detect line segments on the 1-pixel skeleton
        lsd = cv2.createLineSegmentDetector(0)
        lines_skel = lsd.detect(skel_uint8)[0]

        if lines_skel is not None:
            for l in lines_skel:
                coords = l.flatten()
                if len(coords) < 4:
                    continue
                x1, y1, x2, y2 = coords[:4]
                length = math.hypot(x2 - x1, y2 - y1)
                if length < min_line_len:
                    continue

                # Verify line lies mostly on wall mask
                if not cls._verify_line_on_mask(x1, y1, x2, y2, prep.wall_mask, min_ratio=0.70):
                    continue

                # Orthogonal snapping (standard architectural blueprints are 90-degree aligned)
                x1, y1, x2, y2, orient = cls._snap_orthogonal(x1, y1, x2, y2)
                
                # Estimate thickness from distance transform along this centerline
                th = cls._sample_thickness(x1, y1, x2, y2, prep.dist_transform, base_thickness)

                # Filter out thin lines (furniture outlines, stair treads, dimension lines, door arcs)
                min_wall_th = max(4.0, base_thickness * 0.40)
                if th < min_wall_th:
                    continue

                # Filter out full-length page borders running along image perimeter
                margin_x = int(w * 0.035)
                margin_y = int(h * 0.035)
                if orient == "horizontal" and (y1 <= margin_y or y1 >= h - margin_y) and abs(x2 - x1) >= w * 0.65:
                    continue
                if orient == "vertical" and (x1 <= margin_x or x1 >= w - margin_x) and abs(y2 - y1) >= h * 0.65:
                    continue

                candidates.append(CvWallCandidate(
                    id=f"cv_{cand_id}",
                    start_pixel=(round(float(x1), 2), round(float(y1), 2)),
                    end_pixel=(round(float(x2), 2), round(float(y2), 2)),
                    orientation=orient,
                    estimated_thickness=round(float(th), 2),
                    confidence=0.88,
                    evidence_type="skeleton_centerline",
                ))
                cand_id += 1

        # ─── Method 2: Boundary Line Pairing (for hollow/double-line walls) ───
        # Detect lines on edges
        lines_edges = cv2.HoughLinesP(
            prep.edges, 1, np.pi / 180, threshold=40,
            minLineLength=int(min_line_len), maxLineGap=int(base_thickness * 1.5)
        )

        if lines_edges is not None:
            raw_edge_segs = []
            for l in lines_edges:
                coords = l.flatten()
                if len(coords) < 4:
                    continue
                x1, y1, x2, y2 = coords[:4]
                # Filter out lines that don't border the wall mask
                if cls._verify_line_near_mask(x1, y1, x2, y2, prep.wall_mask, max_dist=int(base_thickness)):
                    sx1, sy1, sx2, sy2, o = cls._snap_orthogonal(x1, y1, x2, y2)
                    raw_edge_segs.append((sx1, sy1, sx2, sy2, o))

            # Pair parallel opposing lines within wall thickness distance
            paired = cls._pair_parallel_lines(raw_edge_segs, base_thickness)
            for (px1, py1, px2, py2, th, orient) in paired:
                length = math.hypot(px2 - px1, py2 - py1)
                if length >= min_line_len:
                    candidates.append(CvWallCandidate(
                        id=f"cv_{cand_id}",
                        start_pixel=(round(float(px1), 2), round(float(py1), 2)),
                        end_pixel=(round(float(px2), 2), round(float(py2), 2)),
                        orientation=orient,
                        estimated_thickness=round(float(th), 2),
                        confidence=0.82,
                        evidence_type="parallel_pair",
                    ))
                    cand_id += 1

        # Save debug artifacts if directory provided
        if debug_dir:
            cls._save_debug_lines(prep.gray, lines_skel, lines_edges, candidates, debug_dir)

        return candidates

    @classmethod
    def _snap_orthogonal(
        cls, x1: float, y1: float, x2: float, y2: float, angle_tol_deg: float = 6.0
    ) -> Tuple[float, float, float, float, str]:
        """Snaps near-horizontal and near-vertical segments to exact 90-degree axes."""
        dx = x2 - x1
        dy = y2 - y1
        angle = abs(math.atan2(dy, dx) * 180.0 / math.pi)

        # Near horizontal: 0 deg or 180 deg
        if angle <= angle_tol_deg or angle >= 180.0 - angle_tol_deg:
            avg_y = (y1 + y2) / 2.0
            return (min(x1, x2), avg_y, max(x1, x2), avg_y, "horizontal")

        # Near vertical: 90 deg
        if abs(angle - 90.0) <= angle_tol_deg:
            avg_x = (x1 + x2) / 2.0
            return (avg_x, min(y1, y2), avg_x, max(y1, y2), "vertical")

        return (x1, y1, x2, y2, "diagonal")

    @classmethod
    def _verify_line_on_mask(
        cls, x1: float, y1: float, x2: float, y2: float, mask: np.ndarray, min_ratio: float = 0.65
    ) -> bool:
        """Sample points along segment and verify majority lie inside the wall mask."""
        h, w = mask.shape[:2]
        length = math.hypot(x2 - x1, y2 - y1)
        num_samples = max(5, int(length / 5.0))
        on_count = 0
        for i in range(num_samples):
            t = i / float(num_samples - 1)
            sx = int(round(x1 + t * (x2 - x1)))
            sy = int(round(y1 + t * (y2 - y1)))
            if 0 <= sx < w and 0 <= sy < h:
                if mask[sy, sx] > 0:
                    on_count += 1
        return (on_count / float(num_samples)) >= min_ratio

    @classmethod
    def _verify_line_near_mask(
        cls, x1: float, y1: float, x2: float, y2: float, mask: np.ndarray, max_dist: int = 6
    ) -> bool:
        """Verify line is close to wall pixels (for wall outer boundary edges)."""
        h, w = mask.shape[:2]
        mid_x = int(round((x1 + x2) / 2.0))
        mid_y = int(round((y1 + y2) / 2.0))
        if 0 <= mid_x < w and 0 <= mid_y < h:
            y_min = max(0, mid_y - max_dist)
            y_max = min(h, mid_y + max_dist + 1)
            x_min = max(0, mid_x - max_dist)
            x_max = min(w, mid_x + max_dist + 1)
            return bool(np.any(mask[y_min:y_max, x_min:x_max] > 0))
        return False

    @classmethod
    def _sample_thickness(
        cls, x1: float, y1: float, x2: float, y2: float, dist_tf: np.ndarray, default_th: float
    ) -> float:
        """Sample distance transform along the line to estimate thickness."""
        h, w = dist_tf.shape[:2]
        length = math.hypot(x2 - x1, y2 - y1)
        total_pts = max(3, int(length / 8.0))
        samples = []
        for i in range(total_pts):
            t = i / float(total_pts - 1)
            sx = int(round(x1 + t * (x2 - x1)))
            sy = int(round(y1 + t * (y2 - y1)))
            if 0 <= sx < w and 0 <= sy < h:
                val = dist_tf[sy, sx]
                if val >= 0.8:
                    samples.append(val * 2.0)
        if len(samples) < total_pts * 0.50:
            return 0.0
        return float(np.median(samples))

    @classmethod
    def _pair_parallel_lines(
        cls, segments: List[Tuple[float, float, float, float, str]], base_thickness: float
    ) -> List[Tuple[float, float, float, float, float, str]]:
        """Pair parallel lines (outer boundary lines of walls) and derive centerlines."""
        paired = []
        used = set()
        min_sep = max(5.0, base_thickness * 0.60)
        max_sep = max(8.0, base_thickness * 2.2)

        for i, s1 in enumerate(segments):
            if i in used:
                continue
            x1a, y1a, x1b, y1b, o1 = s1
            if o1 not in ("horizontal", "vertical"):
                continue

            for j in range(i + 1, len(segments)):
                if j in used:
                    continue
                x2a, y2a, x2b, y2b, o2 = segments[j]
                if o1 != o2:
                    continue

                if o1 == "horizontal":
                    dist = abs(y1a - y2a)
                    if min_sep <= dist <= max_sep:
                        # Check overlap along x
                        ov_start = max(min(x1a, x1b), min(x2a, x2b))
                        ov_end = min(max(x1a, x1b), max(x2a, x2b))
                        if ov_end - ov_start > 20:
                            mid_y = (y1a + y2a) / 2.0
                            paired.append((ov_start, mid_y, ov_end, mid_y, dist, "horizontal"))
                            used.add(i)
                            used.add(j)
                            break
                elif o1 == "vertical":
                    dist = abs(x1a - x2a)
                    if min_sep <= dist <= max_sep:
                        # Check overlap along y
                        ov_start = max(min(y1a, y1b), min(y2a, y2b))
                        ov_end = min(max(y1a, y1b), max(y2a, y2b))
                        if ov_end - ov_start > 20:
                            mid_x = (x1a + x2a) / 2.0
                            paired.append((mid_x, ov_start, mid_x, ov_end, dist, "vertical"))
                            used.add(i)
                            used.add(j)
                            break
        return paired

    @classmethod
    def _save_debug_lines(
        cls, gray: np.ndarray, lsd_lines, hough_lines, candidates: List[CvWallCandidate], debug_dir: Path
    ) -> None:
        """Save 06_raw_lines.png and 07_centerlines.png debug artifacts."""
        h, w = gray.shape[:2]

        # 06_raw_lines.png
        canvas_raw = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        if lsd_lines is not None:
            for l in lsd_lines:
                coords = l.flatten()
                if len(coords) >= 4:
                    x1, y1, x2, y2 = map(int, map(round, coords[:4]))
                    cv2.line(canvas_raw, (x1, y1), (x2, y2), (0, 180, 255), 1)
        if hough_lines is not None:
            for l in hough_lines:
                coords = l.flatten()
                if len(coords) >= 4:
                    x1, y1, x2, y2 = map(int, map(round, coords[:4]))
                    cv2.line(canvas_raw, (x1, y1), (x2, y2), (255, 100, 0), 1)
        cv2.imwrite(str(debug_dir / "06_raw_lines.png"), canvas_raw)

        # 07_centerlines.png
        canvas_cent = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        for c in candidates:
            x1, y1 = map(int, map(round, c.start_pixel))
            x2, y2 = map(int, map(round, c.end_pixel))
            color = (0, 255, 0) if c.evidence_type == "skeleton_centerline" else (255, 0, 255)
            cv2.line(canvas_cent, (x1, y1), (x2, y2), color, 2)
            cv2.circle(canvas_cent, (x1, y1), 3, (0, 0, 255), -1)
            cv2.circle(canvas_cent, (x2, y2), 3, (0, 0, 255), -1)
        cv2.imwrite(str(debug_dir / "07_centerlines.png"), canvas_cent)
