"""
DEMO AI Provider — deterministic structured layout generator.

⚠️  This is NOT real AI. It generates a plausible floor-plan layout
    based on the unit type (BHK count) using fixed geometry rules.
    The UI must clearly label results as "Demo AI Analysis".

Purpose: allow the full pipeline (analysis → 3-D viewer) to work
         during development without a real vision API key.

Design:  same unit type → same output every time (deterministic).
         Replace this class with a real provider by updating
         provider_factory.py — no other code needs to change.
"""
from typing import Optional

from app.providers.base import BlueprintAnalysisProvider
from app.schemas.spatial import (
    BlueprintAnalysisResult, Room, Wall, Door, Window, Balcony
)


def _studio_layout(bp_id: str, version: int) -> BlueprintAnalysisResult:
    return BlueprintAnalysisResult(
        blueprint_id=bp_id, unit_type="Studio", blueprint_version=version,
        provider="demo", is_demo=True,
        canvas_width=8.0, canvas_height=7.0,
        rooms=[
            Room(id="r1", name="Studio Room",    type="living_room", x=0.15, y=0.15, width=7.7, height=4.0),
            Room(id="r2", name="Kitchen",         type="kitchen",    x=0.15, y=4.15, width=3.5, height=2.7),
            Room(id="r3", name="Bathroom",        type="bathroom",   x=3.65, y=4.15, width=4.2, height=2.7),
        ],
        walls=_perimeter_walls(8.0, 7.0),
        doors=[
            Door(id="d1", x=3.5, y=0.0, width=0.9, orientation="south", connects_to="r1"),
            Door(id="d2", x=0.15, y=4.15, width=0.8, orientation="north", connects_to="r2"),
            Door(id="d3", x=3.65, y=4.15, width=0.8, orientation="north", connects_to="r3"),
        ],
        windows=[
            Window(id="w1", x=1.0, y=0.0, width=1.5, orientation="south"),
            Window(id="w2", x=5.0, y=0.0, width=1.5, orientation="south"),
        ],
    )


def _1bhk_layout(bp_id: str, version: int) -> BlueprintAnalysisResult:
    return BlueprintAnalysisResult(
        blueprint_id=bp_id, unit_type="1 BHK", blueprint_version=version,
        provider="demo", is_demo=True,
        canvas_width=9.0, canvas_height=8.5,
        rooms=[
            Room(id="r1", name="Living / Dining", type="living_room", x=0.15, y=0.15, width=5.5,  height=5.0,  area_sqft=296),
            Room(id="r2", name="Bedroom",          type="bedroom",    x=5.65, y=0.15, width=3.2,  height=5.0,  area_sqft=172),
            Room(id="r3", name="Kitchen",          type="kitchen",    x=0.15, y=5.15, width=4.0,  height=3.2,  area_sqft=140),
            Room(id="r4", name="Bathroom",         type="bathroom",   x=4.15, y=5.15, width=2.5,  height=3.2,  area_sqft=86),
            Room(id="r5", name="Balcony",          type="balcony",    x=6.65, y=5.15, width=2.2,  height=3.2),
        ],
        walls=_perimeter_walls(9.0, 8.5) + [
            Wall(id="iw1", start_x=5.65, start_y=0.15, end_x=5.65, end_y=5.15, thickness=0.15),
            Wall(id="iw2", start_x=0.15, start_y=5.15, end_x=8.85, end_y=5.15, thickness=0.15),
        ],
        doors=[
            Door(id="d1", x=2.5,  y=0.0,  width=0.9, orientation="south", connects_to="r1"),
            Door(id="d2", x=5.65, y=2.0,  width=0.9, orientation="east",  connects_to="r2"),
            Door(id="d3", x=2.0,  y=5.15, width=0.8, orientation="north", connects_to="r3"),
            Door(id="d4", x=4.15, y=5.15, width=0.8, orientation="north", connects_to="r4"),
        ],
        windows=[
            Window(id="w1", x=1.0, y=0.0, width=1.5, orientation="south"),
            Window(id="w2", x=6.5, y=0.0, width=1.5, orientation="south"),
            Window(id="w3", x=7.5, y=5.15, width=1.5, orientation="north"),
        ],
        balconies=[Balcony(id="b1", x=6.65, y=5.15, width=2.2, height=3.2)],
    )


def _2bhk_layout(bp_id: str, version: int) -> BlueprintAnalysisResult:
    return BlueprintAnalysisResult(
        blueprint_id=bp_id, unit_type="2 BHK", blueprint_version=version,
        provider="demo", is_demo=True,
        canvas_width=12.0, canvas_height=10.0,
        rooms=[
            Room(id="r1", name="Living Room",   type="living_room", x=0.15, y=0.15, width=5.5, height=5.5, area_sqft=325),
            Room(id="r2", name="Dining",         type="dining",     x=5.65, y=0.15, width=3.0, height=5.5, area_sqft=178),
            Room(id="r3", name="Master Bedroom", type="bedroom",    x=8.65, y=0.15, width=3.2, height=5.5, area_sqft=190),
            Room(id="r4", name="Bedroom 2",      type="bedroom",    x=0.15, y=5.65, width=3.8, height=4.2, area_sqft=172),
            Room(id="r5", name="Kitchen",        type="kitchen",    x=3.95, y=5.65, width=4.0, height=4.2, area_sqft=182),
            Room(id="r6", name="Bathroom 1",     type="bathroom",   x=7.95, y=5.65, width=2.2, height=2.0, area_sqft=48),
            Room(id="r7", name="Bathroom 2",     type="bathroom",   x=7.95, y=7.65, width=2.2, height=2.2, area_sqft=52),
            Room(id="r8", name="Balcony",        type="balcony",    x=10.15, y=5.65, width=1.7, height=4.2),
        ],
        walls=_perimeter_walls(12.0, 10.0) + [
            Wall(id="iw1", start_x=5.65, start_y=0.15, end_x=5.65, end_y=5.65, thickness=0.15),
            Wall(id="iw2", start_x=8.65, start_y=0.15, end_x=8.65, end_y=5.65, thickness=0.15),
            Wall(id="iw3", start_x=0.15, start_y=5.65, end_x=11.85, end_y=5.65, thickness=0.15),
            Wall(id="iw4", start_x=3.95, start_y=5.65, end_x=3.95, end_y=9.85, thickness=0.15),
            Wall(id="iw5", start_x=7.95, start_y=5.65, end_x=7.95, end_y=9.85, thickness=0.15),
            Wall(id="iw6", start_x=7.95, start_y=7.65, end_x=10.15, end_y=7.65, thickness=0.15),
            Wall(id="iw7", start_x=10.15, start_y=5.65, end_x=10.15, end_y=9.85, thickness=0.15),
        ],
        doors=[
            Door(id="d1", x=2.5,  y=0.0,  width=0.9, orientation="south", connects_to="r1"),
            Door(id="d2", x=5.65, y=2.5,  width=0.9, orientation="east",  connects_to="r2"),
            Door(id="d3", x=8.65, y=2.5,  width=0.9, orientation="east",  connects_to="r3"),
            Door(id="d4", x=2.0,  y=5.65, width=0.9, orientation="north", connects_to="r4"),
            Door(id="d5", x=5.5,  y=5.65, width=0.9, orientation="north", connects_to="r5"),
            Door(id="d6", x=7.95, y=6.0,  width=0.8, orientation="east",  connects_to="r6"),
            Door(id="d7", x=7.95, y=8.0,  width=0.8, orientation="east",  connects_to="r7"),
        ],
        windows=[
            Window(id="w1", x=1.5, y=0.0,  width=1.5, orientation="south"),
            Window(id="w2", x=9.5, y=0.0,  width=1.5, orientation="south"),
            Window(id="w3", x=1.5, y=9.85, width=1.5, orientation="north"),
            Window(id="w4", x=5.5, y=9.85, width=1.5, orientation="north"),
        ],
        balconies=[Balcony(id="b1", x=10.15, y=5.65, width=1.7, height=4.2)],
    )


def _3bhk_layout(bp_id: str, version: int) -> BlueprintAnalysisResult:
    return BlueprintAnalysisResult(
        blueprint_id=bp_id, unit_type="3 BHK", blueprint_version=version,
        provider="demo", is_demo=True,
        canvas_width=15.0, canvas_height=11.0,
        rooms=[
            Room(id="r1", name="Living Room",   type="living_room", x=0.15, y=0.15, width=6.0,  height=6.0,  area_sqft=387),
            Room(id="r2", name="Dining Room",    type="dining",     x=6.15, y=0.15, width=3.5,  height=4.5,  area_sqft=169),
            Room(id="r3", name="Kitchen",        type="kitchen",    x=9.65, y=0.15, width=5.2,  height=4.5,  area_sqft=251),
            Room(id="r4", name="Master Bedroom", type="bedroom",    x=0.15, y=6.15, width=5.0,  height=4.7,  area_sqft=253),
            Room(id="r5", name="Bedroom 2",      type="bedroom",    x=5.15, y=6.15, width=4.0,  height=4.7,  area_sqft=203),
            Room(id="r6", name="Bedroom 3",      type="bedroom",    x=9.15, y=6.15, width=4.0,  height=4.7,  area_sqft=203),
            Room(id="r7", name="Master Bath",    type="bathroom",   x=13.15,y=0.15, width=1.7,  height=4.5,  area_sqft=82),
            Room(id="r8", name="Common Bath",    type="bathroom",   x=13.15,y=6.15, width=1.7,  height=4.7,  area_sqft=86),
            Room(id="r9", name="Utility",        type="utility",    x=6.15, y=4.65, width=3.0,  height=1.5),
        ],
        walls=_perimeter_walls(15.0, 11.0) + [
            Wall(id="iw1", start_x=6.15,  start_y=0.15,  end_x=6.15,  end_y=6.15,  thickness=0.15),
            Wall(id="iw2", start_x=9.65,  start_y=0.15,  end_x=9.65,  end_y=6.15,  thickness=0.15),
            Wall(id="iw3", start_x=13.15, start_y=0.15,  end_x=13.15, end_y=10.85, thickness=0.15),
            Wall(id="iw4", start_x=0.15,  start_y=6.15,  end_x=14.85, end_y=6.15,  thickness=0.15),
            Wall(id="iw5", start_x=5.15,  start_y=6.15,  end_x=5.15,  end_y=10.85, thickness=0.15),
            Wall(id="iw6", start_x=9.15,  start_y=6.15,  end_x=9.15,  end_y=10.85, thickness=0.15),
            Wall(id="iw7", start_x=6.15,  start_y=4.65,  end_x=9.65,  end_y=4.65,  thickness=0.15),
        ],
        doors=[
            Door(id="d1", x=3.0,  y=0.0,  width=0.9, orientation="south", connects_to="r1"),
            Door(id="d2", x=6.15, y=2.5,  width=0.9, orientation="east"),
            Door(id="d3", x=9.65, y=2.0,  width=0.9, orientation="east",  connects_to="r3"),
            Door(id="d4", x=2.5,  y=6.15, width=0.9, orientation="north", connects_to="r4"),
            Door(id="d5", x=6.5,  y=6.15, width=0.9, orientation="north", connects_to="r5"),
            Door(id="d6", x=11.0, y=6.15, width=0.9, orientation="north", connects_to="r6"),
            Door(id="d7", x=13.15,y=1.5,  width=0.8, orientation="east",  connects_to="r7"),
            Door(id="d8", x=13.15,y=7.5,  width=0.8, orientation="east",  connects_to="r8"),
        ],
        windows=[
            Window(id="w1", x=1.5, y=0.0,  width=1.5, orientation="south"),
            Window(id="w2", x=7.5, y=0.0,  width=1.5, orientation="south"),
            Window(id="w3", x=11.0,y=0.0,  width=1.5, orientation="south"),
            Window(id="w4", x=2.0, y=10.85,width=1.5, orientation="north"),
            Window(id="w5", x=6.5, y=10.85,width=1.5, orientation="north"),
            Window(id="w6", x=11.0,y=10.85,width=1.5, orientation="north"),
        ],
        balconies=[Balcony(id="b1", x=0.15, y=10.35, width=12.85, height=0.65)],
    )


def _4bhk_layout(bp_id: str, version: int) -> BlueprintAnalysisResult:
    return BlueprintAnalysisResult(
        blueprint_id=bp_id, unit_type="4 BHK", blueprint_version=version,
        provider="demo", is_demo=True,
        canvas_width=18.0, canvas_height=13.0,
        rooms=[
            Room(id="r1",  name="Living Room",    type="living_room", x=0.15, y=0.15, width=7.0,  height=7.0,  area_sqft=527),
            Room(id="r2",  name="Dining Room",     type="dining",     x=7.15, y=0.15, width=4.5,  height=5.0,  area_sqft=242),
            Room(id="r3",  name="Kitchen",         type="kitchen",    x=11.65,y=0.15, width=6.2,  height=5.0,  area_sqft=334),
            Room(id="r4",  name="Bedroom 4",       type="bedroom",    x=7.15, y=5.15, width=4.5,  height=4.0,  area_sqft=193),
            Room(id="r5",  name="Bathroom 1",      type="bathroom",   x=11.65,y=5.15, width=2.0,  height=4.0,  area_sqft=86),
            Room(id="r6",  name="Master Bedroom",  type="bedroom",    x=0.15, y=7.15, width=5.5,  height=5.7,  area_sqft=337),
            Room(id="r7",  name="Bedroom 2",       type="bedroom",    x=5.65, y=7.15, width=4.5,  height=5.7,  area_sqft=275),
            Room(id="r8",  name="Bedroom 3",       type="bedroom",    x=10.15,y=7.15, width=4.5,  height=5.7,  area_sqft=275),
            Room(id="r9",  name="Master Bath",     type="bathroom",   x=14.65,y=7.15, width=3.2,  height=2.5,  area_sqft=86),
            Room(id="r10", name="Common Bath",     type="bathroom",   x=14.65,y=9.65, width=3.2,  height=3.2,  area_sqft=110),
            Room(id="r11", name="Utility",         type="utility",    x=13.65,y=5.15, width=4.2,  height=2.0),
        ],
        walls=_perimeter_walls(18.0, 13.0) + [
            Wall(id="iw1", start_x=7.15,  start_y=0.15,  end_x=7.15,  end_y=7.15,  thickness=0.15),
            Wall(id="iw2", start_x=11.65, start_y=0.15,  end_x=11.65, end_y=7.15,  thickness=0.15),
            Wall(id="iw3", start_x=7.15,  start_y=5.15,  end_x=11.65, end_y=5.15,  thickness=0.15),
            Wall(id="iw4", start_x=0.15,  start_y=7.15,  end_x=17.85, end_y=7.15,  thickness=0.15),
            Wall(id="iw5", start_x=5.65,  start_y=7.15,  end_x=5.65,  end_y=12.85, thickness=0.15),
            Wall(id="iw6", start_x=10.15, start_y=7.15,  end_x=10.15, end_y=12.85, thickness=0.15),
            Wall(id="iw7", start_x=14.65, start_y=7.15,  end_x=14.65, end_y=12.85, thickness=0.15),
            Wall(id="iw8", start_x=14.65, start_y=9.65,  end_x=17.85, end_y=9.65,  thickness=0.15),
            Wall(id="iw9", start_x=13.65, start_y=5.15,  end_x=13.65, end_y=7.15,  thickness=0.15),
            Wall(id="iw10",start_x=11.65, start_y=7.15,  end_x=13.65, end_y=7.15,  thickness=0.15),
        ],
        doors=[
            Door(id="d1", x=3.5,  y=0.0,  width=1.0, orientation="south", connects_to="r1"),
            Door(id="d2", x=7.15, y=2.5,  width=0.9, orientation="east",  connects_to="r2"),
            Door(id="d3", x=11.65,y=2.0,  width=0.9, orientation="east",  connects_to="r3"),
            Door(id="d4", x=8.5,  y=7.15, width=0.9, orientation="north", connects_to="r4"),
            Door(id="d5", x=11.65,y=6.0,  width=0.8, orientation="east",  connects_to="r5"),
            Door(id="d6", x=2.5,  y=7.15, width=0.9, orientation="north", connects_to="r6"),
            Door(id="d7", x=7.5,  y=7.15, width=0.9, orientation="north", connects_to="r7"),
            Door(id="d8", x=12.0, y=7.15, width=0.9, orientation="north", connects_to="r8"),
            Door(id="d9", x=14.65,y=8.0,  width=0.8, orientation="east",  connects_to="r9"),
            Door(id="d10",x=14.65,y=10.5, width=0.8, orientation="east",  connects_to="r10"),
        ],
        windows=[
            Window(id="w1", x=2.0,  y=0.0,  width=1.5, orientation="south"),
            Window(id="w2", x=9.0,  y=0.0,  width=1.5, orientation="south"),
            Window(id="w3", x=14.0, y=0.0,  width=1.5, orientation="south"),
            Window(id="w4", x=2.0,  y=12.85,width=1.5, orientation="north"),
            Window(id="w5", x=7.5,  y=12.85,width=1.5, orientation="north"),
            Window(id="w6", x=12.0, y=12.85,width=1.5, orientation="north"),
            Window(id="w7", x=16.5, y=9.0,  width=1.5, orientation="east"),
        ],
        balconies=[Balcony(id="b1", x=0.15, y=12.35, width=14.35, height=0.65)],
    )


def _perimeter_walls(w: float, h: float):
    """Generate four outer walls from canvas dimensions."""
    t = 0.15
    return [
        Wall(id="pw_south", start_x=0.0,   start_y=0.0,   end_x=w,    end_y=0.0,   thickness=t),
        Wall(id="pw_north", start_x=0.0,   start_y=h,     end_x=w,    end_y=h,     thickness=t),
        Wall(id="pw_west",  start_x=0.0,   start_y=0.0,   end_x=0.0,  end_y=h,     thickness=t),
        Wall(id="pw_east",  start_x=w,     start_y=0.0,   end_x=w,    end_y=h,     thickness=t),
    ]


# Map lower-case normalized unit type → layout function
_LAYOUTS = {
    "studio":  _studio_layout,
    "1 bhk":   _1bhk_layout,
    "2 bhk":   _2bhk_layout,
    "3 bhk":   _3bhk_layout,
    "4 bhk":   _4bhk_layout,
    "5 bhk":   _4bhk_layout,  # reuse 4BHK shape for unsupported sizes
}


class DemoAnalysisProvider(BlueprintAnalysisProvider):
    """
    DEMO AI provider — labelled as demo throughout the system.
    Returns a deterministic layout based on unit type.
    Identical input always produces identical output.
    """

    @property
    def provider_name(self) -> str:
        return "demo"

    @property
    def is_demo(self) -> bool:
        return True

    async def analyze(
        self,
        image_bytes: bytes,
        mime_type: str,
        blueprint_id: str,
        unit_type,
        blueprint_version: int,
    ) -> BlueprintAnalysisResult:
        # Normalise unit type key
        key = (unit_type or "").strip().lower()
        # Fall back to 2 BHK layout for unknown unit types or property-level blueprints
        layout_fn = _LAYOUTS.get(key, _2bhk_layout)
        return layout_fn(blueprint_id, blueprint_version)
