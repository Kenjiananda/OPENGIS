from fastapi import APIRouter, HTTPException
from shapely.geometry import shape, mapping
from shapely.ops import transform
from pyproj import Transformer

router = APIRouter(prefix="/spatial", tags=["spatial analysis"])

@router.post("/buffer")
async def buffer(geometry: dict, distance_meters: float):
    try:
        geom = shape(geometry)

        transformer_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32748", always_xy=True)
        transformer_to_wgs = Transformer.from_crs("EPSG:32748", "EPSG:4326", always_xy=True)

        geom_utm = transform(transformer_to_utm.transform, geom)
        buffered_utm = geom_utm.buffer(distance_meters)
        buffered_wgs = transform(transformer_to_wgs.transform, buffered_utm)

        return {
            "type": "buffer",
            "distance_meters": distance_meters,
            "geometry": mapping(buffered_wgs)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))(status_code=400, fetail=str(e))
    
@router.post("/intersect")
async def intersect(geometry1: dict, geometry2: dict):
    try:
        geom1 = shape(geometry1)
        geom2 = shape(geometry2)
        result = geom1.intersection(geom2)
        if result.is_empty:
            raise HTTPException(status_code=404, detail="no intersection found between the two geometries")
        return{
        "type": "intersection",
        "geometry": mapping(result)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/union")
async def union(geometry1: dict, geometry2: dict):
    try:
        geom1 = shape(geometry1)
        geom2 = shape(geometry2)
        result = geom1.union(geom2)
        return{
            "type": "union",
            "geometry": mapping(result)
        }
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