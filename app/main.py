import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import features
from app.database import engine, Base
from app.routers import geocoding
from app.routers import spatial
from app.routers import viewshed
from app.routers import routing
from app.routers import assistant
from app.routers import saved_shapes

# Without this, uvicorn leaves the root logger unconfigured and anything the app
# logs below WARNING is silently dropped.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

app = FastAPI(title="OpenGIS API")
app.include_router(features.router)
app.include_router(geocoding.router)
app.include_router(spatial.router)
app.include_router(viewshed.router)
app.include_router(routing.router)
app.include_router(assistant.router)
app.include_router(saved_shapes.router)


app.add_middleware(
    CORSMiddleware,
    allow_origins= ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@app.get("/health")
async def health():
    return {"status": "ok"}