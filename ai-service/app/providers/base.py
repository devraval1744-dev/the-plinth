"""
Abstract base class for all AI blueprint analysis providers.
Swap the implementation in provider_factory.py to change vendors.
"""
from abc import ABC, abstractmethod
from typing import Optional

from app.schemas.spatial import BlueprintAnalysisResult


class BlueprintAnalysisProvider(ABC):
    """
    All providers must implement this interface.
    The Express backend communicates only through this contract.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Short identifier shown in UI, e.g. 'demo' or 'openai'."""
        ...

    @property
    @abstractmethod
    def is_demo(self) -> bool:
        """True when not using real AI — UI must clearly disclose this."""
        ...

    @abstractmethod
    async def analyze(
        self,
        image_bytes: bytes,
        mime_type: str,
        blueprint_id: str,
        unit_type: Optional[str],
        blueprint_version: int,
    ) -> BlueprintAnalysisResult:
        """
        Analyse a blueprint image/PDF and return structured spatial JSON.
        Raises ValueError for unsupported input.
        Raises RuntimeError for provider-side failures.
        """
        ...
