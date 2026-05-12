import json as _json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from asyncpg import Pool

from app.database import get_pool
from app.schemas import (
    SpecimenDetail,
    SpecimenSummary,
    PaginatedSpecimens,
    MetaValues,
    HabitatClassSummary,
)

router = APIRouter(prefix="/specimens", tags=["specimens"])


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------

async def pool_dep() -> Pool:
    return await get_pool()


# ---------------------------------------------------------------------------
# Column lists
# ---------------------------------------------------------------------------

SUMMARY_COLS = """
    plant_id, name, collector_name,
    district, modern_district, country,
    date, date_raw,
    altitude_raw, altitude_m,
    lat, lng, coord_source,
    image_path,
    habitat,
    habitat_overall_description,
    habitat_iucn_category_description
"""

DETAIL_COLS = """
    plant_id, name, collector_name, collector_number,
    district, modern_district, country,
    date, date_raw,
    altitude_raw, altitude_m,
    grid_reference, description,
    habitat,
    habitat_overall_description,
    habitat_iucn_category_description,
    geographic_info, flowering_state, phenotype,
    image_path,
    lat, lng, coord_source, geocode_type
"""

# Shared tsvector expression — keep in sync with schema.sql FTS index
FTS_VECTOR = """
    to_tsvector('english',
        coalesce(name,                          '') || ' ' ||
        coalesce(description,                   '') || ' ' ||
        coalesce(habitat,                       '') || ' ' ||
        coalesce(habitat_overall_description,   '') || ' ' ||
        coalesce(geographic_info,               '') || ' ' ||
        coalesce(phenotype,                     '')
    )
"""


# asyncpg returns JSONB columns as raw strings — parse them back to Python
# objects before handing to Pydantic, otherwise list[str] fields raise
# "Input should be a valid list" ValidationError.
_JSONB_FIELDS = {"habitat_iucn_category_description"}


def row_to_dict(row) -> dict:
    """
    Convert asyncpg Record to plain dict, deserialising any JSONB columns
    that asyncpg returns as strings into their native Python types.
    """
    d = dict(row)
    for field in _JSONB_FIELDS:
        val = d.get(field)
        if isinstance(val, str):
            try:
                d[field] = _json.loads(val)
            except _json.JSONDecodeError:
                d[field] = []
        elif val is None:
            d[field] = []
    return d


# ---------------------------------------------------------------------------
# GET /specimens  — paginated list with optional filters
# ---------------------------------------------------------------------------

@router.get("", response_model=PaginatedSpecimens)
async def list_specimens(
    page:       int            = Query(1,    ge=1),
    page_size:  int            = Query(50,   ge=1, le=600_000),

    # Location filters
    district:       Optional[str]  = Query(None, description="Partial match on original district"),
    modern_district: Optional[str] = Query(None, description="Partial match on modern/current district"),
    country:        Optional[str]  = Query(None, description="Partial match on country"),

    # Taxonomy / collector
    collector:  Optional[str]  = Query(None, description="Partial match on collector name"),
    name:       Optional[str]  = Query(None, description="Partial match on species name"),

    # Date range
    date_from:  Optional[str]  = Query(None, description="ISO date e.g. 1960-01-01"),
    date_to:    Optional[str]  = Query(None, description="ISO date e.g. 1980-12-31"),

    # Altitude range (metres)
    alt_min:    Optional[float] = Query(None, description="Minimum altitude in metres"),
    alt_max:    Optional[float] = Query(None, description="Maximum altitude in metres"),

    # Habitat filters
    habitat_overall: Optional[str] = Query(
        None, description="Partial match on top-level habitat class, e.g. 'Forest'"
    ),
    habitat_iucn: Optional[str] = Query(
        None, description="Exact IUCN category contained in array, e.g. '1.5 Forest - Subtropical/Tropical Dry'"
    ),

    # Coordinate filter
    has_coords: Optional[bool] = Query(None, description="Filter to records with/without coordinates"),

    pool: Pool = Depends(pool_dep),
):
    conditions: list[str] = []
    params: list = []
    p = 1

    if district:
        conditions.append(f"district ILIKE ${p}")
        params.append(f"%{district}%"); p += 1

    if modern_district:
        conditions.append(f"modern_district ILIKE ${p}")
        params.append(f"%{modern_district}%"); p += 1

    if country:
        conditions.append(f"country ILIKE ${p}")
        params.append(f"%{country}%"); p += 1

    if collector:
        conditions.append(f"collector_name ILIKE ${p}")
        params.append(f"%{collector}%"); p += 1

    if name:
        conditions.append(f"name ILIKE ${p}")
        params.append(f"%{name}%"); p += 1

    if date_from:
        conditions.append(f"date >= ${p}::date")
        params.append(date_from); p += 1

    if date_to:
        conditions.append(f"date <= ${p}::date")
        params.append(date_to); p += 1

    if alt_min is not None:
        conditions.append(f"altitude_m >= ${p}")
        params.append(alt_min); p += 1

    if alt_max is not None:
        conditions.append(f"altitude_m <= ${p}")
        params.append(alt_max); p += 1

    if habitat_overall:
        conditions.append(f"habitat_overall_description ILIKE ${p}")
        params.append(f"%{habitat_overall}%"); p += 1

    if habitat_iucn:
        # JSONB containment: array must contain this exact string element
        conditions.append(f"habitat_iucn_category_description @> ${p}::jsonb")
        params.append(f'["{habitat_iucn}"]'); p += 1

    if has_coords is True:
        conditions.append("lat IS NOT NULL")
    elif has_coords is False:
        conditions.append("lat IS NULL")

    where  = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * page_size

    async with pool.acquire() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM specimens {where}", *params)
        rows  = await conn.fetch(
            f"""
            SELECT {SUMMARY_COLS}
            FROM   specimens
            {where}
            ORDER  BY name ASC
            LIMIT  ${p} OFFSET ${p + 1}
            """,
            *params, page_size, offset,
        )

    return PaginatedSpecimens(
        total=total,
        page=page,
        page_size=page_size,
        results=[SpecimenSummary(**row_to_dict(r)) for r in rows],
    )


# ---------------------------------------------------------------------------
# GET /specimens/search  — full-text search
# (must be declared before /{plant_id} to avoid route shadowing)
# ---------------------------------------------------------------------------

@router.get("/search", response_model=PaginatedSpecimens)
async def search_specimens(
    q:          str = Query(..., min_length=2, description="Free-text search query"),
    page:       int = Query(1,  ge=1),
    page_size:  int = Query(50, ge=1, le=200),
    pool: Pool = Depends(pool_dep),
):
    offset = (page - 1) * page_size

    async with pool.acquire() as conn:
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM specimens WHERE {FTS_VECTOR} @@ plainto_tsquery('english', $1)",
            q,
        )
        rows = await conn.fetch(
            f"""
            SELECT {SUMMARY_COLS},
                   ts_rank({FTS_VECTOR}, plainto_tsquery('english', $1)) AS rank
            FROM   specimens
            WHERE  {FTS_VECTOR} @@ plainto_tsquery('english', $1)
            ORDER  BY rank DESC
            LIMIT  $2 OFFSET $3
            """,
            q, page_size, offset,
        )

    return PaginatedSpecimens(
        total=total,
        page=page,
        page_size=page_size,
        results=[SpecimenSummary(**{k: v for k, v in row_to_dict(r).items() if k != "rank"}) for r in rows],
    )


# ---------------------------------------------------------------------------
# GET /specimens/bbox  — spatial query for map viewport
# ---------------------------------------------------------------------------

@router.get("/bbox", response_model=list[SpecimenSummary])
async def specimens_in_bbox(
    min_lng: float = Query(..., description="West longitude"),
    min_lat: float = Query(..., description="South latitude"),
    max_lng: float = Query(..., description="East longitude"),
    max_lat: float = Query(..., description="North latitude"),
    limit:   int   = Query(2000, ge=1, le=5000),
    pool: Pool = Depends(pool_dep),
):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {SUMMARY_COLS}
            FROM   specimens
            WHERE  geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            LIMIT  $5
            """,
            min_lng, min_lat, max_lng, max_lat, limit,
        )

    return [SpecimenSummary(**row_to_dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /specimens/meta/districts  — distinct district values for filter UI
# ---------------------------------------------------------------------------

@router.get("/meta/districts", response_model=MetaValues)
async def meta_districts(pool: Pool = Depends(pool_dep)):
    """Return all distinct original district names (sorted), for filter dropdowns."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT district FROM specimens
            WHERE  district IS NOT NULL AND district != ''
            ORDER  BY district
            """
        )
    return MetaValues(values=[r["district"] for r in rows])


# ---------------------------------------------------------------------------
# GET /specimens/meta/modern-districts  — distinct modern district values
# ---------------------------------------------------------------------------

@router.get("/meta/modern-districts", response_model=MetaValues)
async def meta_modern_districts(pool: Pool = Depends(pool_dep)):
    """Return all distinct modern district names (sorted), for filter dropdowns."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT modern_district FROM specimens
            WHERE  modern_district IS NOT NULL AND modern_district != ''
            ORDER  BY modern_district
            """
        )
    return MetaValues(values=[r["modern_district"] for r in rows])


# ---------------------------------------------------------------------------
# GET /specimens/meta/habitat-classes  — distinct top-level habitat types
# ---------------------------------------------------------------------------

@router.get("/meta/habitat-classes", response_model=MetaValues)
async def meta_habitat_classes(pool: Pool = Depends(pool_dep)):
    """
    Return all distinct top-level habitat class values for filter dropdowns.
    Splits comma-separated values so each class is returned individually.
    e.g. "Forest, Wetlands (Inland)" → ["Forest", "Wetlands (Inland)"]
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT trim(cls) AS cls
            FROM   specimens,
                   unnest(string_to_array(habitat_overall_description, ',')) AS cls
            WHERE  habitat_overall_description IS NOT NULL
              AND  habitat_overall_description != ''
            ORDER  BY cls
            """
        )
    return MetaValues(values=[r["cls"] for r in rows])


# ---------------------------------------------------------------------------
# GET /specimens/meta/iucn-categories  — distinct IUCN category strings
# ---------------------------------------------------------------------------

@router.get("/meta/iucn-categories", response_model=MetaValues)
async def meta_iucn_categories(pool: Pool = Depends(pool_dep)):
    """
    Return all distinct IUCN category strings drawn from the JSONB array column,
    sorted alphabetically. Suitable for filter dropdowns or autocomplete.
    e.g. "1.5 Forest - Subtropical/Tropical Dry"
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT iucn_entry.value::TEXT AS category
            FROM   specimens,
                   jsonb_array_elements(habitat_iucn_category_description) AS iucn_entry
            WHERE  jsonb_array_length(habitat_iucn_category_description) > 0
            ORDER  BY category
            """
        )
    return MetaValues(values=[r["category"] for r in rows])


# ---------------------------------------------------------------------------
# GET /specimens/meta/habitat-summary  — aggregate stats per IUCN class
# ---------------------------------------------------------------------------

@router.get("/meta/habitat-summary", response_model=list[HabitatClassSummary])
async def meta_habitat_summary(pool: Pool = Depends(pool_dep)):
    """
    Returns per-habitat-class specimen counts and date ranges,
    sourced from the habitat_class_summary DB view.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM habitat_class_summary")

    return [HabitatClassSummary(**row_to_dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /specimens/{plant_id}  — single specimen detail
# ---------------------------------------------------------------------------

@router.get("/{plant_id}", response_model=SpecimenDetail)
async def get_specimen(plant_id: str, pool: Pool = Depends(pool_dep)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"SELECT {DETAIL_COLS} FROM specimens WHERE plant_id = $1",
            plant_id,
        )

    if not row:
        raise HTTPException(status_code=404, detail=f"Specimen '{plant_id}' not found")

    return SpecimenDetail(**row_to_dict(row))