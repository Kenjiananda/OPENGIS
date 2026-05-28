from fastapi import APIRouter, HTTPException
import httpx

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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))