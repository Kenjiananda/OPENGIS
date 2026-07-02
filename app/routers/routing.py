from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.database import get_db
from app.crud import get_nearby_features

router = APIRouter(prefix="/routing", tags=["routing"])

@router.get("/shortest-path")
async def shortest_path(
    start_lat: float, start_lng: float,
    end_lat: float, end_lng: float
):
    try:
        url = f"http://router.project-osrm.org/route/v1/driving/{start_lng},{start_lat};{end_lng},{end_lat}"
        params = {"overview": "full", "geometries": "geojson"}
        
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(url, params=params)
            data = res.json()

        if data["code"] != "Ok":
            raise HTTPException(status_code=404, detail="Route not found")

        route = data["routes"][0]
        return {
            "distance_meters": route["distance"],
            "duration_seconds": route["duration"],
            "geometry": route["geometry"]
        }
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Routing service unavailable")
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Unexpected response from routng service")
    
@router.get("/nearby-routes")
async def nearby_routes(
    lat: float = Query(..., ge=-90, le=90),
    lng: float= Query(..., ge=-180, le=180),
    radius_m: float = Query(5000, gt= 0, le=50000),
    db: AsyncSession = Depends(get_db)
):
    candidates = await get_nearby_features(db, lat, lng, radius_m)
    if not candidates:
        return {"results": []}

    results = []
    async with httpx.AsyncClient(timeout=15) as client:
        for feature in candidates:
            url = f"http://router.project-osrm.org/route/v1/driving/{lng},{lat};{feature['lng']},{feature['lat']}"
            try:
                res = await client.get(url, params={"overview": "false"})
                data = res.json()
                if data.get("code") == "Ok":
                    results.append({
                        "id": feature["id"],
                        "name": feature["name"],
                        "straight_line_m": feature["straight_dist"],
                        "driving_distance_m": data["routes"][0]["distance"],
                        "driving_duration_s": data["routes"][0]["duration"],
                    })
            except httpx.RequestError:
                continue

    return {"results": results}