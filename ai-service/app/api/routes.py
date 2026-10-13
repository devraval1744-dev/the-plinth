"""
FastAPI routes for the AI service.
Called by the Express backend only — not directly by the frontend.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse

from app.schemas.spatial import BlueprintAnalysisResult
from app.services.blueprint_analyzer import analyze_blueprint

router = APIRouter(prefix="/api", tags=["blueprint-analysis"])


@router.get("/health")
async def health():
    return {"status": "ok", "service": "plinth-ai"}


@router.post("/blueprints/analyze", response_model=BlueprintAnalysisResult)
async def analyze(
    file: UploadFile = File(...),
    blueprint_id: str = Form(...),
    blueprint_version: int = Form(...),
    unit_type: Optional[str] = Form(None),
):
    """
    Accept a blueprint file and return structured spatial JSON.
    Called by the Express backend after fetching the blueprint file.
    """
    allowed_types = {
        "application/pdf", "image/png", "image/jpeg",
        "image/jpg", "image/webp",
    }
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type: {file.content_type}"
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=422, detail="Empty file")

    try:
        result = await analyze_blueprint(
            image_bytes=content,
            mime_type=file.content_type or "application/octet-stream",
            blueprint_id=blueprint_id,
            unit_type=unit_type,
            blueprint_version=blueprint_version,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return result
