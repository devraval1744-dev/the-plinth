"""
Validates that a BlueprintAnalysisResult is structurally sound
before it is persisted. Raises ValueError with a descriptive message
on any failure — the backend stores status=NEEDS_REVIEW for those.
"""
from app.schemas.spatial import BlueprintAnalysisResult


def validate_analysis(result: BlueprintAnalysisResult) -> None:
    """Raises ValueError if the result has structural problems."""

    if result.canvas_width <= 0 or result.canvas_height <= 0:
        raise ValueError("Canvas dimensions must be positive")

    if not result.rooms:
        raise ValueError("Analysis produced no rooms")

    for room in result.rooms:
        if not room.id or not room.name:
            raise ValueError(f"Room missing id or name: {room}")
        if room.width <= 0 or room.height <= 0:
            raise ValueError(f"Room {room.id} has non-positive dimensions")
        if room.x < 0 or room.y < 0:
            raise ValueError(f"Room {room.id} has negative coordinates")

    for wall in result.walls:
        if not wall.id:
            raise ValueError("Wall missing id")
        # A wall must have some length
        dx = abs(wall.end_x - wall.start_x)
        dy = abs(wall.end_y - wall.start_y)
        if dx < 0.01 and dy < 0.01:
            raise ValueError(f"Wall {wall.id} has near-zero length")

    for door in result.doors:
        if door.width <= 0:
            raise ValueError(f"Door {door.id} has non-positive width")

    for window in result.windows:
        if window.width <= 0:
            raise ValueError(f"Window {window.id} has non-positive width")
