#!/usr/bin/env python3
"""
Herbarium specimen import script — PostgreSQL + PostGIS.

Reads a JSON array of specimen records and upserts into Postgres.

Usage:
    python import_specimens.py specimens.json
    python import_specimens.py specimens.json --clear   # truncate before import

Requires:
    pip install psycopg2-binary python-dotenv

Connection:
    Set DATABASE_URL in environment or in a .env file, e.g.:
    DATABASE_URL=postgresql://user:password@host:5432/herbarium
"""

import json
import os
import re
import sys
import argparse
from datetime import date
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv optional


# ---------------------------------------------------------------------------
# Grid reference parser — Southern Africa Quarter Degree Square (QDS) system
# ---------------------------------------------------------------------------

LETTER_OFFSET = {"A": (0, 0), "B": (0, 1), "C": (1, 0), "D": (1, 1)}
DIGIT_OFFSET  = {"1": (0, 0), "2": (0, 1), "3": (1, 0), "4": (1, 1)}
GRID_RE = re.compile(r"\b(\d{2})(\d{2})\s+([A-Da-d])([1-4])\b")


def parse_grid_reference(grid_ref: str):
    """Return (lat, lng) floats or (None, None)."""
    if not grid_ref:
        return None, None
    m = GRID_RE.search(grid_ref.strip())
    if not m:
        return None, None

    lat_deg = int(m.group(1))
    lng_deg = int(m.group(2))
    ll, dl  = LETTER_OFFSET[m.group(3).upper()]
    ld, dd  = DIGIT_OFFSET[m.group(4)]

    cell_lat_nw = lat_deg + (ll * 30 + ld * 15) / 60.0
    cell_lng_nw = lng_deg + (dl * 30 + dd * 15) / 60.0

    return round(-(cell_lat_nw + 7.5 / 60.0), 6), round(cell_lng_nw + 7.5 / 60.0, 6)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_geocoding(geocoding: dict):
    """Return (lat, lng, geocode_type) or (None, None, None)."""
    if not geocoding:
        return None, None, None
    results = geocoding.get("results", [])
    if not results:
        return None, None, None
    geom = results[0].get("geometry", {})
    loc  = geom.get("location", {})
    lat, lng = loc.get("lat"), loc.get("lng")
    if lat is None or lng is None:
        return None, None, None
    return lat, lng, geom.get("location_type")


def extract_country(geocoding: dict) -> str | None:
    """
    Extract country name from geocoding address_components.
    Looks for the component whose types list includes 'country'
    and returns its long_name (e.g. 'Zimbabwe', 'Mozambique').
    Falls back to None — the DB column DEFAULT 'Zimbabwe' handles
    the missing-country case at insert time.
    """
    if not geocoding:
        return None
    results = geocoding.get("results", [])
    if not results:
        return None
    for component in results[0].get("address_components", []):
        if "country" in component.get("types", []):
            return component["long_name"]
    return None


def parse_date(raw: str):
    """Try to parse ISO date string; return date or None."""
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            return date.fromisoformat(raw[:len(fmt.replace("%Y","0000").replace("%m","00").replace("%d","00"))])
        except ValueError:
            pass
    m = re.match(r"(\d{4})", raw)
    if m:
        try:
            return date(int(m.group(1)), 1, 1)
        except ValueError:
            pass
    return None


def coerce_altitude_m(raw) -> float | None:
    """
    Convert altitude_m from the label to a float for the numeric DB column.
    Accepts int, float, numeric string, or empty string/None.
    """
    if raw is None or raw == "":
        return None
    try:
        val = float(raw)
        return val if val >= 0 else None
    except (ValueError, TypeError):
        return None


def coerce_habitat_iucn(raw) -> list:
    """
    Ensure habitat_iucn_category_description is always a plain list of strings.
    Accepts a list (passthrough) or a pipe-separated string as fallback.
    """
    if isinstance(raw, list):
        return [str(e) for e in raw if e]
    if isinstance(raw, str) and raw.strip():
        return [e.strip() for e in raw.split("|") if e.strip()]
    return []


def process_record(raw: dict) -> dict:
    label = raw.get("label", {})
    meta  = raw.get("extracted_metadata", {})

    # ------------------------------------------------------------------
    # Coordinates: geocoding first, grid_reference fallback
    # ------------------------------------------------------------------
    lat, lng, geocode_type = extract_geocoding(raw.get("geocoding"))
    coord_source = None

    if lat is not None:
        coord_source = "geocoding"
    else:
        grid_ref = label.get("Grid reference", "") or ""
        lat, lng = parse_grid_reference(grid_ref)
        if lat is not None:
            coord_source = "grid_reference"
            geocode_type = None

    date_raw    = label.get("Date", "") or ""
    parsed_date = parse_date(date_raw)

    # ------------------------------------------------------------------
    # Country: prefer geocoding result; fall back to label value;
    # ultimate fallback handled by DB DEFAULT 'Zimbabwe'
    # ------------------------------------------------------------------
    country = (
        extract_country(raw.get("geocoding"))
        or label.get("country") or None
    )

    # ------------------------------------------------------------------
    # Habitat fields
    # ------------------------------------------------------------------
    habitat_overall = label.get("habitat_overall_description", "") or ""
    habitat_iucn    = coerce_habitat_iucn(
        label.get("habitat_iucn_category_description", [])
    )

    return {
        "plant_id":                         label.get("plant_id", ""),
        "name":                             label.get("name", ""),
        "collector_name":                   label.get("collector_name", ""),
        "collector_number":                 label.get("collector_number", ""),
        "district":                         label.get("district", ""),
        "modern_district":                  label.get("modern_district", ""),
        "country":                          country,
        "date":                             parsed_date,
        "date_raw":                         date_raw,
        "altitude_raw":                     label.get("Altitude", ""),
        "altitude_m":                       coerce_altitude_m(label.get("altitude_m")),
        "grid_reference":                   label.get("Grid reference", ""),
        "description":                      label.get("description", ""),
        "habitat_overall_description":      habitat_overall,
        "habitat_iucn_category_description": json.dumps(habitat_iucn),   # serialise list → JSONB
        "habitat":                          meta.get("Habitat", ""),
        "geographic_info":                  meta.get("Geographic_information", ""),
        "flowering_state":                  meta.get("Flowering state", ""),
        "phenotype":                        meta.get("Phenotype", ""),
        "image_path":                       raw.get("image_path", ""),
        "lat":                              lat,
        "lng":                              lng,
        "coord_source":                     coord_source,
        "geocode_type":                     geocode_type,
    }


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

UPSERT_SQL = """
INSERT INTO specimens (
    plant_id, name, collector_name, collector_number,
    district, modern_district, country,
    date, date_raw,
    altitude_raw, altitude_m,
    grid_reference, description,
    habitat_overall_description, habitat_iucn_category_description,
    habitat, geographic_info, flowering_state, phenotype,
    image_path,
    lat, lng, coord_source, geocode_type,
    geom
) VALUES (
    %(plant_id)s, %(name)s, %(collector_name)s, %(collector_number)s,
    %(district)s, %(modern_district)s, %(country)s,
    %(date)s, %(date_raw)s,
    %(altitude_raw)s, %(altitude_m)s,
    %(grid_reference)s, %(description)s,
    %(habitat_overall_description)s, %(habitat_iucn_category_description)s::jsonb,
    %(habitat)s, %(geographic_info)s, %(flowering_state)s, %(phenotype)s,
    %(image_path)s,
    %(lat)s, %(lng)s, %(coord_source)s::coord_source_type, %(geocode_type)s,
    CASE WHEN %(lat)s IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)
         ELSE NULL
    END
)
ON CONFLICT (plant_id) DO UPDATE SET
    name                              = EXCLUDED.name,
    collector_name                    = EXCLUDED.collector_name,
    collector_number                  = EXCLUDED.collector_number,
    district                          = EXCLUDED.district,
    modern_district                   = EXCLUDED.modern_district,
    country                           = EXCLUDED.country,
    date                              = EXCLUDED.date,
    date_raw                          = EXCLUDED.date_raw,
    altitude_raw                      = EXCLUDED.altitude_raw,
    altitude_m                        = EXCLUDED.altitude_m,
    grid_reference                    = EXCLUDED.grid_reference,
    description                       = EXCLUDED.description,
    habitat_overall_description       = EXCLUDED.habitat_overall_description,
    habitat_iucn_category_description = EXCLUDED.habitat_iucn_category_description,
    habitat                           = EXCLUDED.habitat,
    geographic_info                   = EXCLUDED.geographic_info,
    flowering_state                   = EXCLUDED.flowering_state,
    phenotype                         = EXCLUDED.phenotype,
    image_path                        = EXCLUDED.image_path,
    lat                               = EXCLUDED.lat,
    lng                               = EXCLUDED.lng,
    coord_source                      = EXCLUDED.coord_source,
    geocode_type                      = EXCLUDED.geocode_type,
    geom                              = EXCLUDED.geom,
    updated_at                        = NOW();
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Import herbarium specimens into PostgreSQL")
    parser.add_argument("json_file", help="Path to input JSON file")
    parser.add_argument("--clear", action="store_true", help="TRUNCATE table before import")
    args = parser.parse_args()

    json_path = Path(args.json_file)
    if not json_path.exists():
        print(f"ERROR: File not found: {json_path}", file=sys.stderr)
        sys.exit(1)

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set.", file=sys.stderr)
        print("  Example: export DATABASE_URL=postgresql://user:pass@host:5432/herbarium", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {json_path} …")
    with open(json_path, encoding="utf-8") as f:
        records = json.load(f)

    if not isinstance(records, list):
        print("ERROR: JSON root must be an array.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(records)} records.")

    conn = psycopg2.connect(database_url)

    # Apply schema
    schema_path = Path(__file__).parent / "schema.sql"
    if schema_path.exists():
        with conn.cursor() as cur:
            cur.execute(schema_path.read_text())
        conn.commit()
        print("Schema applied.")

    if args.clear:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE specimens, specimen_images RESTART IDENTITY CASCADE;")
        conn.commit()
        print("Table truncated.")

    stats = {"inserted": 0, "skipped": 0, "no_coords": 0}

    with conn.cursor() as cur:
        for i, raw in enumerate(records):
            try:
                row = process_record(raw)
                if not row["plant_id"]:
                    print(f"  [SKIP] Record {i}: missing plant_id")
                    stats["skipped"] += 1
                    continue

                cur.execute(UPSERT_SQL, row)
                stats["inserted"] += 1

                if row["lat"] is None:
                    stats["no_coords"] += 1
                    print(
                        f"  [NO COORDS] {row['plant_id']} — "
                        f"district: '{row['district']}', grid: '{row['grid_reference']}'"
                    )

            except Exception as e:
                conn.rollback()
                print(f"  [ERROR] Record {i} ({raw.get('label', {}).get('plant_id', '?')}): {e}")
                stats["skipped"] += 1
                continue

    conn.commit()

    # Coordinate source breakdown
    with conn.cursor() as cur:
        cur.execute(
            "SELECT coord_source, COUNT(*) FROM specimens "
            "GROUP BY coord_source ORDER BY coord_source NULLS LAST;"
        )
        breakdown = cur.fetchall()

    # Country breakdown
    with conn.cursor() as cur:
        cur.execute(
            "SELECT country, COUNT(*) FROM specimens "
            "GROUP BY country ORDER BY COUNT(*) DESC NULLS LAST;"
        )
        countries = cur.fetchall()

    # Habitat class breakdown
    with conn.cursor() as cur:
        cur.execute(
            "SELECT habitat_overall_description, COUNT(*) FROM specimens "
            "WHERE habitat_overall_description IS NOT NULL AND habitat_overall_description != '' "
            "GROUP BY habitat_overall_description ORDER BY COUNT(*) DESC LIMIT 10;"
        )
        habitats = cur.fetchall()

    conn.close()

    print("\nDone.")
    print(f"  Inserted/updated : {stats['inserted']}")
    print(f"  Skipped          : {stats['skipped']}")
    print(f"  No coordinates   : {stats['no_coords']}")

    print("\nCoordinate source breakdown:")
    for src, n in breakdown:
        print(f"  {src or 'none'}: {n}")

    print("\nCountry breakdown:")
    for country, n in countries:
        print(f"  {country or 'unknown'}: {n}")

    print("\nTop habitat classes:")
    for habitat, n in habitats:
        print(f"  {habitat}: {n}")


if __name__ == "__main__":
    main()