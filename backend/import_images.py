#!/usr/bin/env python3
"""
Image import script — copies images to disk and records metadata in PostgreSQL.

For each specimen in the JSON, finds _cw.jpg and/or _ccw.jpg variants,
copies the original to data/images/fullsize/, generates a 400px-wide thumbnail
at data/images/thumbs/{plant_id}.jpg, then inserts metadata into specimen_images.

Usage:
    python import_images.py specimens.json \
        --images-dir /path/to/processed_images/ \
        --output-dir data/images

    python import_images.py specimens.json \
        --images-dir ./processed_images/ \
        --output-dir data/images \
        --clear

    python import_images.py specimens.json \
        --images-dir ./processed_images/ \
        --output-dir data/images \
        --thumbs-only

Requirements:
    pip install psycopg2-binary python-dotenv Pillow
"""

import json
import os
import re
import shutil
import sys
import argparse
from pathlib import Path
from typing import Dict, Any

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

try:
    from PIL import Image as PilImage
except ImportError:
    print("ERROR: Pillow not installed. Run: pip install Pillow", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


UPSERT_SQL = """
INSERT INTO specimen_images (plant_id, rotation, filename, file_size)
VALUES (%s, %s, %s, %s)
ON CONFLICT (plant_id, rotation) DO UPDATE SET
    filename  = EXCLUDED.filename,
    file_size = EXCLUDED.file_size
"""


def detect_rotation(filename: str) -> str:
    name = filename.lower()
    if "_ccw" in name:
        return "ccw"
    if "_cw" in name:
        return "cw"
    return "unknown"


def find_images_for_specimen(raw: Dict[str, Any], images_dir: Path) -> list[Path]:
    """Find the image file using the exact image_path from the record."""
    image_path = raw.get("image_path", "") or ""
    if not image_path:
        return []

    filename = Path(image_path).name
    stem = Path(filename).stem
    found: list[Path] = []

    for ext in [".jpg", ".jpeg", ".png"]:
        candidate = images_dir / f"{stem}{ext}"
        if candidate.exists() and candidate not in found:
            found.append(candidate)

    exact_candidate = images_dir / filename
    if exact_candidate.exists() and exact_candidate not in found:
        found.append(exact_candidate)

    return found


def make_thumbnail(src_path: Path, dest_path: Path, max_width: int = 400) -> None:
    with PilImage.open(src_path) as img:
        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize(
                (max_width, int(img.height * ratio)),
                PilImage.LANCZOS,
            )
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        img.convert("RGB").save(dest_path, format="JPEG", quality=82, optimize=True)


def main():
    parser = argparse.ArgumentParser(description="Import herbarium images to disk + PostgreSQL")
    parser.add_argument("json_file", help="Path to specimens JSON file")
    parser.add_argument("--images-dir", required=True, help="Folder containing source image files")
    parser.add_argument("--output-dir", default="data/images", help="Output root (default: data/images)")
    parser.add_argument("--clear", action="store_true", help="Delete disk files and truncate table before import")
    parser.add_argument("--thumbs-only", action="store_true", help="Regenerate thumbnails without re-copying fullsize files")
    args = parser.parse_args()

    json_path = Path(args.json_file)
    images_dir = Path(args.images_dir)
    output_dir = Path(args.output_dir)
    fullsize_dir = output_dir / "fullsize"
    thumbs_dir = output_dir / "thumbs"

    if not json_path.exists():
        print(f"ERROR: JSON file not found: {json_path}", file=sys.stderr)
        sys.exit(1)

    if not images_dir.exists():
        print(f"ERROR: Images directory not found: {images_dir}", file=sys.stderr)
        sys.exit(1)

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set.", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {json_path} …")
    with open(json_path, encoding="utf-8") as f:
        records = json.load(f)
    print(f"Found {len(records)} specimen records.")
    print(f"Images directory: {images_dir}")
    print(f"Output directory: {output_dir}")

    fullsize_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    conn = psycopg2.connect(database_url)

    if args.clear:
        # Delete disk files
        for f in fullsize_dir.iterdir():
            f.unlink(missing_ok=True)
        for f in thumbs_dir.iterdir():
            f.unlink(missing_ok=True)
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE specimen_images RESTART IDENTITY;")
        conn.commit()
        print("Cleared existing images (disk + DB).")

    stats = {
        "images_stored": 0,
        "specimens_with_images": 0,
        "specimens_missing_images": 0,
        "skipped_no_plant_id": 0,
    }

    with conn.cursor() as cur:
        for i, raw in enumerate(records):
            plant_id = raw.get("label", {}).get("plant_id", "")
            if not plant_id:
                stats["skipped_no_plant_id"] += 1
                continue

            image_files = find_images_for_specimen(raw, images_dir)

            if not image_files:
                stats["specimens_missing_images"] += 1
                if i < 20 or stats["specimens_missing_images"] <= 5:
                    print(f"  [NO IMAGE] {plant_id} — {raw.get('image_path', '')}")
                continue

            stats["specimens_with_images"] += 1

            for img_path in image_files:
                rotation = detect_rotation(img_path.name)
                dest_fullsize = fullsize_dir / img_path.name
                thumb_dest = thumbs_dir / f"{plant_id}.jpg"

                if not args.thumbs_only:
                    shutil.copy2(img_path, dest_fullsize)

                make_thumbnail(img_path, thumb_dest)

                file_size = dest_fullsize.stat().st_size if dest_fullsize.exists() else img_path.stat().st_size

                cur.execute(UPSERT_SQL, (
                    plant_id,
                    rotation,
                    img_path.name,
                    file_size,
                ))
                stats["images_stored"] += 1
                print(f"  ✓ {plant_id} [{rotation}] {img_path.name} ({file_size // 1024}KB)")

    conn.commit()
    conn.close()

    print(f"\nDone.")
    print(f"  Images stored:            {stats['images_stored']}")
    print(f"  Specimens with images:    {stats['specimens_with_images']}")
    print(f"  Specimens missing images: {stats['specimens_missing_images']}")
    print(f"  Skipped (no plant_id):    {stats['skipped_no_plant_id']}")


if __name__ == "__main__":
    main()
