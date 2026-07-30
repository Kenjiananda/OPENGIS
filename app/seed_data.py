import asyncio
import csv
import os
import sys

from pyproj import Transformer
from shapely.geometry import Point
from geoalchemy2.shape import from_shape

# app/ needs its parent on sys.path so `from app...` imports work no matter
# how this script is launched (Code Runner cd's into app/ before running it).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import AsyncSessionLocal
from app.models import SpatialFeature

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "raw")
FIRE_PATH = os.path.join(DATA_DIR, "Taipei_City_Fire_Department.csv")
HOSPITAL_PATH = os.path.join(DATA_DIR, "Taipei_City_Hospital.csv")
POLICE_PATH = os.path.join(DATA_DIR, "Taipei_City_Police_Department.csv")

twd97_to_wgs84 = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)

def load_fire_stations():
    with open(FIRE_PATH, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            x, y = float(row["經度"]), float(row["緯度"])
            lon, lat = twd97_to_wgs84.transform(x, y)
            yield row["分隊名稱"], lon, lat, row["地址"]

def load_hospitals():
    with open(HOSPITAL_PATH, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row["機構名稱"].split("\t")[0].strip()
            lon, lat = float(row["經度"]), float(row["緯度"])
            yield name, lon, lat, row["地址"]

def load_police_stations():
    with open(POLICE_PATH, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            x, y = float(row["POINT_X"]), float(row["POINT_Y"])
            lon, lat = twd97_to_wgs84.transform(x, y)
            yield row["中文單位名稱"], lon, lat, row["地址"]

async def save_features(records, category):
    async with AsyncSessionLocal() as session:
        count = 0
        for name, lon, lat, address in records:
            feature = SpatialFeature(
                name=name,
                category=category,
                address=address,
                geometry=from_shape(Point(lon, lat), srid=4326),
            )
            session.add(feature)
            count += 1
        await session.commit()
        return count

async def main():
    fire_count = await save_features(load_fire_stations(), "fire_department")
    print(f"Saved {fire_count} fire stations")

    hospital_count = await save_features(load_hospitals(), "hospital")
    print(f"Saved {hospital_count} hospitals")

    police_count = await save_features(load_police_stations(), "police_station")
    print(f"Saved {police_count} police stations")

if __name__ == "__main__":
    asyncio.run(main())