from fastapi import APIRouter, HTTPException
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from geopy.extra.rate_limiter import RateLimiter
router = APIRouter(prefix= "/geocode", tags=["geocoding"])

geolocator = Nominatim(user_agent= "opengis_kenji_gis", timeout=15, domain="Nominatim.openstreetmap.org")
geocode = RateLimiter(geolocator.geocode, min_delay_seconds= 1)
reverse_geocode_limited = RateLimiter(geolocator.reverse, min_delay_seconds=1)

# This app only has data for Taipei City and New Taipei City. New Taipei wraps around
# Taipei City, so this one box covers both, with a little padding at the edges.
# Ordered (south-west, north-east) as (lat, lng) pairs, which is what geopy expects.
TAIPEI_VIEWBOX = [(24.65, 121.25), (25.32, 122.05)]
VIEWBOX_SW, VIEWBOX_NE = TAIPEI_VIEWBOX


def _inside_coverage(lat: float, lng: float) -> bool:
    return (VIEWBOX_SW[0] <= lat <= VIEWBOX_NE[0]
            and VIEWBOX_SW[1] <= lng <= VIEWBOX_NE[1])


@router.get("/forward") 
async def forward_geocode(address: str):
    import re
    if re.match(r'^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$', address.strip()):
        raise HTTPException(
            status_code=400,
            detail = "Input looks like coordinate. use /geocode/reverse instead."
        )
    try:
        # The viewbox is a ranking *preference*, not a hard filter. bounded=True was
        # tried and is actively harmful: searching "Hualien" then matched a Xinzhuang
        # government office whose name happens to contain the character, silently
        # sending the user to a random New Taipei address instead of telling them
        # Hualien is out of range. Letting Nominatim find what the user actually meant
        # and rejecting it afterwards gives an honest answer, and in-region queries
        # resolve identically either way.
        location = geocode(
            address,
            viewbox=TAIPEI_VIEWBOX,
            country_codes="tw",
        )
        if not location:
            raise HTTPException(status_code=404, detail=f"Could not find '{address}'.")
        if not _inside_coverage(location.latitude, location.longitude):
            # Nominatim addresses end "..., 鼓山區, 高雄市, 804, 臺灣", so the second-to-last
            # part is often the postcode. Pick the city/county component instead.
            parts = [p.strip() for p in location.address.split(",")]
            where = next(
                (p for p in reversed(parts) if p.endswith(("市", "縣")) or "City" in p or "County" in p),
                parts[-1] if parts else location.address,
            )
            raise HTTPException(
                status_code=404,
                detail=f"'{address}' is in {where}, outside this app's coverage of Taipei and New Taipei.",
            )
        return{
            "address" : location.address,
            "latitude": location.latitude,
            "longitude": location.longitude,
            "geojson": {
                "type": "Point",
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
        location = reverse_geocode_limited(f"{latitude}, {longitude}")
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
    