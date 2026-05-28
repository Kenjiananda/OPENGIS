from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from geoalchemy2.functions import ST_AsGeoJSON
from geoalchemy2.shape import from_shape
from shapely.geometry import shape
import json

from app.database import get_db
from app.models import SpatialFeature
from app.schemas import FeatureCreate, FeatureOut

router = APIRouter(prefix="/features", tags=["features"])

@router.post("/")
async def create_feature(data: FeatureCreate, db: AsyncSession = Depends(get_db)):
    geom = from_shape(shape(data.geometry), srid=4326)
    feature = SpatialFeature(name=data.name, geometry=geom)
    db.add(feature)
    await db.commit()

    result = await db.execute(
        select(
            SpatialFeature.id,
            SpatialFeature.name,
            ST_AsGeoJSON(SpatialFeature.geometry).label("geometry")
        ).where(SpatialFeature.id == feature.id)
    )
    row = result.one()
    return {"id": row.id, "name": row.name, "geometry": json.loads(row.geometry)}

@router.get("/", response_model=list[FeatureOut])
async def list_features(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            SpatialFeature.id,
            SpatialFeature.name,
            ST_AsGeoJSON(SpatialFeature.geometry).label("geometry")

        )
    )
    rows = result.all()
    return [{"id": r.id, "name": r.name, "geometry": json.loads(r.geometry)}for r in rows]
