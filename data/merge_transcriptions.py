import os
import json
from pathlib import Path

# ========================= CONFIGURATION =========================
INPUT_DIR = "data/corrected_transcriptions"
OUTPUT_FILE = "data/merged_herbarium_records14042026.json"

# <<< CUSTOMIZE THIS PATH >>>
# Example: "processed_images/" or "images/herbarium/" or full URL
CUSTOM_IMAGE_BASE_PATH = "data/all_images/processed_images/fullsize" #"processed_images"

# =================================================================

def update_image_path(record: dict, new_base_path: str) -> None:
    """Update the image_path in the record to use the custom base path."""
    if "image_path" in record:
        # Extract just the filename (e.g., IMG_4549_ccw.jpg)
        original_path = record["image_path"]
        filename = os.path.basename(original_path)
        
        # Create new path: "processed_images/IMG_4549_ccw.jpg"
        record["image_path"] = f"{new_base_path.rstrip('/')}/{filename}"


def main():
    merged_data = []
    
    input_path = Path(INPUT_DIR)
    
    print(f"Scanning directory: {input_path}")
    
    # Process all JSON files
    json_files = list(input_path.glob("*.json"))
    print(f"Found {len(json_files)} JSON files to merge.")
    
    for filepath in json_files:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Update image_path with custom base path
            update_image_path(data, CUSTOM_IMAGE_BASE_PATH)
            
            merged_data.append(data)
            
        except Exception as e:
            print(f"Error processing {filepath.name}: {e}")
    
    # Save merged data
    output_path = Path(OUTPUT_FILE)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(merged_data, f, indent=2, ensure_ascii=False)
    
    print(f"\nSuccess! Merged {len(merged_data)} records.")
    print(f"Output saved to: {output_path}")
    print(f"Image paths updated to start with: '{CUSTOM_IMAGE_BASE_PATH}/'")


if __name__ == "__main__":
    main()