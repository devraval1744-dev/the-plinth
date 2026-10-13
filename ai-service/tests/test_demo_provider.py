"""Tests for the demo AI provider and validator."""
import pytest
import asyncio
from app.providers.demo_provider import DemoAnalysisProvider
from app.services.validator import validate_analysis


@pytest.fixture
def provider():
    return DemoAnalysisProvider()


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_provider_is_demo(provider):
    assert provider.is_demo is True
    assert provider.provider_name == "demo"


@pytest.mark.parametrize("unit_type", ["2 BHK", "3 BHK", "4 BHK", "1 BHK", "Studio"])
def test_returns_valid_result_for_known_types(provider, unit_type):
    result = run(provider.analyze(b"fake", "image/png", "bp1", unit_type, 1))
    assert result.blueprint_id == "bp1"
    assert result.blueprint_version == 1
    assert result.unit_type == unit_type
    assert result.canvas_width > 0
    assert result.canvas_height > 0
    assert len(result.rooms) > 0
    assert result.is_demo is True
    assert result.provider == "demo"


def test_deterministic_same_input_same_output(provider):
    r1 = run(provider.analyze(b"img", "image/png", "bp42", "2 BHK", 3))
    r2 = run(provider.analyze(b"img", "image/png", "bp42", "2 BHK", 3))
    assert r1.model_dump() == r2.model_dump()


def test_different_unit_types_have_different_layouts(provider):
    r2 = run(provider.analyze(b"x", "image/png", "bp1", "2 BHK", 1))
    r3 = run(provider.analyze(b"x", "image/png", "bp1", "3 BHK", 1))
    assert r2.canvas_width != r3.canvas_width or r2.canvas_height != r3.canvas_height


def test_version_preserved(provider):
    r = run(provider.analyze(b"x", "image/png", "bp5", "2 BHK", 7))
    assert r.blueprint_version == 7


def test_unknown_unit_type_falls_back_gracefully(provider):
    r = run(provider.analyze(b"x", "image/png", "bp1", "99 BHK", 1))
    assert len(r.rooms) > 0  # falls back to 2 BHK layout


def test_validator_passes_valid_result(provider):
    r = run(provider.analyze(b"x", "image/png", "bp1", "2 BHK", 1))
    validate_analysis(r)   # must not raise


def test_validator_rejects_empty_rooms():
    from app.schemas.spatial import BlueprintAnalysisResult
    r = BlueprintAnalysisResult(
        blueprint_id="x", blueprint_version=1, provider="demo", is_demo=True,
        canvas_width=10, canvas_height=10, rooms=[], walls=[], doors=[], windows=[]
    )
    with pytest.raises(ValueError, match="no rooms"):
        validate_analysis(r)


def test_validator_rejects_zero_canvas():
    from app.schemas.spatial import BlueprintAnalysisResult, Room
    with pytest.raises(Exception):
        BlueprintAnalysisResult(
            blueprint_id="x", blueprint_version=1, provider="demo", is_demo=True,
            canvas_width=0, canvas_height=10,
            rooms=[Room(id="r1", name="Test", type="living_room", x=0, y=0, width=5, height=5)]
        )
