import os
from dotenv import load_dotenv

load_dotenv()

AI_PROVIDER: str = os.getenv("AI_PROVIDER", "demo")
AI_SERVICE_PORT: int = int(os.getenv("AI_SERVICE_PORT", "8000"))

# Real provider keys (configurable via environment variables)
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")
