from pydantic import BaseModel
from typing import Any

class FeatureCreate(BaseModel):
    name: str
    geometry: dict

class FeatureOut(BaseModel):
    id: int
    name: str
    geometry: Any

    class Config:
        from_attributes = True
