from fastapi import APIRouter, HTTPException
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from geopy.extra.rate_limiter import RateLimiter
router = APIRouter(prefix= "/geocode", tags=["geocoding"])

geolocator = Nominatim(user_agent= "opengis_kenji_gis", timeout=15, domain="Nominatim.openstreetmap.org")
geocode = RateLimiter(geolocator.geocode, min_delay_seconds= 1)
@router.get("/forward") 
async def forward_geocode(address: str):
    import re
    if re.match(r'^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$', address.strip()):
        raise HTTPException(
            status_code=400,
            detail = "Input looks like coordinate. use /geocode/reverse instead."
        )
    try:
        location = geocode(address)
        if not location:
            raise HTTPException(status_code=404, detail="Address not found")
        return{
            "address" : location.address,
            "latitude": location.latitude,
            "longitude": location.longitude,
            "geojson": {
                "type": "point",
                "coordinates": [location.longitude, location.latitude]
            }
        }
    except GeocoderTimedOut:
        raise HTTPException(status_code=408, detail="Geocoding service timed out")
    except GeocoderServiceError:
        raise HTTPException(status_code=503, detail="Geocoding service Unavailable")
    
@router.get("/reverse")
async def reverse_geocode(latitude: float, longitude: float):
    try:
        location = geolocator.reverse(f"{latitude}, {longitude}")
        if not location:
            raise HTTPException(status_code=404, detail="Location not found")
        return{
            "address": location.address,
            "latitude": location.latitude,
            "longitude": location.longitude
        }
    except GeocoderTimedOut:
        raise HTTPException(status_code=408, detail="Geocoding service timed out")
    except GeocoderServiceError:
        raise HTTPException(status_code=503, detail="Geocoding service Unavailable")
    