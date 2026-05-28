from fastapi import APIRouter, HTTPException
import rasterio
import numpy as np
from rasterio.transform import rowcol
from shapely.geometry import mapping
from shapely.ops import unary_union
from shapely.geometry import shape
import os

router = APIRouter(prefix="/viewshed", tags=["viewshed"])

DEM_PATH = os.path.join(os.path.dirname(__file__), "../data/output_SRTMGL1.tif")

def calculate_viewshed(dem_data, transform, observer_row, observer_col, radius_pixels, observer_height=1.75):
    rows, cols = dem_data.shape
    observer_elev = dem_data[observer_row, observer_col] + observer_height
    visible= np.zeros((rows, cols), dtype=bool)
    visible[observer_row, observer_col] = True

    for r in range(max(0, observer_row - radius_pixels), min(rows, observer_row + radius_pixels)):
        for c in range(max(0, observer_col - radius_pixels), min(cols, observer_col + radius_pixels)):
            dr = r - observer_row
            dc = c - observer_col
            if dr * dr + dc * dc > radius_pixels * radius_pixels:
                continue
            steps = max(abs(dr), abs(dc))

            if steps == 0:
                continue
            max_angle = -np.inf
            blocked = False 

            for i in range(1, steps + 1):
                ir = observer_row + int(round(dr * i / steps))
                ic = observer_col + int(round(dc * i / steps))

                if ir < 0 or ir >= rows or ic < 0 or ic >= cols:
                    blocked = True
                    break

                dist = np.sqrt((ir - observer_row)** 2 + (ic - observer_col)** 2)
                elev_diff = dem_data [ir, ic] - observer_elev
                angle = elev_diff / dist if dist > 0 else -np.inf
                if angle >= max_angle:
                    max_angle = angle
                else:
                    blocked = True
                    break
            if not blocked:
                visible[r, c] = True
    return visible
@router.get("/")
async def viewshed(latitude: float, longitude:float, radius_meters: float =1000, observer_height: float = 1.75):
    try:
        with rasterio.open(DEM_PATH) as src:
            transform = src.transform
            dem_data = src.read(1).astype(float)
            nodata = src.nodata
            if nodata  is not None:
                dem_data[dem_data == nodata] = 0
            
            observer_row, observer_col = rowcol(transform, longitude, latitude)


            rows, cols = dem_data.shape
            if observer_row < 0 or observer_row >= rows or observer_col < 0 or observer_col >= cols:
                raise HTTPException(
                    status_code=400,
                    detail=f"Coordinates are outside the DEM coverage area. Row: {observer_row}, Col: {observer_col}, DEM size: {rows}x{cols}"
                )

            pixel_size_meters = abs(transform[0] * 111320)
            radius_pixels = int(radius_meters / pixel_size_meters)
            radius_pixels = min(radius_pixels, 100)

            visible = calculate_viewshed(
                dem_data, transform, observer_row, observer_col, radius_pixels, observer_height
            )

            visible_coords = []
            for r in range(visible.shape[0]):
                for c in range(visible.shape[1]):
                    if visible[r, c]:
                        x = transform[2] + c * transform[0]
                        y = transform[5] + r * transform[4]
                        visible_coords.append((x, y))
            if not visible_coords:
                raise HTTPException(status_code=404, detail="No Visible area found")
            
            from shapely.geometry import MultiPoint
            points = MultiPoint(visible_coords)
            result_geom = points.convex_hull

            return{
                "observer":{
                    "latitude": latitude,
                    "longitude": longitude
                },
                "radius_meter":radius_meters,
                "observer_height": observer_height,
                "visible_area": mapping(result_geom)
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
