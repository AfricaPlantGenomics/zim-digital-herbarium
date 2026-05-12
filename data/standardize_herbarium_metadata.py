import pandas as pd
import re
import json
from pathlib import Path


def parse_altitude(value) -> float | None:
    """
    Parse altitude value from various formats and convert to meters (as float or int).
    Handles numbers, ranges, commas as thousand separators, and feet/feet units.
    """
    if pd.isna(value):
        return None
    s = str(value).lower().strip()
    # Remove commas used as thousand separators (e.g., 3,400 → 3400)
    s = re.sub(r'(?<=\d),(?=\d)', '', s)
    # Extract all numbers (including decimals)
    numbers = re.findall(r'\d+\.?\d*', s)
    if not numbers:
        return None
    # Convert to floats and take average if multiple numbers (range)
    nums = [float(n) for n in numbers]
    val = sum(nums) / len(nums)
    # Convert feet to meters if unit detected
    if any(unit in s for unit in ["ft", "feet", "'"]):
        val_m = val * 0.3048
    else:
        val_m = val
    # Return clean number: int if whole, else float with max 2 decimals
    if val_m.is_integer():
        return int(val_m)
    else:
        return float(f"{val_m:.2f}".rstrip('0').rstrip('.'))


def clean_altitude_display(value) -> str:
    """Convert altitude value to clean display string."""
    if pd.isna(value):
        return ""
    if isinstance(value, (int, float)) and float(value).is_integer():
        return str(int(value))
    else:
        return f"{float(value):.2f}".rstrip('0').rstrip('.')


def parse_habitat_categories(raw_value) -> dict:
    """
    Parse the Habitat_categories field into two structured fields:

    - habitat_overall_types: list of top-level habitat names only
        e.g. ["Forest"] or ["Forest", "Rocky Areas (Inland)"]

    - habitat_iucn_categories: list of full IUCN category strings
        e.g. ["1.5 Forest - Subtropical/Tropical Dry",
               "6.2 Rocky Areas (Inland) - Inland Rocky Areas"]

    Input examples:
        "Forest"
        "1.5 Forest - Subtropical/Tropical Dry"
        "1.5 Forest - Subtropical/Tropical Dry | 6.2 Rocky Areas (Inland) - Inland Rocky Areas"
    """
    if pd.isna(raw_value) or str(raw_value).strip() == "":
        return {
            "habitat_overall_types": [],
            "habitat_iucn_categories": []
        }

    raw_str = str(raw_value).strip()

    # Split by pipe separator for multiple habitats
    entries = [e.strip() for e in raw_str.split("|") if e.strip()]

    overall_types = []
    iucn_categories = []

    for entry in entries:
        # Check if the entry starts with a numeric IUCN code (e.g. "1.5 Forest - ...")
        iucn_match = re.match(r'^(\d+\.?\d*)\s+(.+)$', entry)

        if iucn_match:
            # Full IUCN entry: "1.5 Forest - Subtropical/Tropical Dry"
            iucn_categories.append(entry)

            # Extract top-level habitat type: everything before the " - " separator
            # e.g. "Forest - Subtropical/Tropical Dry" → "Forest"
            description_part = iucn_match.group(2)  # "Forest - Subtropical/Tropical Dry"
            top_level = description_part.split(" - ")[0].strip()
            if top_level and top_level not in overall_types:
                overall_types.append(top_level)
        else:
            # Plain name only, e.g. "Forest"
            iucn_categories.append(entry)   # store as-is since no code available
            if entry not in overall_types:
                overall_types.append(entry)

    return {
        "habitat_overall_types": overall_types,
        "habitat_iucn_categories": iucn_categories
    }


def main():
    # ========================= CONFIG =========================
    EXCEL_FILE = '/Users/jatemia/Documents/MPI/projects/herbarium/data/herbarium-all_updated.xlsx'
    JSON_FILE = '/Users/jatemia/Documents/MPI/projects/herbarium/data/merged_herbarium_records14042026.json'
    OUTPUT_CSV = '/Users/jatemia/Documents/MPI/projects/herbarium/data/standardized_altitudes17042026.csv'
    OUTPUT_JSON = '/Users/jatemia/Documents/MPI/projects/herbarium/data/standardized_merged_herbarium_records17042026.json'

    # ========================= PROCESS EXCEL =========================
    print("Loading and processing Excel file...")
    meta_data = pd.read_excel(EXCEL_FILE)

    # Parse raw altitude into meters
    meta_data["Altitude_m"] = meta_data["Altitude"].apply(parse_altitude)

    # Create clean display version
    meta_data["Altitude_m_clean"] = meta_data["Altitude_m"].apply(clean_altitude_display)

    # Save standardized version
    meta_data.to_csv(OUTPUT_CSV, index=False, sep="%")
    print(f"Altitude standardization saved to {OUTPUT_CSV}")

    # ========================= UPDATE JSON =========================
    print("Loading JSON data...")
    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        json_data = json.load(f)

    # Prepare lookup dictionary with all needed columns
    target_columns = ['Plant_ID', 'Current_district', 'Altitude_m_clean', 'Habitat_categories']
    meta_data['Plant_ID'] = meta_data['Plant_ID'].astype(str).str.strip()

    # Only keep columns that actually exist in the Excel (guard against missing col)
    available_cols = [c for c in target_columns if c in meta_data.columns]
    if 'Habitat_categories' not in available_cols:
        print("WARNING: 'Habitat_categories' column not found in Excel — habitat fields will be empty.")

    lookup = meta_data[available_cols].set_index('Plant_ID').to_dict('index')

    # Update JSON records
    matches_found = 0
    country_filled = 0

    for record in json_data:
        label = record.get('label', {})

        # ----- Fill empty country with "Zimbabwe" -----
        if not label.get('country') or str(label.get('country')).strip() == "":
            label['country'] = "Zimbabwe"
            country_filled += 1

        # ----- Match by Plant_ID and update fields -----
        raw_id = label.get('plant_id')
        if not raw_id:
            continue

        json_id = str(raw_id).strip()
        if json_id not in lookup:
            continue

        excel_row = lookup[json_id]

        # Parse habitat categories into structured fields
        raw_habitat = excel_row.get('Habitat_categories', None)
        habitat_parsed = parse_habitat_categories(raw_habitat)

        label.update({
            'modern_district': excel_row.get('Current_district'),
            'altitude_m': excel_row.get('Altitude_m_clean'),
            # Comma-separated string of top-level types, e.g. "Forest" or "Forest, Rocky Areas (Inland)"
            'habitat_overall_description': ", ".join(habitat_parsed["habitat_overall_types"]),
            # List of full IUCN category strings (list keeps multi-value structure clean)
            'habitat_iucn_category_description': habitat_parsed["habitat_iucn_categories"],
        })

        matches_found += 1

    # Save updated JSON
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=4, ensure_ascii=False)

    print(f"Task complete!")
    print(f"  - Matched and updated {matches_found} records.")
    print(f"  - Filled 'country' → 'Zimbabwe' for {country_filled} records.")
    print(f"  - Updated JSON saved to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()