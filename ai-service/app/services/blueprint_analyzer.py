"""
Orchestrates blueprint analysis: provider call → validation → result.
"""
from typing import Optional

from app.providers.provider_factory import get_provider
from app.schemas.spatial import BlueprintAnalysisResult
from app.services.validator import validate_analysis


async def analyze_blueprint(
    image_bytes: bytes,
    mime_type: str,
    blueprint_id: str,
    unit_type: Optional[str],
    blueprint_version: int,
) -> BlueprintAnalysisResult:
    """
    Run AI analysis on a blueprint file.
    Returns validated BlueprintAnalysisResult.
    Raises ValueError for validation failures.
    Raises RuntimeError for provider failures.
    """
    provider = get_provider()
    result = await provider.analyze(
        image_bytes=image_bytes,
        mime_type=mime_type,
        blueprint_id=blueprint_id,
        unit_type=unit_type,
        blueprint_version=blueprint_version,
    )
    # Strict validation before returning
    validate_analysis(result)

    # Attempt GLB 3D model generation if provider hasn't already generated one — failure is non-fatal to 2D analysis
    if not result.glb_ready:
        try:
            from pathlib import Path
            import re
            from app.services.glb_generator import GLBGenerator

            # Sanitize blueprint_id and version to prevent directory traversal
            safe_bp_id = re.sub(r"[^a-zA-Z0-9_\-]", "", blueprint_id)
            model_filename = f"{safe_bp_id}_v{blueprint_version}.glb"
            models_dir = Path(__file__).resolve().parent.parent.parent / "debug_artifacts" / "models"
            models_dir.mkdir(parents=True, exist_ok=True)
            model_path = models_dir / model_filename

            generator = GLBGenerator()
            warnings = generator.export_glb_file(result, model_path)
            if model_path.exists() and model_path.stat().st_size > 500:
                result.glb_ready = True
                result.glb_filename = model_filename
        except Exception as e:
            # Non-fatal: log warning and proceed with valid 2D analysis
            import logging
            logging.getLogger(__name__).warning(
                f"GLB generation for blueprint={blueprint_id} encountered non-fatal error: {e}"
            )

    return result
