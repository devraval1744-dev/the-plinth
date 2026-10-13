"""
Strongly-typed structured spatial representation produced by blueprint analysis.
This schema is the contract between the AI service and the backend/frontend.
"""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator


RoomType = Literal[
    "living_room", "dining", "bedroom", "kitchen",
    "bathroom", "utility", "balcony", "corridor", "other"
]

Orientation = Literal["north", "south", "east", "west", "unknown"]


class Room(BaseModel):
    id: str
    name: str
    type: RoomType
    x: float
    y: float
    width: float
    height: float
    area_sqft: Optional[float] = None

    @field_validator("width", "height")
    @classmethod
    def must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("width and height must be positive")
        return v


class Wall(BaseModel):
    id: str
    start_x: float
    start_y: float
    end_x: float
    end_y: float
    thickness: float = 0.15  # metres, default wall thickness


class Door(BaseModel):
    id: str
    x: float
    y: float
    width: float
    orientation: Orientation = "unknown"
    connects_to: Optional[str] = None  # room id


class Window(BaseModel):
    id: str
    x: float
    y: float
    width: float
    orientation: Orientation = "unknown"
    connects_to: Optional[str] = None  # room id


class Balcony(BaseModel):
    id: str
    x: float
    y: float
    width: float
    height: float


class BlueprintAnalysisResult(BaseModel):
    """
    Complete structured spatial analysis of a blueprint.
    Coordinates are normalised to metres where possible.
    """
    # Identification (echoed back from request for safety)
    blueprint_id: str
    unit_type: Optional[str] = None
    blueprint_version: int

    # Provider metadata
    provider: str
    is_demo: bool = False

    # Canvas dimensions (metres)
    canvas_width: float
    canvas_height: float

    # Spatial elements
    rooms: List[Room] = Field(default_factory=list)
    walls: List[Wall] = Field(default_factory=list)
    doors: List[Door] = Field(default_factory=list)
    windows: List[Window] = Field(default_factory=list)
    balconies: List[Balcony] = Field(default_factory=list)

    @field_validator("canvas_width", "canvas_height")
    @classmethod
    def canvas_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("canvas dimensions must be positive")
        return v
