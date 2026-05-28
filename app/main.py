from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import features
from app.database import engine, Base
from app.routers import geocoding
from app.routers import spatial
from app.routers import viewshed
from app.routers import routing


app = FastAPI(title="OpenGIS API")
app.include_router(features.router)
app.include_router(geocoding.router)
app.include_router(spatial.router)
app.include_router(viewshed.router)
app.include_router(routing.router)

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