from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio
import httpx
import os
from dotenv import load_dotenv
from shapely.geometry import MultiPolygon, mapping, shape

from app.database import get_db
from app.crud import get_nearby_features
from app.schemas import BestDestinationRequest

router = APIRouter(prefix="/routing", tags=["routing"])
load_dotenv()
MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")


async def osrm_get(client, url, params, attempts=3):
    """The public OSRM demo server is free and shared, with no uptime guarantee --
    it intermittently drops connections for a few seconds at a time, which surfaced
    to users as random "Routing service unavailable" failures. Retry briefly before
    giving up, since a repeat request usually succeeds immediately."""
    for attempt in range(attempts):
        try:
            return await client.get(url, params=params)
        except httpx.RequestError:
            if attempt == attempts - 1:
                raise
            await asyncio.sleep(0.5 * (attempt + 1))


async def get_mapbox_traffic_duration(client, start_lng, start_lat, end_lng, end_lat):
    if not MAPBOX_ACCESS_TOKEN:
        return None
    try:
        url = f"https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{start_lng},{start_lat};{end_lng},{end_lat}"
        res = await client.get(url, params={"access_token": MAPBOX_ACCESS_TOKEN, "overview" : "false"})
        data = res.json()
        if data.get("code") != "Ok":
            return None
        route = data["routes"][0]
        return route["duration"], route.get("duration_typical", route["duration"])
    except(httpx.RequestError, KeyError, IndexError):
        return None


async def get_mapbox_traffic_matrix(client, coords, n_source):
    """coords is a flat list of (lng, lat) starting with the n_source origin
    points, followed by destination points. Mapbox's driving-traffic profile
    caps requests at 10 total coordinates, so callers must pre-filter down to
    that before calling this."""
    if not MAPBOX_ACCESS_TOKEN:
        return None
    try:
        coords_str = ";".join(f"{lng},{lat}" for lng, lat in coords)
        sources = ";".join(str(i) for i in range(n_source))
        destinations = ";".join(str(i) for i in range(n_source, len(coords)))
        url = f"https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/{coords_str}"
        params = {
            "access_token": MAPBOX_ACCESS_TOKEN,
            "sources": sources,
            "destinations": destinations,
            "annotations": "duration",
        }
        res = await client.get(url, params=params)
        if res.status_code != 200:
            return None
        data = res.json()
        if data.get("code") != "Ok":
            return None
        return data["durations"]  # [source_index][destination_index]
    except (httpx.RequestError, ValueError, KeyError, IndexError):
        return None


@router.get("/shortest-path")
async def shortest_path(
    start_lat: float, start_lng: float,
    end_lat: float, end_lng: float
):
    try:
        url = f"https://router.project-osrm.org/route/v1/driving/{start_lng},{start_lat};{end_lng},{end_lat}"
        params = {"overview": "full", "geometries": "geojson"}
        
        async with httpx.AsyncClient(timeout=15) as client:
            res = await osrm_get(client, url, params)
            data = res.json()
            traffic = await get_mapbox_traffic_duration(client, start_lng, start_lat, end_lng, end_lat)

        if data["code"] != "Ok":
            raise HTTPException(status_code=404, detail="Route not found")

        route = data["routes"][0]

        if traffic:
            duration_seconds, duration_typical_seconds = traffic
        else:
            duration_seconds, duration_typical_seconds = route["duration"], route["duration"]
        

        return {
            "distance_meters": route["distance"],
            "duration_seconds": duration_seconds,
            "geometry": route["geometry"],
            "duration_typical_seconds" : duration_typical_seconds,
            "traffic_adjusted" : bool(traffic)
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
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_db)
):
    candidates = await get_nearby_features(db, lat, lng, radius_m, category=category)
    if not candidates:
        return {"results": []}

    results = []
    async with httpx.AsyncClient(timeout=15) as client:
        for feature in candidates:
            url = f"https://router.project-osrm.org/route/v1/driving/{lng},{lat};{feature['lng']},{feature['lat']}"
            try:
                res = await osrm_get(client, url, {"overview": "false"})
                data = res.json()
                traffic = await get_mapbox_traffic_duration(client, lng, lat, feature['lng'], feature['lat'])
                if traffic:
                    driving_duration_s, driving_duration_typical_s = traffic
                else:
                    driving_duration_s, driving_duration_typical_s = data["routes"][0]["duration"], data["routes"][0]["duration"]
                if data.get("code") == "Ok":
                    results.append({
                        "id": feature["id"],
                        "name": feature["name"],
                        "address": feature["address"],
                        "category": feature["category"],
                        "lat": feature["lat"],
                        "lng": feature["lng"],
                        "straight_line_m": feature["straight_dist"],
                        "driving_distance_m": data["routes"][0]["distance"],
                        "driving_duration_s": driving_duration_s,
                        "driving_duration_typical_s" : driving_duration_typical_s,
                        "traffic_adjusted": bool(traffic)
                    })
                    
            except httpx.RequestError:
                continue

    return {"results": results}

@router.get("/isochrone")
async def isochrone(
    lat: float, lng: float,
    max_minutes: int = Query(15, ge=1, le=60),
    bands: int = Query(4, ge=1, le=4),
):
    """Drive-time isochrone from Mapbox's Isochrone API, which walks the real road
    network rather than sampling a grid, so the shape follows actual streets.

    Mapbox returns nested contours (the 15-minute polygon contains the 10-minute one).
    We subtract each contour from the next so the frontend receives disjoint bands and
    can paint them without the slower ones covering the faster ones.

    API limits, confirmed against the live service: at most 4 contours per request,
    and max_minutes cannot exceed 60.
    """
    if not MAPBOX_ACCESS_TOKEN:
        raise HTTPException(status_code=503, detail="Isochrone needs a Mapbox access token")

    # Evenly spaced thresholds up to the budget, e.g. 15 min / 4 bands -> 4, 8, 11, 15.
    minutes = sorted({max(1, round(max_minutes * (i + 1) / bands)) for i in range(bands)})

    url = f"https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/{lng},{lat}"
    params = {
        "contours_minutes": ",".join(str(m) for m in minutes),
        "polygons": "true",
        "access_token": MAPBOX_ACCESS_TOKEN,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(url, params=params)
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Isochrone service unavailable")

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="Isochrone calculation failed")

    data = res.json()
    contours = data.get("features") or []
    if not contours:
        raise HTTPException(status_code=404, detail="No reachable area found")

    # Mapbox hands these back slowest-first; go fastest-first so band 0 is the quick core.
    contours.sort(key=lambda f: f["properties"]["contour"])

    features = []
    previous = None
    previous_minutes = 0
    for f in contours:
        band = shape(f["geometry"])
        # Subtracting the previous contour turns the nested polygon into a ring covering
        # only the time actually spanned by this band.
        ring = band if previous is None else band.difference(previous)
        previous = band

        this_minutes = f["properties"]["contour"]
        if not ring.is_empty:
            polygons = list(ring.geoms) if ring.geom_type == "MultiPolygon" else [ring]
            features.append({
                "type": "Feature",
                "properties": {
                    "min_duration_s": previous_minutes * 60,
                    "max_duration_s": this_minutes * 60,
                },
                "geometry": mapping(MultiPolygon(polygons)),
            })
        previous_minutes = this_minutes

    return {"type": "FeatureCollection", "features": features}


def _sort_key(mode):
    if mode == "efficient":
        # Rank on the total the UI actually displays -- per-origin minutes, rounded the
        # same way the frontend rounds them -- rather than raw seconds. Two candidates
        # that both read as "20 min total" on screen should count as tied and then be
        # decided by whichever splits the trip more evenly (the lower max). Comparing
        # raw seconds instead lets a sub-minute difference decide the winner outright,
        # so the max tiebreak never runs and the more lopsided option can rank higher.
        return lambda r: (
            sum(round(d / 60) for d in r["durations_s"]),
            max(r["durations_s"]),
        )
    return lambda r: r["durations_s"] # "priority": lexicographic, origin_a first

@router.post("/best-destination")
async def best_destination(
    data: BestDestinationRequest,
    db: AsyncSession = Depends(get_db)
):
    """Ranks facilities of a category by combined travel time from two or more starting
    points (e.g. "best hospital for both a mother and her child at school"). The first
    origin in the list is the primary — ties on its travel time are broken by the next
    origin, and so on."""
    if len(data.origins) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two origins to compare.")

    # Search around each origin separately and union the results by id, so a
    # candidate close to one person but outside another's radius isn't missed.
    candidates_by_id = {}
    for origin in data.origins:
        found = await get_nearby_features(db, origin.lat, origin.lng, data.radius_m, category=data.category.value)
        for f in found:
            candidates_by_id[f["id"]] = f

    if not candidates_by_id:
        return {"origins": [o.model_dump() for o in data.origins], "results": []}

    candidates = list(candidates_by_id.values())

    # One OSRM Table request gets every origin's duration to every candidate,
    # instead of an origin x candidate loop of /route calls.
    coords = [(o.lng, o.lat) for o in data.origins] + [(c["lng"], c["lat"]) for c in candidates]
    coords_str = ";".join(f"{lng},{lat}" for lng, lat in coords)
    n_origins = len(data.origins)
    sources = ";".join(str(i) for i in range(n_origins))
    destinations = ";".join(str(i) for i in range(n_origins, n_origins + len(candidates)))

    url = f"https://router.project-osrm.org/table/v1/driving/{coords_str}"
    params = {"sources": sources, "destinations": destinations, "annotations": "duration"}

    traffic_adjusted = False
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            res = await osrm_get(client, url, params)
            table = res.json()
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="Routing service unavailable")

        if table.get("code") != "Ok":
            raise HTTPException(status_code=502, detail="Could not compute travel times between origins and candidates")

        durations = table["durations"]  # [origin_index][candidate_index]

        results = []
        for j, c in enumerate(candidates):
            per_origin = [durations[i][j] for i in range(n_origins)]
            if any(d is None for d in per_origin):
                continue  # unreachable by road from at least one origin
            results.append({
                "id": c["id"],
                "name": c["name"],
                "address": c["address"],
                "category": c["category"],
                "lat": c["lat"],
                "lng": c["lng"],
                "durations_s": per_origin,
            })

        # List comparison in Python is lexicographic: this sorts by origins[0]'s
        # duration first, only falling through to origins[1] etc. to break ties.
        results.sort(key= _sort_key(data.mode))

        # Mapbox's driving-traffic matrix profile caps requests at 10 total
        # coordinates (origins + destinations combined), so only the OSRM-best
        # candidates get refined with real traffic data instead of the whole list.
        max_candidates = max(10 - n_origins, 0)
        top_results = results[:max_candidates]

        if top_results:
            traffic_coords = [(o.lng, o.lat) for o in data.origins] + [(r["lng"], r["lat"]) for r in top_results]
            matrix = await get_mapbox_traffic_matrix(client, traffic_coords, n_origins)
            if matrix:
                traffic_adjusted = True
                for j, r in enumerate(top_results):
                    row = [matrix[i][j] for i in range(n_origins)]
                    if all(d is not None for d in row):
                        r["durations_s"] = row
                top_results.sort(key=_sort_key(data.mode))

    return {
        "origins": [o.model_dump() for o in data.origins],
        "results": top_results,
        "traffic_adjusted": traffic_adjusted,
    }