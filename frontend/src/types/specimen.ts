// This file defines the shape of data flowing through the entire app.
// Change it here and TypeScript will flag every place that breaks.

export interface Specimen {
  plant_id: string;
  name: string | null;

  // Location
  district: string | null; // original historical district on label
  modern_district: string | null; // corrected/current district name
  country: string | null;

  // Date
  date: string | null; // "YYYY-MM-DD" (parsed)
  date_raw: string | null;

  // Altitude
  altitude_raw: string | null; // original string, e.g. "c. 2100 m"
  altitude_m: number | null; // standardised metres

  // Collection
  collector_name: string | null;
  collector_number: string | null;

  // Spatial
  grid_reference: string | null;
  latitude: number | null; // mapped from API "lat"
  longitude: number | null; // mapped from API "lng"
  coord_source: string | null;

  // Descriptions
  description: string | null;
  geographic_info: string | null;
  flowering_state: string | null;
  phenotype: string | null;

  // Habitat — three levels of specificity
  habitat: string | null; // free-text from extracted_metadata
  habitat_overall_description: string | null; // e.g. "Forest, Wetlands (Inland)"
  habitat_iucn_category_description: string[]; // e.g. ["1.5 Forest - ...", "5.1 ..."]

  // Image
  image_path: string | null;
}

// ── Filter state ──────────────────────────────────────────────────────────────
export interface SpecimenFilters {
  species: string;
  collector: string;
  plant_id: string;
  date_from: string;
  date_to: string;
  district: string;
  habitat: string;
  habitat_iucn: string;
  alt_min: string;
  alt_max: string;
  bbox: [number, number, number, number] | null;
}

export const DEFAULT_FILTERS: SpecimenFilters = {
  species: "",
  collector: "",
  plant_id: "",
  date_from: "",
  date_to: "",
  district: "",
  habitat: "",
  habitat_iucn: "",
  alt_min: "",
  alt_max: "",
  bbox: null,
};

// ── API → Specimen mapper ─────────────────────────────────────────────────────
// Uses `any` access for fields that may not yet be declared in the generated
// ApiSpecimenSummary / ApiSpecimenDetail types, so a stale api.ts never
// silently drops real values that the backend is already returning.
import type { ApiSpecimenSummary, ApiSpecimenDetail } from "../api";

export function mapApiSpecimen(
  raw: ApiSpecimenSummary | ApiSpecimenDetail,
): Specimen {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any; // escape hatch — lets us read fields not yet in generated types

  return {
    plant_id: r.plant_id ?? "",
    name: r.name ?? null,

    // Location
    district: r.district ?? null,
    modern_district: r.modern_district ?? null, // NOTE: DB col is modern_district (no typo)
    country: r.country ?? null,

    // Date
    date: r.date ?? null,
    date_raw: r.date_raw ?? null,

    // Altitude — both fields come from the API directly
    altitude_raw: r.altitude_raw ?? null,
    altitude_m: r.altitude_m != null ? Number(r.altitude_m) : null,

    // Collection
    collector_name: r.collector_name ?? null,
    collector_number: r.collector_number ?? null,

    // Spatial
    grid_reference: r.grid_reference ?? null,
    latitude: r.lat ?? null,
    longitude: r.lng ?? null,
    coord_source: r.coord_source ?? null,

    // Descriptions
    description: r.description ?? null,
    geographic_info: r.geographic_info ?? null,
    flowering_state: r.flowering_state ?? null,
    phenotype: r.phenotype ?? null,

    // Habitat
    habitat: r.habitat ?? null,
    habitat_overall_description: r.habitat_overall_description ?? null,
    habitat_iucn_category_description: Array.isArray(
      r.habitat_iucn_category_description,
    )
      ? r.habitat_iucn_category_description
      : [],

    // Image
    image_path: r.image_path ?? null,
  };
}
