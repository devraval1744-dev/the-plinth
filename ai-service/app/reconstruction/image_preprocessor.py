"""
Image Preprocessing module (Phase 5).
Produces deterministic binary, edge, wall-mask, and distance-transform representations
scaled proportionally to the blueprint resolution.
"""
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple
import cv2
import numpy as np


@dataclass
class PreprocessedData:
    gray: np.ndarray
    thresh: np.ndarray
    edges: np.ndarray
    wall_mask: np.ndarray
    dist_transform: np.ndarray
    estimated_wall_thickness_px: float


class ImagePreprocessor:
    """Preprocesses cropped blueprint images and extracts structural wall masks."""

    @classmethod
    def preprocess(
        cls,
        cropped_bgr: np.ndarray,
        debug_dir: Optional[Path] = None,
    ) -> PreprocessedData:
        h, w = cropped_bgr.shape[:2]
        dim = max(h, w)

        # 1. Grayscale & light bilateral / gaussian denoising
        gray = cv2.cvtColor(cropped_bgr, cv2.COLOR_BGR2GRAY)
        denoised = cv2.bilateralFilter(gray, d=5, sigmaColor=50, sigmaSpace=50)

        # 2. Adaptive thresholding - blockSize scaled to drawing resolution (odd integer ~ 21-35)
        block_size = max(15, (int(dim * 0.02) // 2) * 2 + 1)
        thresh = cv2.adaptiveThreshold(
            denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block_size, 7
        )

        # 3. Canny edge detection
        edges = cv2.Canny(denoised, 40, 140)

        # 4. Wall Mask Extraction:
        # Thin non-wall noise (text dots, hatches, dimension lines) is filtered out
        # Scale kernel proportionally
        k_size = max(2, int(dim * 0.003))
        kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (k_size, k_size))
        cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel_open)

        # Connected component filtering to remove isolated small letter glyphs (< 45px area)
        min_comp_area = max(30, int(dim * 0.035))
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
        wall_mask = np.zeros_like(cleaned)
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            if area >= min_comp_area:
                wall_mask[labels == i] = 255

        # Small directional closing to bridge small gaps along walls without bleeding into adjacent rooms
        k_close = max(3, int(dim * 0.005))
        k_horiz = cv2.getStructuringElement(cv2.MORPH_RECT, (k_close, 1))
        k_vert = cv2.getStructuringElement(cv2.MORPH_RECT, (1, k_close))
        wall_mask_h = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, k_horiz)
        wall_mask_v = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, k_vert)
        wall_mask = cv2.bitwise_or(wall_mask_h, wall_mask_v)

        # 5. Distance Transform for wall thickness estimation and ridge finding
        dist_transform = cv2.distanceTransform(wall_mask, cv2.DIST_L2, 5)

        # Estimate average wall thickness in pixels from upper distance transform ridge values
        positive_dists = dist_transform[dist_transform > 1.0]
        if len(positive_dists) > 0:
            upper_half_thickness = float(np.percentile(positive_dists, 80))
            est_thickness = max(4.0, upper_half_thickness * 2.0)
        else:
            est_thickness = 6.0

        # Save debug artifacts if debug directory is provided
        if debug_dir:
            debug_dir.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(debug_dir / "02_crop.png"), cropped_bgr)
            cv2.imwrite(str(debug_dir / "03_threshold.png"), thresh)
            cv2.imwrite(str(debug_dir / "04_edges.png"), edges)
            cv2.imwrite(str(debug_dir / "05_wall_mask.png"), wall_mask)

        return PreprocessedData(
            gray=gray,
            thresh=thresh,
            edges=edges,
            wall_mask=wall_mask,
            dist_transform=dist_transform,
            estimated_wall_thickness_px=est_thickness,
        )
