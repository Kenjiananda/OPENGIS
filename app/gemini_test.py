import os 
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))




def create_buffer(location: str, distance_meters: int) -> str:

    """ Creates a buffer on the location
    Args:
        location: The place name or address to center the buffer on.
        distance_meters: the radius of the buffer in meters
    """
    return "not actually called yet - just testing what gemini picks"

response = client.models.generate_content(
    model = "gemini-flash-lite-latest",
    contents = "Show me a 500m buffer around taipei 101",
    config = types.GenerateContentConfig(
        tools=[create_buffer],
        system_instruction=(
            "You are a GIS assistant, you have no ability to perform spatial operations "
            "yourself — you cannot create buffers, routes, or any map data on your own. "
            "Whenever the user requests a spatial operation, you must call the appropriate "
            "tool function. Never claim you performed an action unless you actually called a tool for it."
        ),
    )
)

if response.function_calls:
    for call in response.function_calls:
        print(call.name)
        print(call.args)
else:
    print("No tool call — Gemini said:")
    print(response.text)

