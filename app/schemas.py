from pydantic import BaseModel
from typing import Any, Literal
from enum import Enum


class FeatureCategory(str, Enum):
    hospital = "hospital"
    police_station = "police_station"
    fire_department = "fire_department"


class FeatureCreate(BaseModel):
    name: str
    geometry: dict
    category: FeatureCategory | None = None
    address: str | None = None

class FeatureOut(BaseModel):
    id: int
    name: str
    geometry: Any
    category: FeatureCategory | None = None
    address: str | None = None

    class Config:
        from_attributes = True


class AssistantQuery(BaseModel):
    message: str

class AssistantAction(BaseModel):
    action: str
    params: dict


class OriginPoint(BaseModel):
    lat: float
    lng: float
    label: str | None = None


class BestDestinationRequest(BaseModel):
    origins: list[OriginPoint]
    category: FeatureCategory
    radius_m: float = 5000
    mode: Literal["priority", "efficient"] = "priority"

class SavedShapeCreate(BaseModel):
    name: str
    geometry: dict
    kind: Literal["buffer", "polygon", "intersect", "union"]
    color: str

class SavedShapeRename(BaseModel):
    name: str

class SavedShapeOut(BaseModel):
    id: int
    name: str
    geometry: dict
    kind: str
    color: str

    class Config:
        from_attributes = True