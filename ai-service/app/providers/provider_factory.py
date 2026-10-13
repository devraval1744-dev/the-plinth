"""
Returns the configured AI provider based on AI_PROVIDER env var.

Available providers:
  demo            — static per-BHK-type layouts (original Day 5 provider)
  image_aware     — derives layout from the actual uploaded image (default)

To add a real vision AI provider: implement it and register below.
"""
from app import config
from app.providers.base import BlueprintAnalysisProvider
from app.providers.demo_provider import DemoAnalysisProvider
from app.providers.image_aware_provider import ImageAwareProvider


def get_provider() -> BlueprintAnalysisProvider:
    provider_name = config.AI_PROVIDER.lower().strip()

    if provider_name == "demo":
        return DemoAnalysisProvider()

    if provider_name in ("image_aware", "image_aware_demo"):
        return ImageAwareProvider()

    # Future real providers — implement and register here
    # if provider_name == "openai":
    #     from app.providers.openai_provider import OpenAIProvider
    #     return OpenAIProvider(api_key=config.OPENAI_API_KEY, model=config.OPENAI_MODEL)

    raise ValueError(
        f"Unknown AI provider: '{provider_name}'. "
        f"Supported: demo, image_aware"
    )
