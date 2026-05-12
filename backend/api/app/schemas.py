import json
from datetime import date as Date
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, field_validator


class SpecimenSummary(BaseModel):
    """Lightweight record for map markers and list views."""

    model_config = ConfigDict(from_attributes=True)

    plant_id:       str
    name:           Optional[str]   = None
    collector_name: Optional[str]   = None

    # Location
    district:        Optional[str]  = None
    modern_district: Optional[str]  = None   # corrected/current district name
    country:         Optional[str]  = None

    # Date
    date:     Optional[Date] = None
    date_raw: Optional[str]  = None

    # Coordinates
    lat:          Optional[float] = None
    lng:          Optional[float] = None
    coord_source: Optional[str]   = None

    # Image
    image_path: Optional[str] = None

    # Altitude — raw string + standardised metres
    altitude_raw: Optional[str]   = None
    altitude_m:   Optional[float] = None

    # Habitat — included so table/map views don't need a detail fetch
    habitat:                     Optional[str] = None   # free-text from extracted_metadata
    habitat_overall_description: Optional[str] = None   # e.g. "Forest, Wetlands (Inland)"

    # JSONB list — asyncpg may return this as a raw JSON string; the validator
    # below normalises it to a Python list before Pydantic validates the type.
    habitat_iucn_category_description: list[str] = []

    @field_validator("habitat_iucn_category_description", mode="before")
    @classmethod
    def coerce_iucn_list(cls, v: Any) -> list:
        """
        asyncpg returns JSONB columns as raw strings (e.g. '[]' or
        '["1.5 Forest..."]').  Parse them into a Python list so Pydantic's
        list[str] type check passes cleanly.
        """
        if v is None:
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, ValueError):
                return []
        return []


class SpecimenDetail(SpecimenSummary):
    """Full record for the detail panel."""

    collector_number: Optional[str] = None
    grid_reference:   Optional[str] = None
    description:      Optional[str] = None
    geographic_info:  Optional[str] = None
    flowering_state:  Optional[str] = None
    phenotype:        Optional[str] = None
    geocode_type:     Optional[str] = None


class PaginatedSpecimens(BaseModel):
    total:     int
    page:      int
    page_size: int
    results:   list[SpecimenSummary]


class MetaValues(BaseModel):
    """Generic list of distinct string values (used for filter dropdowns etc.)."""
    values: list[str]


class HabitatClassSummary(BaseModel):
    """Aggregate counts per top-level IUCN habitat class (from the DB view)."""
    iucn_class:        Optional[str]
    specimen_count:    int
    unique_specimens:  int
    country_count:     int
    earliest_record:   Optional[Date] = None
    latest_record:     Optional[Date] = None