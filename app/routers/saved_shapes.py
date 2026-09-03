from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from geoalchemy2.functions import ST_AsGeoJSON
from geoalchemy2.shape import from_shape
from shapely.geometry import shape
import json

from app.database import get_db
from app.models import SavedShape
from app.schemas import SavedShapeCreate, SavedShapeOut, SavedShapeRename

router = APIRouter(prefix="/shapes", tags=["shapes"])

@router.post("/")
async def create_shape(data: SavedShapeCreate, db: AsyncSession = Depends(get_db)):
    geom = from_shape(shape(data.geometry), srid= 4326)
    feature = SavedShape(name= data.name,geometry= geom, kind= data.kind, color= data.color)
    db.add(feature)
    await db.commit()

    result = await db.execute(
        select(
            SavedShape.id,
            SavedShape.name,
            SavedShape.kind,
            SavedShape.color,
            ST_AsGeoJSON(SavedShape.geometry).label("geometry")
        ).where(SavedShape.id == feature.id)
    )
    row = result.one()
    return{"id": row.id, "name": row.name, "kind": row.kind, "color": row.color, "geometry": json.loads(row.geometry)}

    
@router.get("/", response_model=list[SavedShapeOut])
async def list_shapes(db: AsyncSession= Depends(get_db)):
    result = await db.execute(
        select(

            SavedShape.id,
            SavedShape.name,
            SavedShape.kind,
            SavedShape.color,
            ST_AsGeoJSON(SavedShape.geometry).label("geometry"),
        )
    )
    rows = result.all()
    return[{"id": r.id, "name": r.name,"kind": r.kind, "color": r.color, "geometry": json.loads(r.geometry)} for r in rows]



@router.patch("/{shape_id}")
async def rename_shape(shape_id: int, data: SavedShapeRename, db: AsyncSession = Depends(get_db)):
    row = await db.get(SavedShape, shape_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Shape not found")
    row.name = data.name
    await db.commit()
    return {"id": shape_id, "name": data.name}

@router.delete("/{shape_id}")
async def delete_shape(shape_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(SavedShape, shape_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Shape not found")
    await db.delete(row)
    await db.commit()
    return {"deleted": shape_id}