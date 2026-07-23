from fastapi import APIRouter, HTTPException, Body
from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union
from pyproj import Transformer

router = APIRouter(prefix="/spatial", tags=["spatial analysis"])


transformer_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32748", always_xy=True)
transformer_to_wgs = Transformer.from_crs("EPSG:32748", "EPSG:4326", always_xy=True)

@router.post("/buffer")
async def buffer(geometry: dict, distance_meters: float):
    try:
        geom = shape(geometry)

        geom_utm = transform(transformer_to_utm.transform, geom)
        buffered_utm = geom_utm.buffer(distance_meters)
        buffered_wgs = transform(transformer_to_wgs.transform, buffered_utm)

        return {
            "type": "buffer",
            "distance_meters": distance_meters,
            "geometry": mapping(buffered_wgs)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.post("/intersect")
async def intersect(geometries: list[dict] = Body(embed=True)):
    try:
        if len(geometries) < 2:
            raise HTTPException(status_code=400, detail="At least 2 geometries are required")
        geoms = [shape(g) for g in geometries]
        result = geoms[0]
        for geom in geoms[1:]:
            result = result.intersection(geom)
        if result.is_empty:
            raise HTTPException(status_code=404, detail="no intersection found between the geometries")
        return{
        "type": "intersection",
        "geometry": mapping(result)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/union")
async def union(geometries: list[dict] = Body(embed=True)):
    try:
        if len(geometries) < 2:
            raise HTTPException(status_code=400, detail="At least 2 geometries are required")
        geoms = [shape(g) for g in geometries]
        result = unary_union(geoms)
        return{
            "type": "union",
            "geometry": mapping(result)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/transform")
async def transform_coordinates(
    latitude: float,
    longtitude: float,
    from_crs: str= "EPSG:4326",
    to_crs: str="EPSG:32748"
):
    
    try:
        transformer = Transformer.from_crs(from_crs, to_crs, always_xy=True)
        x, y = transformer.transform(longtitude, latitude)
        return{
            "original":{
                "latitude": latitude,
                "longitude": longtitude,
                "crs": from_crs
            },
            "transformed":{
                "x": x,
                "y": y,
                "crs": to_crs
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))