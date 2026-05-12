-- Phase 1: drop BYTEA blobs, add thumb_filename column
-- Run ONLY after the new import (Phase 3) is complete and verified.
ALTER TABLE specimen_images DROP COLUMN IF EXISTS image_data;
ALTER TABLE specimen_images DROP COLUMN IF EXISTS mime_type;
ALTER TABLE specimen_images ADD COLUMN IF NOT EXISTS thumb_filename TEXT;
CREATE INDEX IF NOT EXISTS idx_images_thumb ON specimen_images(plant_id);
