from sqlalchemy import Column, Integer, String
from geoalchemy2 import Geometry
from app.database import Base
from sqlalchemy import DateTime
from sqlalchemy.sql import func

class SpatialFeature(Base):
    __tablename__ = "spatial_features"

    id       = Column(Integer, primary_key=True)
    name     = Column(String)
    geometry = Column(Geometry(geometry_type="GEOMETRY", srid=4326))
    category = Column(String, nullable=True)
    address  = Column(String, nullable=True)


class SavedShape(Base):
    __tablename__ = "saved_shapes"

    id       = Column(Integer, primary_key=True)
    name     = Column(String)
    geometry = Column(Geometry(geometry_type="GEOMETRY", srid=4326))
    kind     = Column(String) #devides buffer/polygon/intersect/union
    color    = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())