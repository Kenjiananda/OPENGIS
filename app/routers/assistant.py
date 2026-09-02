import logging
import os
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from google import genai
from google.genai import types

from app.schemas import AssistantQuery, AssistantAction

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["assistant"])


def create_buffer(location: str, distance_meters: int) -> str:
    """Creates a circular buffer zone around a location.

    Args:
        location: The place name or address to center the buffer on.
        distance_meters: The radius of the buffer in meters.
    """
    return "not executed here — resolved by the caller"


def create_buffers(locations: list[str], distances_meters: list[int], operation: str = "none") -> str:
    """Creates multiple buffer zones at once, one per location, then optionally combines them into
    a single shape. Use this whenever the user names two or more locations to buffer in one request
    (e.g. "buffer 500m around point A and 300m around point B, then union them"). locations[i] and
    distances_meters[i] are paired by position — both lists must be the same length.

    Args:
        locations: The place names or addresses to center each buffer on, in order.
        distances_meters: The radius of each buffer in meters, in the same order as locations.
        operation: What to do with the buffers after creating them. Must be exactly one of:
            "union" (merge them into one shape covering their combined area), "intersect" (keep only
            the area shared by all of them), or "none" (leave them as separate individual buffers —
            this is the default when the user doesn't ask for them to be combined).
    """
    return "not executed here — resolved by the caller"


def no_action(reason: str) -> str:
    """Use this when the user's message is not a spatial/GIS request the assistant can act on.

    Args:
        reason: A short explanation of why no spatial action applies (e.g. general chit-chat, an unrelated question).
    """
    return "no action taken"


def geocode(location: str = "") -> str:
    """Finds and shows the location of a place, address, or landmark on the map -
        use this when the user just wants to see or locate somewhere, not perform a
        buffer, route, or spatial analysis. Leave location empty when the user is asking
        about their own current position (e.g. "where am I?", "show my location").

    Args:
        location: The place name or address to look up and show on the map. Leave empty for the user's own current location.
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
    """Finds real-world features of a given category near ONE location — e.g. hospitals, police
    stations, or fire departments. Use this for "nearest", "closest", or "find X near Y" requests,
    even if the phrasing includes the word "from" (e.g. "nearest police station from Taipei 101"
    means: search for police stations near Taipei 101 — not a route).

    IMPORTANT — only use this tool when the message involves a single location. If the message
    mentions two different people or two different starting points (e.g. "my son is at Ximen and
    I'm at Songshan Airport"), you must use find_best_destination instead, even when the user asks
    for the "closest" or "nearest" one and even when only one person's travel time matters. The
    number of locations mentioned decides the tool; words like "closest" do not.

    Args:
        category: The type of feature to search for. Must be exactly one of: hospital, police_station, fire_department.
        location: The place name or address to search around. Leave empty to search near the user's current location.
        radius_meters: How far to search, in meters.
    """
    return "not executed here — resolved by the caller"


def find_best_destination(
    category: str,
    origin_a: str = "",
    origin_b: str = "",
    radius_meters: int = 5000,
    mode: str = "priority",
) -> str:
    """Use this tool whenever the message mentions TWO different people or two different starting
    locations and asks for one place to go — regardless of whether the user says "closest",
    "best", "convenient", or "for both of us". This is the correct tool even when only one
    person's travel time actually matters; that case is handled by mode="priority" below.

    Examples that belong here:
    - "my son got hurt near Ximen, I'm at Songshan Airport, get me the closest hospital to him"
      -> mode="priority", origin_a="Ximen" (the person who matters), origin_b="Songshan Airport"
    - "find a hospital that works for both of us, I'm at Taipei 101 and she's near NTU"
      -> mode="efficient"

    Ranking modes:
    - "priority": minimizes origin_a's travel time above all else — origin_b only breaks ties.
      Use this whenever one person is urgent, hurt, sick, or otherwise matters most. Always put
      that person in origin_a.
    - "efficient": minimizes the combined total travel time for both people. Use this when there
      is no urgency, or the user wants the best overall option for both.

    Args:
        category: The type of feature to search for. Must be exactly one of: hospital, police_station, fire_department.
        origin_a: The primary person's starting location — in "priority" mode this is the person whose travel time is minimized. Leave empty for the user's own current location.
        origin_b: The second person's starting location. Leave empty for the user's own current location.
        radius_meters: How far to search around each origin, in meters.
        mode: Must be exactly one of: priority, efficient.
    """
    return "not executed here — resolved by the caller"


SYSTEM_INSTRUCTION = (
    "You are a GIS assistant, you have no ability to perform spatial operations "
    "yourself, you cannot create buffers, routes, or any map data on your own. "
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
                tools=[create_buffer, create_buffers, no_action, geocode, viewshed, find_route, isochrone, find_nearby_features, find_best_destination, ],
                system_instruction=SYSTEM_INSTRUCTION,
                tool_config=types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(mode="ANY")
                ),
            ),
        )
    except Exception as e:
        logger.exception("Gemini request failed for message: %r", data.message)
        # Quota errors are by far the most common failure and have nothing to do
        # with the request itself — surface them distinctly instead of as a
        # generic "assistant broke" 502.
        if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
            raise HTTPException(
                status_code=429,
                detail=(
                    "Gemini API quota exceeded. The free tier allows 500 requests per day "
                    "per model — wait for the daily reset, or switch to a different model."
                ),
            )
        raise HTTPException(status_code=502, detail=f"Assistant request failed: {e}")

    if not response.function_calls:
        # mode="ANY" is supposed to force a tool call, so this means the model
        # replied with plain text instead — log it, it's the only clue we get.
        logger.warning("No tool call returned. Model said: %r", response.text)
        raise HTTPException(
            status_code=502,
            detail=f"Assistant did not return a tool call: {response.text}",
        )

    call = response.function_calls[0]
    logger.info("Resolved action=%s args=%s", call.name, call.args)
    # args is None when the model calls a tool with no arguments at all — which
    # geocode() now invites for "where am I". params is a required dict, so a
    # bare None would fail response validation.
    return {"action": call.name, "params": call.args or {}}
