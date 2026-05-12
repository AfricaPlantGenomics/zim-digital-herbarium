# SRGH Herbarium — Technical Reference

## Stack

| Layer    | Technology                              |
| -------- | --------------------------------------- |
| Frontend | React + TypeScript + Vite + MapLibre GL |
| Backend  | FastAPI + asyncpg                       |
| Database | PostgreSQL 17 + PostGIS                 |

---

## Project Structure

```
herbarium/
├── backend/
│   ├── Schema.sql               # DB schema
│   ├── migration_images.sql     # Adds specimen_images table
│   ├── migration_drop_blobs.sql # Removes BYTEA column (one-time migration)
│   ├── import_specimens.py      # JSON → PostgreSQL
│   ├── import_images.py         # Images → disk + PostgreSQL metadata
│   └── api/
│       ├── main.py
│       └── app/
│           ├── config.py
│           ├── database.py
│           ├── schemas.py
│           └── routers/
│               ├── specimens.py
│               ├── images.py
│               └── meta.py
├── data/
│   ├── merge_transcriptions.py           # Merge OCR batches
│   ├── standardize_herbarium_metadata.py # Excel → enriched JSON
│   ├── herbarium-all_updated.xlsx        # Master spreadsheet
│   ├── standardized_merged_herbarium_records*.json
│   └── images/
│       ├── fullsize/
│       └── thumbs/
└── frontend/
    └── src/
        ├── api.ts
        ├── App.tsx
        ├── types/specimen.ts
        ├── hooks/useSpecimens.ts
        └── components/
```

---

## Local Setup

**Prerequisites:** PostgreSQL 17 + PostGIS, Python 3.11+, Node.js 18+

### 1. Database

```bash
createdb herbarium_dev
psql herbarium_dev -f backend/Schema.sql -f backend/migration_images.sql
```

### 2. Data pipeline

```bash
export DATABASE_URL="postgresql://$(whoami)@localhost:5432/herbarium_dev"
python3 backend/import_specimens.py data/standardized_merged_herbarium_records.json
python3 backend/import_images.py data/standardized_merged_herbarium_records.json \
  --images-dir data/all_images/processed_images/fullsize \
  --output-dir data/images
```

Use `--clear` to truncate and reimport. To regenerate the standardized JSON from the master spreadsheet:

```bash
python3 data/standardize_herbarium_metadata.py
```

### 3. Backend

```bash
cd backend/api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DATABASE_URL
uvicorn main:app --reload --port 8000
```

Docs at `http://localhost:8000/docs`

### 4. Frontend

```bash
cd frontend
npm install
cp src/.env.example src/.env   # set VITE_API_URL=http://localhost:8000
npm run dev
```

App at `http://localhost:5173`

---

## API Endpoints

| Method | Endpoint                        | Description                     |
| ------ | ------------------------------- | ------------------------------- |
| GET    | `/health`                       | Health check                    |
| GET    | `/specimens`                    | Paginated list + filters        |
| GET    | `/specimens/search?q=`          | Full-text search                |
| GET    | `/specimens/bbox`               | Specimens in map viewport       |
| GET    | `/specimens/{plant_id}`         | Single specimen                 |
| GET    | `/images/{plant_id}`            | Image list (`url`, `thumb_url`) |
| GET    | `/images/{plant_id}/first`      | 302 → fullsize file             |
| GET    | `/images/{plant_id}/{rotation}` | 302 → fullsize file             |
| GET    | `/meta/districts`               | Historical district names       |
| GET    | `/meta/modern-districts`        | Modern district names           |
| GET    | `/meta/collectors`              | Collector names                 |
| GET    | `/meta/species`                 | Species names                   |
| GET    | `/meta/habitat-classes`         | Top-level habitat types         |
| GET    | `/meta/iucn-categories`         | Full IUCN category strings      |
| GET    | `/meta/habitat-summary`         | Per-habitat aggregate stats     |
| GET    | `/meta/altitude-range`          | Min / max / avg altitude        |
| GET    | `/meta/stats`                   | Collection summary              |

### `/specimens` filter parameters

| Parameter         | Description                          |
| ----------------- | ------------------------------------ |
| `district`        | Partial match on historical district |
| `modern_district` | Partial match on modern district     |
| `collector`       | Partial match on collector name      |
| `name`            | Partial match on species name        |
| `date_from`       | ISO date lower bound                 |
| `date_to`         | ISO date upper bound                 |
| `alt_min`         | Minimum altitude (m)                 |
| `alt_max`         | Maximum altitude (m)                 |
| `habitat_overall` | Partial match on top-level habitat   |
| `habitat_iucn`    | Exact IUCN category string           |
| `has_coords`      | `true` / `false`                     |

---

## Data

- **1,513 specimens** collected 1902–2019
- **580 georeferenced** (Google Geocoding API or QDS grid parsing)
- **550 collectors**, **314 historical districts**, **54 modern districts**
- **686 specimens** with numeric altitude; **1,513** with IUCN habitat classification
- Images on disk; thumbnails served by nginx directly, full-size via FastAPI 302 redirect

### Field mapping

| JSON field                                  | DB column                                 | Notes                                                   |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| `modern_district`                           | `modern_district`                         | Mapped from historical district name                    |
| `altitude_m`                                | `altitude_m` NUMERIC                      | Raw string parsed to metres; raw kept as `altitude_raw` |
| `habitat_iucn_category_description`         | `habitat_iucn_category_description` JSONB | IUCN category array                                     |
| `habitat_overall_description`               | `habitat_overall_description`             | Comma-separated top-level types                         |
| `extracted_metadata.Habitat`                | `habitat`                                 | Free-text label note                                    |
| `extracted_metadata.Geographic_information` | `geographic_info`                         | Locality detail                                         |
| `extracted_metadata.Flowering state`        | `flowering_state`                         | Botany section                                          |
| `extracted_metadata.Phenotype`              | `phenotype`                               | Botany section                                          |
