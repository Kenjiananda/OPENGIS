import os
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from google import genai
from google.genai import types
from typing import Literal

from app.schemas import AssistantQuery, AssistantAction

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

router = APIRouter(prefix="/assistant", tags=["assistant"])


def create_buffer(location: str, distance_meters: int) -> str:
    """Creates a circular buffer zone around a location.

    Args:
        location: The place name or address to center the buffer on.
        distance_meters: The radius of the buffer in meters.
    """
    return "not executed here — resolved by the caller"


def no_action(reason: str) -> str:
    """Use this when the user's message is not a spatial/GIS request the assistant can act on.

    Args:
        reason: A short explanation of why no spatial action applies (e.g. general chit-chat, an unrelated question).
    """
    return "no action taken"


def geocode(location: str) -> str:
    """Finds and shoes the location of a place, address, location of the user right now(eg. where am i?), or landmark on the map -
    use this when the user just wants to see or locate somewhere, not perform a
    buffer, route, or spatial analysis.

    Args:
        location: The place name or address to look up and show on the map
    """
    return "not executed here - resolved by caller"

def viewshed(location: str, radius_meters:int = 1000, observer_height: float = 1.75 ) -> str:
    """Shows the visible area(viewshed) from an observer position, accounting for terrain elevation.

        Args:
            location: The place name or address to use as the observer position.
            radius_meters: how far out to analyze visibility, in meters.
            observer_height: The observer's height above ground, in meters.
    """
    return "not executed here - resolved by the caller"    

def find_route(end_location: str, start_location: str = "") -> str:
    """Finds and shows the driving route between two specific, named locations, and the time needed to commute.
    Only use this when the user names a specific destination to travel to. Do NOT use this for "nearest/closest X"
    requests (e.g. "nearest police station"), even if the phrasing includes the word "from" — use find_nearby_features instead.

        Args: 
            end_location: the destination.
            start_location: the starting point. leave empty if the user wants to start from their current location.
    """
    return "not executed here - resolved by the caller"

def isochrone(location: str, radius_km: int = 3) -> str:
    """Shows an approximate drive-time coverage area around a location.

    Args:
        location: The place name or address to use as the starting point.
        radius_km: The rough drive-time radius to visualize, in kilometers.
    """
    return "not executed here — resolved by the caller"


def find_nearby_features(
    category: str,
    location: str = "",
    radius_meters: int = 5000,
) -> str:
    """Finds real-world features of a given category near a location — e.g. hospitals, police stations, or fire departments.
    Use this for "nearest", "closest", or "find X near Y" requests, even if the phrasing includes the word "from"
    (e.g. "nearest police station from Taipei 101" means: search for police stations near Taipei 101 — not a route).

    Args:
        category: The type of feature to search for. Must be exactly one of: hospital, police_station, fire_department.
        location: The place name or address to search around. Leave empty to search near the user's current location.
        radius_meters: How far to search, in meters.
    """
    return "not executed here — resolved by the caller"


SYSTEM_INSTRUCTION = (
    "You are a GIS assistant, you have no ability to perform spatial operations "
    "yourself — you cannot create buffers, routes, or any map data on your own. "
    "Whenever the user requests a spatial operation, you must call the appropriate "
    "tool function. Never claim you performed an action unless you actually called a tool for it."
)


@router.post("/query", response_model=AssistantAction)
async def query_assistant(data: AssistantQuery):
    try:
        response = await client.aio.models.generate_content(
            model="gemini-flash-lite-latest",
            contents=data.message,
            config=types.GenerateContentConfig(
                tools=[create_buffer, no_action, geocode, viewshed, find_route, isochrone, find_nearby_features, ],
                system_instruction=SYSTEM_INSTRUCTION,
                tool_config=types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(mode="ANY")
                ),
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Assistant request failed: {e}")

    if not response.function_calls:
        raise HTTPException(status_code=502, detail="Assistant did not return a tool call")

    call = response.function_calls[0]
    return {"action": call.name, "params": call.args}
