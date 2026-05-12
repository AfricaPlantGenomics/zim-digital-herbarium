from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from asyncpg import Pool

from app.database import get_pool
from app.schemas import MetaValues, HabitatClassSummary

router = APIRouter(prefix="/meta", tags=["meta"])

# 1 hour — meta values change only when the DB is re-imported
_CACHE_1H  = "public, max-age=3600"
# 24 hours — image-ids list changes only on re-import
_CACHE_24H = "public, max-age=86400"


async def pool_dep() -> Pool:
    return await get_pool()


# ---------------------------------------------------------------------------
# Location
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Image availability — single endpoint replaces N+1 per-specimen fetches
# ---------------------------------------------------------------------------

@router.get("/image-ids")
async def get_image_ids(pool: Pool = Depends(pool_dep)):
    """
    Returns the set of all plant_ids that have at least one image stored.
    Use this instead of calling /images/{id} per specimen to avoid N+1 requests.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT plant_id FROM specimen_images ORDER BY plant_id"
        )
    data = [r["plant_id"] for r in rows]
    return JSONResponse(content=data, headers={"Cache-Control": _CACHE_24H})


@router.get("/districts", response_model=MetaValues)
async def get_districts(pool: Pool = Depends(pool_dep)):
    """Distinct original (historical) district names, sorted alphabetically."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT district FROM specimens
            WHERE  district IS NOT NULL AND district != ''
            ORDER  BY district
            """
        )
    return JSONResponse(
        content={"values": [r["district"] for r in rows]},
        headers={"Cache-Control": _CACHE_1H},
    )


@router.get("/modern-districts", response_model=MetaValues)
async def get_modern_districts(pool: Pool = Depends(pool_dep)):
    """Distinct modern/current district names, sorted alphabetically."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT modern_district FROM specimens
            WHERE  modern_district IS NOT NULL AND modern_district != ''
            ORDER  BY modern_district
            """
        )
    return JSONResponse(
        content={"values": [r["modern_district"] for r in rows]},
        headers={"Cache-Control": _CACHE_1H},
    )


@router.get("/countries", response_model=MetaValues)
async def get_countries(pool: Pool = Depends(pool_dep)):
    """Distinct country values, sorted alphabetically."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT country FROM specimens
            WHERE  country IS NOT NULL AND country != ''
            ORDER  BY country
            """
        )
    return MetaValues(values=[r["country"] for r in rows])


# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------

@router.get("/collectors", response_model=MetaValues)
async def get_collectors(pool: Pool = Depends(pool_dep)):
    """Distinct collector names, sorted alphabetically."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT collector_name FROM specimens
            WHERE  collector_name IS NOT NULL AND collector_name != ''
            ORDER  BY collector_name
            """
        )
    return MetaValues(values=[r["collector_name"] for r in rows])


@router.get("/collector-numbers", response_model=MetaValues)
async def get_collector_numbers(pool: Pool = Depends(pool_dep)):
    """Distinct collector numbers, sorted alphabetically."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT collector_number FROM specimens
            WHERE  collector_number IS NOT NULL AND collector_number != ''
            ORDER  BY collector_number
            """
        )
    return MetaValues(values=[r["collector_number"] for r in rows])


# ---------------------------------------------------------------------------
# Taxonomy
# ---------------------------------------------------------------------------

@router.get("/species", response_model=MetaValues)
async def get_species(pool: Pool = Depends(pool_dep)):
    """Distinct full species names (including author), sorted alphabetically."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT name FROM specimens
            WHERE  name IS NOT NULL AND name != ''
            ORDER  BY name
            """
        )
    return MetaValues(values=[r["name"] for r in rows])


# ---------------------------------------------------------------------------
# Habitat
# ---------------------------------------------------------------------------

@router.get("/habitat-classes", response_model=MetaValues)
async def get_habitat_classes(pool: Pool = Depends(pool_dep)):
    """
    Distinct top-level habitat class names, split from the comma-separated
    habitat_overall_description field. Each class is returned individually.
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


@router.get("/iucn-categories", response_model=MetaValues)
async def get_iucn_categories(pool: Pool = Depends(pool_dep)):
    """
    Distinct full IUCN category strings unnested from the JSONB array column,
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
    return JSONResponse(
        content={"values": [r["category"] for r in rows]},
        headers={"Cache-Control": _CACHE_1H},
    )


@router.get("/habitat-summary", response_model=list[HabitatClassSummary])
async def get_habitat_summary(pool: Pool = Depends(pool_dep)):
    """
    Per-habitat-class aggregate stats (specimen counts, date ranges)
    sourced from the habitat_class_summary DB view.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM habitat_class_summary")
    return [HabitatClassSummary(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# Coordinate source
# ---------------------------------------------------------------------------

@router.get("/coord-sources", response_model=MetaValues)
async def get_coord_sources(pool: Pool = Depends(pool_dep)):
    """Distinct coordinate source values ('geocoding', 'grid_reference')."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT coord_source::TEXT FROM specimens
            WHERE  coord_source IS NOT NULL
            ORDER  BY coord_source
            """
        )
    return MetaValues(values=[r["coord_source"] for r in rows])


# ---------------------------------------------------------------------------
# Altitude
# ---------------------------------------------------------------------------

@router.get("/altitude-range")
async def get_altitude_range(pool: Pool = Depends(pool_dep)):
    """Min and max standardised altitude (metres) across all georeferenced specimens."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                MIN(altitude_m) AS min_m,
                MAX(altitude_m) AS max_m,
                ROUND(AVG(altitude_m)::numeric, 1) AS avg_m,
                COUNT(*)        AS specimens_with_altitude
            FROM specimens
            WHERE altitude_m IS NOT NULL
            """
        )
    return {
        "min_m":                    float(row["min_m"])  if row["min_m"]  is not None else None,
        "max_m":                    float(row["max_m"])  if row["max_m"]  is not None else None,
        "avg_m":                    float(row["avg_m"])  if row["avg_m"]  is not None else None,
        "specimens_with_altitude":  row["specimens_with_altitude"],
    }


# ---------------------------------------------------------------------------
# Stats dashboard
# ---------------------------------------------------------------------------

@router.get("/stats")
async def get_stats(pool: Pool = Depends(pool_dep)):
    """Comprehensive summary stats — all aggregates in two DB round-trips."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH habitat_cls AS (
                SELECT COUNT(DISTINCT trim(cls)) AS habitat_classes
                FROM   specimens,
                       unnest(string_to_array(habitat_overall_description, ',')) AS cls
                WHERE  habitat_overall_description IS NOT NULL
                  AND  habitat_overall_description != ''
            ),
            iucn_cls AS (
                SELECT COUNT(DISTINCT iucn_entry.value::TEXT) AS iucn_categories
                FROM   specimens,
                       jsonb_array_elements(habitat_iucn_category_description) AS iucn_entry
                WHERE  jsonb_array_length(habitat_iucn_category_description) > 0
            )
            SELECT
                COUNT(*)                                                         AS total,
                COUNT(*) FILTER (WHERE lat IS NOT NULL)                          AS with_coords,
                COUNT(*) FILTER (WHERE altitude_m IS NOT NULL)                   AS with_alt,
                COUNT(*) FILTER (WHERE habitat_overall_description IS NOT NULL
                                   AND habitat_overall_description != '')         AS with_habitat,
                COUNT(*) FILTER (WHERE jsonb_array_length(habitat_iucn_category_description) > 0) AS with_iucn,
                COUNT(*) FILTER (WHERE image_path IS NOT NULL AND image_path != '') AS with_image,
                COUNT(DISTINCT district)
                    FILTER (WHERE district IS NOT NULL AND district != '')        AS districts,
                COUNT(DISTINCT modern_district)
                    FILTER (WHERE modern_district IS NOT NULL
                              AND modern_district != '')                          AS modern_districts,
                COUNT(DISTINCT country)
                    FILTER (WHERE country IS NOT NULL AND country != '')          AS countries,
                COUNT(DISTINCT collector_name)
                    FILTER (WHERE collector_name IS NOT NULL
                              AND collector_name != '')                           AS collectors,
                COUNT(DISTINCT name)
                    FILTER (WHERE name IS NOT NULL AND name != '')                AS species,
                MIN(date)                                                         AS earliest_date,
                MAX(date)                                                         AS latest_date,
                MIN(altitude_m)                                                   AS min_alt,
                MAX(altitude_m)                                                   AS max_alt,
                (SELECT habitat_classes FROM habitat_cls)                         AS habitat_classes,
                (SELECT iucn_categories FROM iucn_cls)                            AS iucn_categories
            FROM specimens
            """
        )

    total = row["total"]
    return JSONResponse(
        content={
            "total_specimens": total,
            "coverage": {
                "with_coordinates":    row["with_coords"],
                "without_coordinates": total - row["with_coords"],
                "with_altitude":       row["with_alt"],
                "with_habitat":        row["with_habitat"],
                "with_iucn_category":  row["with_iucn"],
                "with_image":          row["with_image"],
            },
            "diversity": {
                "species":           row["species"],
                "collectors":        row["collectors"],
                "districts":         row["districts"],
                "modern_districts":  row["modern_districts"],
                "countries":         row["countries"],
                "habitat_classes":   row["habitat_classes"],
                "iucn_categories":   row["iucn_categories"],
            },
            "date_range": {
                "earliest": row["earliest_date"].isoformat() if row["earliest_date"] else None,
                "latest":   row["latest_date"].isoformat()   if row["latest_date"]   else None,
            },
            "altitude_range_m": {
                "min": float(row["min_alt"]) if row["min_alt"] is not None else None,
                "max": float(row["max_alt"]) if row["max_alt"] is not None else None,
            },
        },
        headers={"Cache-Control": _CACHE_1H},
    )