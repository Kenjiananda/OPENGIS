from sqlalchemy import Column, Integer, String
from geoalchemy2 import Geometry
from app.database import Base

class SpatialFeature(Base):
    __tablename__ = "spatial_features"

    id       = Column(Integer, primary_key=True)
    name     = Column(String)
    geometry = Column(Geometry(geometry_type="GEOMETRY", srid=4326))