from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import Geography
from app.models import SpatialFeature


async def get_nearby_features(
    db: AsyncSession,
    lat: float,
    lng: float,
    radius_m: float = 5000,
    limit: int = 20
):
    point = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)

    feature_geog = func.cast(SpatialFeature.geometry, Geography)
    point_geog = func.cast(point, Geography)

    distance = func.ST_Distance(feature_geog, point_geog).label("straight_dist")

    stmt = (
        select(
            SpatialFeature.id,
            SpatialFeature.name,
            func.ST_X(SpatialFeature.geometry).label("lng"),
            func.ST_Y(SpatialFeature.geometry).label("lat"),
            distance
        )
        .where(func.ST_DWithin(feature_geog, point_geog, radius_m))
        .order_by(distance)
        .limit(limit)
    )

    result = await db.execute(stmt)
    return [dict(row._mapping) for row in result]