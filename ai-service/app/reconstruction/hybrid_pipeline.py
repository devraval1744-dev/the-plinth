"""
Master Hybrid Reconstruction Pipeline (Phase 1, 9, 15, 16, 17, 18).
Coordinates:
File Normalizer -> Region Detector -> Image Preprocessor ->
[CV Line Extraction + Vision AI Semantic Understanding] ->
Geometry Fusion -> Shapely Planar Normalization ->
Room Polygonization -> Wall Solid Footprint -> Validation Report ->
Debug Overlay -> Structured SpatialAnalysis.
"""
from dataclasses import asdict
import io
import logging
import math
import os
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

import cv2
import numpy as np

from app.schemas.spatial import (
    BlueprintAnalysisResult,
    Room,
    Wall,
    Door,
    Window,
    Balcony,
)
from app.reconstruction.file_normalizer import FileNormalizer
from app.reconstruction.region_detector import RegionDetector, CropTransform
from app.reconstruction.image_preprocessor import ImagePreprocessor
from app.reconstruction.cv_wall_extractor import CvWallExtractor
from app.reconstruction.vision_adapters import (
    get_vision_adapter,
    BaseVisionAdapter,
    VisionIntermediateResult,
)
from app.reconstruction.geometry_fusion import GeometryFusionEngine, FusedWallCandidate
from app.reconstruction.shapely_normalizer import ShapelyNormalizer, NormalizedWall, Node
from app.reconstruction.polygonizer import RoomPolygonizer
from app.reconstruction.wall_solids import WallSolidGenerator
from app.reconstruction.debug_visualizer import DebugVisualizer
from app.reconstruction.raster_pipeline import run_raster_reconstruction

logger = logging.getLogger(__name__)

# Standard Indian residential carpet areas in square metres
UNIT_AREAS_M2: Dict[str, float] = {
    "studio":   35.0,
    "1 bhk":    45.0,
    "1.5 bhk":  55.0,
    "2 bhk":    70.0,
    "2.5 bhk":  85.0,
    "3 bhk":   110.0,
    "4 bhk":   150.0,
    "5 bhk":   190.0,
    "5+ bhk":  230.0,
}


class HybridReconstructionPipeline:
    """Executes the full hybrid CV + Vision AI + Shapely reconstruction pipeline."""

    def __init__(self, vision_adapter: Optional[BaseVisionAdapter] = None):
        self._vision_adapter = vision_adapter or get_vision_adapter()

    async def reconstruct(
        self,
        image_bytes: bytes,
        mime_type: str,
        blueprint_id: str,
        unit_type: Optional[str] = None,
        blueprint_version: int = 1,
        debug_base_dir: Optional[Path] = None,
    ) -> BlueprintAnalysisResult:
        logger.info(f"[PIPELINE START] bp={blueprint_id} v={blueprint_version} type={unit_type}")

        # ─── STAGE: FILE_NORMALIZATION ───────────────────────────────────────
        bgr_image, file_hash, file_meta = FileNormalizer.normalize(image_bytes, mime_type)
        logger.info(f"[STAGE: FILE_NORMALIZATION] hash={file_hash[:12]} working_dims={file_meta.get('working_width')}x{file_meta.get('working_height')}")

        # Setup debug directory if enabled
        debug_dir: Optional[Path] = None
        if debug_base_dir:
            debug_dir = debug_base_dir / file_hash[:16]
            debug_dir.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(debug_dir / "01_original.png"), bgr_image)

        # ─── STAGE: REGION_DETECTION ─────────────────────────────────────────
        cropped_bgr, transform = RegionDetector.detect_region(bgr_image)
        logger.info(f"[STAGE: REGION_DETECTION] crop={transform.crop_w}x{transform.crop_h} at ({transform.crop_x},{transform.crop_y})")

        # ─── STAGE: PREPROCESSING ────────────────────────────────────────────
        prep = ImagePreprocessor.preprocess(cropped_bgr, debug_dir)
        logger.info(f"[STAGE: PREPROCESSING] est_thickness={prep.estimated_wall_thickness_px:.1f}px")

        # ─── STAGE: RASTER RECONSTRUCTION (pixel + text grounded; preferred) ─────────
        if os.getenv("PLINTH_RASTER_PIPELINE", "1") != "0":
            try:
                raster_result = await self._reconstruct_raster(
                    cropped_bgr, image_bytes, blueprint_id, unit_type, blueprint_version,
                    file_hash, debug_dir,
                )
            except Exception as e:
                logger.warning(f"[STAGE: RASTER] failed, using legacy extraction: {e}", exc_info=True)
                raster_result = None
            if raster_result is not None:
                return raster_result

        # ─── STAGE: CV_EXTRACTION ────────────────────────────────────────────
        cv_candidates = CvWallExtractor.extract_candidates(prep, debug_dir)
        logger.info(f"[STAGE: CV_EXTRACTION] extracted {len(cv_candidates)} pixel wall candidates")

        # ─── STAGE: VISION_ANALYSIS ──────────────────────────────────────────
        # Encode cropped BGR to JPEG for Vision AI
        ok, crop_jpg_bytes = cv2.imencode(".jpg", cropped_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not ok:
            crop_jpg_bytes = image_bytes

        vision_result: Optional[VisionIntermediateResult] = None
        try:
            vision_result = await self._vision_adapter.extract_semantic_geometry(
                crop_jpg_bytes.tobytes(), "image/jpeg", unit_type
            )
            logger.info(f"[STAGE: VISION_ANALYSIS] {vision_result.provider_name} returned {len(vision_result.semantic_walls)} walls, {len(vision_result.rooms)} rooms")
        except Exception as e:
            logger.warning(f"[STAGE: VISION_ANALYSIS] Vision call failed or timed out: {e}. Relying on CV pixel geometry.")
            # Synthesize fallback empty vision result
            vision_result = VisionIntermediateResult(
                footprint={"min_x": 0, "min_y": 0, "max_x": 1000, "max_y": 1000},
                semantic_walls=[],
                rooms=[],
                doors=[],
                windows=[],
                uncertain_regions=[],
                unit_type=unit_type,
                provider_name="cv_standalone",
                model_name="opencv",
            )

        # ─── STAGE: GEOMETRY_FUSION ──────────────────────────────────────────
        fused_walls, fusion_stats = GeometryFusionEngine.fuse(
            cv_candidates=cv_candidates,
            vision_result=vision_result,
            transform=transform,
            wall_mask=prep.wall_mask,
        )
        logger.info(f"[STAGE: GEOMETRY_FUSION] fused_count={len(fused_walls)} (FUSED={fusion_stats['fused_count']}, CV={fusion_stats['cv_count']}, VISION={fusion_stats['vision_count']})")

        # ─── SCALE & CANVAS CALCULATION ──────────────────────────────────────
        key = (unit_type or vision_result.unit_type or "").strip().lower()
        area_m2 = UNIT_AREAS_M2.get(key)
        if area_m2 is None:
            # Estimate from room count or default to 90m2
            room_count = max(len(vision_result.rooms), 4)
            area_m2 = max(room_count * 12.0, 70.0)

        # Proportions: keep aspect ratio bounded to realistic architectural proportions [0.65, 1.65]
        crop_aspect = transform.crop_w / max(1.0, transform.crop_h)
        aspect = max(0.65, min(1.65, crop_aspect))
        canvas_h_m = round(math.sqrt(area_m2 / aspect), 2)
        canvas_w_m = round(canvas_h_m * aspect, 2)
        logger.info(f"[SCALE] canvas={canvas_w_m}m x {canvas_h_m}m (aspect={aspect:.2f}, area={area_m2}m²)")

        # ─── STAGE: TOPOLOGY_VALIDATION & SHAPELY NORMALIZATION ──────────────
        normalized_walls, nodes, wall_edges, norm_report = ShapelyNormalizer.normalize(
            fused_walls=fused_walls,
            transform=transform,
            canvas_w_m=canvas_w_m,
            canvas_h_m=canvas_h_m,
            debug_dir=debug_dir,
        )
        logger.info(f"[STAGE: TOPOLOGY_VALIDATION] final_walls={len(normalized_walls)} nodes={len(nodes)} confidence={norm_report.confidence:.2f}")

        # ─── STAGE: POLYGONIZATION ───────────────────────────────────────────
        rooms = RoomPolygonizer.polygonize_rooms(
            walls=normalized_walls,
            vision_rooms=vision_result.rooms,
            canvas_w_m=canvas_w_m,
            canvas_h_m=canvas_h_m,
            debug_dir=debug_dir,
        )
        logger.info(f"[STAGE: POLYGONIZATION] extracted {len(rooms)} enclosed rooms")

        # ─── STAGE: WALL_SOLIDS ──────────────────────────────────────────────
        wall_footprint = WallSolidGenerator.generate_footprint(normalized_walls)

        # ─── STAGE: DOORS & WINDOWS ASSOCIATION ──────────────────────────────
        doors, windows = self._associate_doors_windows(
            vision_doors=vision_result.doors,
            vision_windows=vision_result.windows,
            walls=normalized_walls,
            rooms=rooms,
            canvas_w_m=canvas_w_m,
            canvas_h_m=canvas_h_m,
        )

        # ─── STAGE: BALCONIES ────────────────────────────────────────────────
        balconies = [
            Balcony(id=f"bal_{r.id}", x=r.x, y=r.y, width=r.width, height=r.height)
            for r in rooms if r.type == "balcony"
        ]

        # ─── STAGE: DEBUG_OVERLAY ────────────────────────────────────────────
        debug_overlay_rel_path: Optional[str] = None
        if debug_dir:
            overlay_file = DebugVisualizer.generate_final_overlay(
                cropped_bgr=cropped_bgr,
                walls=normalized_walls,
                nodes=nodes,
                canvas_w_m=canvas_w_m,
                canvas_h_m=canvas_h_m,
                debug_dir=debug_dir,
            )
            debug_overlay_rel_path = str(overlay_file)
            logger.info(f"[STAGE: DEBUG_OVERLAY] saved 10_final_overlay.png at {overlay_file}")

        # ─── STAGE: VALIDATION_REPORT ────────────────────────────────────────
        validation_report = {
            "rawCvWalls": len(cv_candidates),
            "visionWalls": len(vision_result.semantic_walls),
            "fusedCandidates": len(fused_walls),
            "duplicatesRemoved": norm_report.duplicates_removed,
            "collinearSegmentsMerged": norm_report.collinear_merged,
            "endpointsSnapped": norm_report.endpoints_snapped,
            "tJunctionsCreated": norm_report.t_junctions_split,
            "intersectionsResolved": norm_report.crossings_resolved,
            "finalWalls": len(normalized_walls),
            "roomPolygons": len(rooms),
            "confidence": norm_report.confidence,
            "needsReview": norm_report.needs_review,
            "connectedComponents": norm_report.connected_components,
            "danglingEndpoints": norm_report.dangling_endpoints,
        }

        # Convert NormalizedWalls to Spatial Schema Walls
        spatial_walls = [
            Wall(
                id=w.id,
                start_x=w.start[0],
                start_y=w.start[1],
                end_x=w.end[0],
                end_y=w.end[1],
                thickness=w.thickness,
            )
            for w in normalized_walls
        ]

        provider_label = f"hybrid_{vision_result.provider_name}"
        is_demo = vision_result.provider_name in ("demo", "cv_standalone")

        return BlueprintAnalysisResult(
            blueprint_id=blueprint_id,
            unit_type=unit_type or vision_result.unit_type,
            blueprint_version=blueprint_version,
            provider=provider_label,
            is_demo=is_demo,
            canvas_width=canvas_w_m,
            canvas_height=canvas_h_m,
            rooms=rooms,
            walls=spatial_walls,
            doors=doors,
            windows=windows,
            balconies=balconies,
            file_hash=file_hash,
            model=vision_result.model_name,
            pipeline_version="2.0-hybrid",
            validation_report=validation_report,
            wall_footprint=wall_footprint,
            debug_overlay_path=debug_overlay_rel_path,
        )

    async def _reconstruct_raster(
        self,
        cropped_bgr: np.ndarray,
        image_bytes: bytes,
        blueprint_id: str,
        unit_type: Optional[str],
        blueprint_version: int,
        file_hash: str,
        debug_dir: Optional[Path],
    ) -> Optional[BlueprintAnalysisResult]:
        key = (unit_type or "").strip().lower()
        area_m2 = UNIT_AREAS_M2.get(key, 90.0)
        ok, crop_jpg = cv2.imencode(".jpg", cropped_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        out = await run_raster_reconstruction(
            cropped_bgr, unit_type, area_m2, self._vision_adapter,
            crop_jpg.tobytes() if ok else None, debug_dir,
        )
        if out is None or len(out.walls) < 4 or not out.rooms:
            logger.info("[STAGE: RASTER] not confident enough (walls/rooms) - falling back")
            return None
        logger.info(
            f"[STAGE: RASTER] walls={len(out.walls)} rooms={len(out.rooms)} doors={len(out.doors)} "
            f"windows={len(out.windows)} mpp={out.mpp:.4f} ({out.mpp_source}) labels={out.labels_from}"
        )
        wall_footprint = WallSolidGenerator.generate_footprint(out.walls)
        balconies = [
            Balcony(id=f"bal_{r.id}", x=r.x, y=r.y, width=r.width, height=r.height)
            for r in out.rooms if r.type == "balcony"
        ]
        debug_overlay_rel_path: Optional[str] = None
        if debug_dir:
            from app.reconstruction.shapely_normalizer import ShapelyNormalizer
            ShapelyNormalizer._save_debug_graph(out.walls, out.nodes, out.canvas_w_m, out.canvas_h_m, debug_dir)
            overlay_file = DebugVisualizer.generate_final_overlay(
                cropped_bgr=cropped_bgr, walls=out.walls, nodes=out.nodes,
                canvas_w_m=out.canvas_w_m, canvas_h_m=out.canvas_h_m, debug_dir=debug_dir,
                doors=out.doors, windows=out.windows, rooms=out.rooms,
            )
            debug_overlay_rel_path = str(overlay_file)
        vision = out.vision
        provider_name = vision.provider_name if vision is not None else "raster_ocr"
        validation_report = {
            "pipeline": "raster",
            "rawCvWalls": len(out.walls),
            "visionWalls": 0,
            "finalWalls": len(out.walls),
            "roomPolygons": len(out.rooms),
            "doors": len(out.doors),
            "windows": len(out.windows),
            "scaleMetresPerPixel": round(out.mpp, 5),
            "scaleSource": out.mpp_source,
            "roomNamesFrom": out.labels_from,
            "confidence": 0.9 if out.mpp_source == "printed_room_sizes" else 0.75,
            "needsReview": out.mpp_source != "printed_room_sizes",
            **out.stats,
        }
        spatial_walls = [
            Wall(id=w.id, start_x=w.start[0], start_y=w.start[1], end_x=w.end[0], end_y=w.end[1],
                 thickness=w.thickness)
            for w in out.walls
        ]
        return BlueprintAnalysisResult(
            blueprint_id=blueprint_id,
            unit_type=unit_type or (vision.unit_type if vision is not None else None),
            blueprint_version=blueprint_version,
            provider=f"hybrid_{provider_name}",
            is_demo=False,
            canvas_width=out.canvas_w_m,
            canvas_height=out.canvas_h_m,
            rooms=out.rooms,
            walls=spatial_walls,
            doors=out.doors,
            windows=out.windows,
            balconies=balconies,
            file_hash=file_hash,
            model=vision.model_name if vision is not None else "rapidocr+opencv",
            pipeline_version="3.0-raster",
            validation_report=validation_report,
            wall_footprint=wall_footprint,
            debug_overlay_path=debug_overlay_rel_path,
        )

    def _associate_doors_windows(
        self,
        vision_doors,
        vision_windows,
        walls: List[NormalizedWall],
        rooms: List[Room],
        canvas_w_m: float,
        canvas_h_m: float,
    ) -> Tuple[List[Door], List[Window]]:
        """Associates detected doors and windows with nearest supported walls."""
        doors: List[Door] = []
        windows: List[Window] = []

        # Process doors
        did = 1
        for vd in vision_doors:
            px = vd.position[0] * canvas_w_m
            py = vd.position[1] * canvas_h_m
            best_wall = self._find_nearest_wall(px, py, walls)
            if best_wall:
                # Project onto wall
                snapped_x, snapped_y, orient = self._project_on_wall(px, py, best_wall)
                doors.append(Door(
                    id=f"d{did}",
                    x=round(snapped_x, 2),
                    y=round(snapped_y, 2),
                    width=0.9,
                    orientation=orient,
                    connects_to=vd.connects_to,
                ))
                did += 1

        # Process windows
        wid = 1
        for vw in vision_windows:
            px = vw.position[0] * canvas_w_m
            py = vw.position[1] * canvas_h_m
            best_wall = self._find_nearest_wall(px, py, walls, exterior_only=True)
            if best_wall:
                snapped_x, snapped_y, orient = self._project_on_wall(px, py, best_wall)
                windows.append(Window(
                    id=f"win{wid}",
                    x=round(snapped_x, 2),
                    y=round(snapped_y, 2),
                    width=1.2,
                    orientation=orient,
                    connects_to=vw.connects_to,
                ))
                wid += 1

        # If vision returned zero windows/doors, generate architectural baseline on room walls
        if not doors and rooms:
            for r in rooms:
                if r.type in ("bedroom", "bathroom", "kitchen", "utility"):
                    dw = 0.8 if r.type == "bathroom" else 0.9
                    cx = round(r.x + r.width / 2.0, 2)
                    cy = round(r.y + r.height / 2.0, 2)
                    doors.append(Door(id=f"d{did}", x=cx, y=r.y, width=dw, orientation="north", connects_to=r.id))
                    did += 1

        if not windows and rooms:
            for r in rooms:
                if r.type in ("bedroom", "living_room", "dining"):
                    cx = round(r.x + r.width / 2.0, 2)
                    windows.append(Window(id=f"win{wid}", x=cx, y=r.y, width=1.4, orientation="north", connects_to=r.id))
                    wid += 1

        return doors, windows

    def _find_nearest_wall(
        self, px: float, py: float, walls: List[NormalizedWall], exterior_only: bool = False
    ) -> Optional[NormalizedWall]:
        closest = None
        min_d = 999.0
        for w in walls:
            if exterior_only and w.wall_type != "EXTERNAL":
                continue
            x1, y1 = w.start
            x2, y2 = w.end
            d = self._pt_to_seg_dist(px, py, x1, y1, x2, y2)
            if d < min_d and d <= 1.2:  # within 1.2m
                min_d = d
                closest = w
        return closest

    def _project_on_wall(
        self, px: float, py: float, wall: NormalizedWall
    ) -> Tuple[float, float, str]:
        x1, y1 = wall.start
        x2, y2 = wall.end
        dx = x2 - x1
        dy = y2 - y1
        length_sq = dx * dx + dy * dy
        if length_sq < 0.001:
            return x1, y1, "unknown"

        t = max(0.1, min(0.9, ((px - x1) * dx + (py - y1) * dy) / length_sq))
        proj_x = x1 + t * dx
        proj_y = y1 + t * dy

        if abs(dy) < abs(dx) * 0.2:
            orient = "north" if proj_y <= y1 + 0.1 else "south"
        else:
            orient = "west" if proj_x <= x1 + 0.1 else "east"
        return proj_x, proj_y, orient

    def _pt_to_seg_dist(self, px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
        dx = x2 - x1
        dy = y2 - y1
        l2 = dx * dx + dy * dy
        if l2 < 0.001:
            return math.hypot(px - x1, py - y1)
        t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / l2))
        return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
