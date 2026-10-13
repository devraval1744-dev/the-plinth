from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app import config

app = FastAPI(
    title="Plinth AI Service",
    description="Blueprint analysis — structured spatial JSON generation",
    version="1.0.0",
)

# Only Express backend should call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5001"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(router)
