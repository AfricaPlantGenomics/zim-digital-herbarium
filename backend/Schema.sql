-- Herbarium specimens schema
-- Requires: PostgreSQL 14+ + PostGIS extension
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE coord_source_type AS ENUM ('geocoding', 'grid_reference');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- MAIN TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS specimens (
    id                      SERIAL PRIMARY KEY,

    -- -----------------------------------------------------------------------
    -- Core identity  (from label)
    -- -----------------------------------------------------------------------
    plant_id                TEXT        UNIQUE NOT NULL,    -- e.g. "SRGH603302980"
    name                    TEXT,                           -- full taxonomic name incl. author

    -- -----------------------------------------------------------------------
    -- Collection event  (from label)
    -- -----------------------------------------------------------------------
    collector_name          TEXT,                           -- e.g. "P. Nyariri"
    collector_number        TEXT,                           -- e.g. "663"
    date                    DATE,                           -- parsed from ISO string; NULL if unparseable
    date_raw                TEXT,                           -- original "Date" string preserved

    -- -----------------------------------------------------------------------
    -- Location  (from label)
    -- -----------------------------------------------------------------------
    district                TEXT,                           -- original district on label, e.g. "Sipolilo"
    modern_district         TEXT,                           -- corrected/current district, e.g. "Guruve"
    country                 TEXT        DEFAULT 'Zimbabwe',

    -- -----------------------------------------------------------------------
    -- Altitude  (from label)
    -- -----------------------------------------------------------------------
    altitude_raw            TEXT,                           -- original "Altitude" string, preserved as-is
    altitude_m              NUMERIC(9,2),                   -- standardised metres; NULL if blank/unparseable

    -- -----------------------------------------------------------------------
    -- Spatial reference  (from label)
    -- -----------------------------------------------------------------------
    grid_reference          TEXT,                           -- e.g. "SR 1234"

    -- -----------------------------------------------------------------------
    -- Label free-text
    -- -----------------------------------------------------------------------
    description             TEXT,                           -- full verbatim label description block

    -- -----------------------------------------------------------------------
    -- Structured habitat  (from label — new fields)
    -- -----------------------------------------------------------------------

    -- Comma-separated top-level IUCN habitat class(es).
    -- Single:   "Forest"
    -- Multiple: "Forest, Wetlands (Inland), Rocky Areas (Inland)"
    habitat_overall_description         TEXT,

    -- Full IUCN category label(s) as a native JSON array.
    -- Single:   ["1.5 Forest - Subtropical/Tropical Dry"]
    -- Multiple: ["1.5 Forest - Subtropical/Tropical Dry",
    --            "1.6 Forest - Subtropical/Tropical Moist Lowland",
    --            "5.1 Wetlands (Inland) - Permanent Rivers/Streams",
    --            "6.2 Rocky Areas (Inland) - Inland Rocky Areas"]
    habitat_iucn_category_description   JSONB       DEFAULT '[]'::jsonb,

    -- -----------------------------------------------------------------------
    -- Extracted metadata  (from extracted_metadata block)
    -- -----------------------------------------------------------------------
    habitat                 TEXT,                           -- e.g. "In woodland in river on granite sand"
    geographic_info         TEXT,                           -- e.g. "Nyamunyeche Estate"
    flowering_state         TEXT,                           -- e.g. "Flowers white"
    phenotype               TEXT,                           -- e.g. "Perennial +/- 1 metre high\nLeaves toothed"

    -- -----------------------------------------------------------------------
    -- Image
    -- -----------------------------------------------------------------------
    image_path              TEXT,                           -- relative path to full-size processed image

    -- -----------------------------------------------------------------------
    -- Coordinates  (populated post-geocoding)
    -- -----------------------------------------------------------------------
    lat                     DOUBLE PRECISION,
    lng                     DOUBLE PRECISION,
    coord_source            coord_source_type,              -- 'geocoding' | 'grid_reference'
    geocode_type            TEXT,                           -- 'APPROXIMATE' | 'ROOFTOP' etc.

    -- PostGIS geometry (EPSG:4326 — WGS84)
    geom                    GEOMETRY(Point, 4326),

    -- -----------------------------------------------------------------------
    -- Audit
    -- -----------------------------------------------------------------------
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),

    -- -----------------------------------------------------------------------
    -- Constraints
    -- -----------------------------------------------------------------------
    CONSTRAINT chk_altitude_m_positive   CHECK (altitude_m IS NULL OR altitude_m >= 0),
    CONSTRAINT chk_lat_range             CHECK (lat IS NULL OR lat BETWEEN -90  AND  90),
    CONSTRAINT chk_lng_range             CHECK (lng IS NULL OR lng BETWEEN -180 AND 180)
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

-- Core lookups
CREATE INDEX IF NOT EXISTS idx_specimens_plant_id        ON specimens(plant_id);
CREATE INDEX IF NOT EXISTS idx_specimens_name            ON specimens(name);
CREATE INDEX IF NOT EXISTS idx_specimens_district        ON specimens(district);
CREATE INDEX IF NOT EXISTS idx_specimens_modern_district ON specimens(modern_district);
CREATE INDEX IF NOT EXISTS idx_specimens_country         ON specimens(country);
CREATE INDEX IF NOT EXISTS idx_specimens_date            ON specimens(date);
CREATE INDEX IF NOT EXISTS idx_specimens_collector       ON specimens(collector_name);

-- Altitude range queries (partial index skips NULLs)
CREATE INDEX IF NOT EXISTS idx_specimens_altitude_m      ON specimens(altitude_m)
    WHERE altitude_m IS NOT NULL;

-- Spatial
CREATE INDEX IF NOT EXISTS idx_specimens_lat_lng         ON specimens(lat, lng);
CREATE INDEX IF NOT EXISTS idx_specimens_geom            ON specimens USING GIST(geom);

-- Habitat — B-tree for equality / LIKE on summary field
CREATE INDEX IF NOT EXISTS idx_specimens_habitat_overall
    ON specimens(habitat_overall_description);

-- Habitat — GIN for containment queries on the JSONB array, e.g.:
--   WHERE habitat_iucn_category_description @> '["1.5 Forest - Subtropical/Tropical Dry"]'
CREATE INDEX IF NOT EXISTS idx_specimens_habitat_iucn
    ON specimens USING GIN(habitat_iucn_category_description);

-- Full-text search across all descriptive text fields
CREATE INDEX IF NOT EXISTS idx_specimens_fts ON specimens
    USING GIN(to_tsvector('english',
        coalesce(name,                          '') || ' ' ||
        coalesce(description,                   '') || ' ' ||
        coalesce(habitat,                       '') || ' ' ||
        coalesce(habitat_overall_description,   '') || ' ' ||
        coalesce(geographic_info,               '') || ' ' ||
        coalesce(phenotype,                     '')
    ));

-- ---------------------------------------------------------------------------
-- TRIGGER: auto-update updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS specimens_updated_at ON specimens;
CREATE TRIGGER specimens_updated_at
    BEFORE UPDATE ON specimens
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- TRIGGER: auto-populate geom from lat/lng on INSERT or UPDATE
-- Means callers only need to set lat/lng — geom stays in sync automatically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_geom_from_lat_lng()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    ELSE
        NEW.geom = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS specimens_sync_geom ON specimens;
CREATE TRIGGER specimens_sync_geom
    BEFORE INSERT OR UPDATE OF lat, lng ON specimens
    FOR EACH ROW EXECUTE FUNCTION sync_geom_from_lat_lng();

-- ---------------------------------------------------------------------------
-- VIEW: one row per IUCN category (unnests the JSONB array)
-- Use for filtering by individual IUCN codes or joining a reference table.
--
-- Example queries:
--   SELECT * FROM specimens_by_iucn_category WHERE iucn_code = '1.5';
--   SELECT * FROM specimens_by_iucn_category WHERE iucn_class ILIKE '%wetland%';
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW specimens_by_iucn_category AS
SELECT
    s.id,
    s.plant_id,
    s.name,
    s.country,
    s.district,
    s.modern_district,
    s.date,
    s.lat,
    s.lng,
    s.habitat_overall_description,
    iucn_entry.value::TEXT                                                  AS iucn_category_full,
    -- Numeric code prefix: '1.5', '6.2', etc.
    (regexp_match(iucn_entry.value::TEXT, '^\d+\.?\d*'))[1]                AS iucn_code,
    -- Top-level class name: 'Forest', 'Wetlands (Inland)', etc.
    trim((regexp_match(iucn_entry.value::TEXT, '^\d+\.?\d*\s+([^-]+)'))[1]) AS iucn_class
FROM  specimens s
CROSS JOIN LATERAL jsonb_array_elements(s.habitat_iucn_category_description) AS iucn_entry;

-- ---------------------------------------------------------------------------
-- VIEW: specimen count summary per top-level IUCN habitat class
--
-- Example query:
--   SELECT * FROM habitat_class_summary WHERE specimen_count > 10;
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW habitat_class_summary AS
SELECT
    iucn_class,
    count(*)                    AS specimen_count,
    count(DISTINCT plant_id)    AS unique_specimens,
    count(DISTINCT country)     AS country_count,
    min(date)                   AS earliest_record,
    max(date)                   AS latest_record
FROM  specimens_by_iucn_category
WHERE iucn_class IS NOT NULL
GROUP BY iucn_class
ORDER BY specimen_count DESC;