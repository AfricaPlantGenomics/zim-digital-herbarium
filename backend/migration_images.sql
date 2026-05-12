-- Migration: add specimen_images table
-- Run with: psql herbarium_dev -f migration_images.sql

CREATE TABLE IF NOT EXISTS specimen_images (
    id          SERIAL PRIMARY KEY,
    plant_id    TEXT NOT NULL REFERENCES specimens(plant_id) ON DELETE CASCADE,
    rotation    TEXT NOT NULL CHECK (rotation IN ('cw', 'ccw', 'unknown')),
    filename    TEXT NOT NULL,
    mime_type   TEXT NOT NULL DEFAULT 'image/jpeg',
    image_data  BYTEA NOT NULL,
    file_size   INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (plant_id, rotation)
);

CREATE INDEX IF NOT EXISTS idx_images_plant_id ON specimen_images(plant_id);