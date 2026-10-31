"""
Blueprint Region Detection module (Phase 4).
Separates the architectural floor plan from page borders, title blocks, legends, and notes.
Preserves forward and inverse coordinate transforms.
"""
from dataclasses import dataclass
from typing import Tuple, List, Optional
import cv2
import numpy as np


@dataclass
class CropTransform:
    """Transformation between original image coordinates, cropped region, and normalized [0, 1]."""
    crop_x: int
    crop_y: int
    crop_w: int
    crop_h: int
    orig_w: int
    orig_h: int

    def crop_to_norm(self, cx: float, cy: float) -> Tuple[float, float]:
        """Convert cropped image pixel (cx, cy) to normalized [0, 1] drawing space."""
        u = max(0.0, min(1.0, cx / max(1.0, self.crop_w)))
        v = max(0.0, min(1.0, cy / max(1.0, self.crop_h)))
        return u, v

    def norm_to_crop(self, u: float, v: float) -> Tuple[float, float]:
        """Convert normalized [0, 1] drawing space to cropped pixel (cx, cy)."""
        return u * self.crop_w, v * self.crop_h

    def crop_to_orig(self, cx: float, cy: float) -> Tuple[float, float]:
        """Convert cropped pixel (cx, cy) to original image pixel."""
        return cx + self.crop_x, cy + self.crop_y

    def orig_to_crop(self, ox: float, oy: float) -> Tuple[float, float]:
        """Convert original pixel to cropped pixel."""
        return ox - self.crop_x, oy - self.crop_y

    def norm_to_orig(self, u: float, v: float) -> Tuple[float, float]:
        """Convert normalized [0, 1] to original image pixel."""
        cx, cy = self.norm_to_crop(u, v)
        return self.crop_to_orig(cx, cy)


class RegionDetector:
    """Detects and isolates the primary architectural floor plan drawing area."""

    @classmethod
    def detect_region(cls, bgr_image: np.ndarray) -> Tuple[np.ndarray, CropTransform]:
        orig_h, orig_w = bgr_image.shape[:2]

        gray = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2GRAY)
        
        # Adaptive thresholding to identify drawn lines
        # Invert so drawing elements are white (foreground)
        bin_img = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 8
        )

        # 1. Detect and suppress outermost full-page border frames
        contours_all, _ = cv2.findContours(bin_img, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        mask = bin_img.copy()
        for c in contours_all:
            bx, by, bw, bh = cv2.boundingRect(c)
            # If contour is a large page border (> 85% of both dimensions), erase its border stroke
            if bw > orig_w * 0.85 and bh > orig_h * 0.85:
                cv2.drawContours(mask, [c], -1, 0, thickness=10)

        # Also suppress outermost 2% margins
        margin_x = int(orig_w * 0.02)
        margin_y = int(orig_h * 0.02)
        mask[:margin_y, :] = 0
        mask[-margin_y:, :] = 0
        mask[:, :margin_x] = 0
        mask[:, -margin_x:] = 0

        # 2. Morphological closing to merge nearby architectural rooms into a single mass
        kernel_size = max(15, int(min(orig_w, orig_h) * 0.025))
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        # 3. Find contours
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Filter contours by area - the main floor plan must occupy substantial area (> 10% of page)
        min_area = (orig_w * orig_h) * 0.10
        candidates = []
        for c in contours:
            area = cv2.contourArea(c)
            if area >= min_area:
                x, y, w, h = cv2.boundingRect(c)
                # Ignore full-sheet borders
                if w > orig_w * 0.92 and h > orig_h * 0.92:
                    continue
                # Ignore thin title blocks at the bottom
                if y > orig_h * 0.75 and h < orig_h * 0.20:
                    continue
                candidates.append((area, (x, y, w, h)))

        if candidates:
            # Pick the largest candidate or union of high-area components
            candidates.sort(key=lambda item: item[0], reverse=True)
            _, (fx, fy, fw, fh) = candidates[0]
            
            # If multiple large candidates (e.g. split wings of floor plan), union them
            for a, (cx, cy, cw, ch) in candidates[1:]:
                # Ignore title blocks
                if cy > orig_h * 0.75 and ch < orig_h * 0.20:
                    continue
                if a > min_area * 1.5:
                    x2 = max(fx + fw, cx + cw)
                    y2 = max(fy + fh, cy + ch)
                    fx = min(fx, cx)
                    fy = min(fy, cy)
                    fw = x2 - fx
                    fh = y2 - fy

            # Add a small padding (1-2%) around the floor plan
            pad_x = int(fw * 0.02)
            pad_y = int(fh * 0.02)
            crop_x = max(0, fx - pad_x)
            crop_y = max(0, fy - pad_y)
            crop_w = min(orig_w - crop_x, fw + 2 * pad_x)
            crop_h = min(orig_h - crop_y, fh + 2 * pad_y)
        else:
            # Default to full image with 2% margin strip
            crop_x = margin_x
            crop_y = margin_y
            crop_w = max(100, orig_w - 2 * margin_x)
            crop_h = max(100, orig_h - 2 * margin_y)

        cropped_bgr = bgr_image[crop_y : crop_y + crop_h, crop_x : crop_x + crop_w].copy()

        transform = CropTransform(
            crop_x=crop_x,
            crop_y=crop_y,
            crop_w=crop_w,
            crop_h=crop_h,
            orig_w=orig_w,
            orig_h=orig_h,
        )
        return cropped_bgr, transform
