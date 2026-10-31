"""
The Plinth — Architectural Blueprint Reconstruction Engine.
Hybrid Computer Vision + Vision AI + Shapely Computational Geometry.
"""
from app.reconstruction.file_normalizer import FileNormalizer
from app.reconstruction.region_detector import RegionDetector, CropTransform
from app.reconstruction.image_preprocessor import ImagePreprocessor
from app.reconstruction.cv_wall_extractor import CvWallExtractor, CvWallCandidate
from app.reconstruction.vision_adapters import (
    get_vision_adapter,
    BaseVisionAdapter,
    GeminiVisionAdapter,
    OpenAIVisionAdapter,
    VisionIntermediateResult,
)
from app.reconstruction.geometry_fusion import GeometryFusionEngine, FusedWallCandidate
from app.reconstruction.shapely_normalizer import ShapelyNormalizer, NormalizedWall, Node, WallEdge
from app.reconstruction.polygonizer import RoomPolygonizer
from app.reconstruction.wall_solids import WallSolidGenerator
from app.reconstruction.debug_visualizer import DebugVisualizer
from app.reconstruction.hybrid_pipeline import HybridReconstructionPipeline

__all__ = [
    "FileNormalizer",
    "RegionDetector",
    "CropTransform",
    "ImagePreprocessor",
    "CvWallExtractor",
    "CvWallCandidate",
    "get_vision_adapter",
    "BaseVisionAdapter",
    "GeminiVisionAdapter",
    "OpenAIVisionAdapter",
    "VisionIntermediateResult",
    "GeometryFusionEngine",
    "FusedWallCandidate",
    "ShapelyNormalizer",
    "NormalizedWall",
    "Node",
    "WallEdge",
    "RoomPolygonizer",
    "WallSolidGenerator",
    "DebugVisualizer",
    "HybridReconstructionPipeline",
]
