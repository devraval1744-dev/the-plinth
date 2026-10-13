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
    return result
