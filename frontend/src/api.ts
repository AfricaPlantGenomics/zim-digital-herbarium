// Central API client — change VITE_API_URL in .env to point at production
const API = import.meta.env.VITE_API_URL ?? "";

// ── Raw API response types (match backend Pydantic schemas) ──────────────────

export interface ApiSpecimenSummary {
  plant_id: string;
  name: string | null;
  collector_name: string | null;

  district: string | null;
  modern_district: string | null;
  country: string | null;

  date: string | null;
  date_raw: string | null;

  lat: number | null;
  lng: number | null;
  coord_source: string | null;

  image_path: string | null;

  altitude_raw: string | null;
  altitude_m: number | null;

  habitat: string | null;
  habitat_overall_description: string | null;
  habitat_iucn_category_description: string[];
}

export interface ApiSpecimenDetail extends ApiSpecimenSummary {
  collector_number: string | null;
  grid_reference: string | null;
  description: string | null;
  geographic_info: string | null;
  flowering_state: string | null;
  phenotype: string | null;
  geocode_type: string | null;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  results: T[];
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function get<T>(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  const url = new URL(`${API}${path}`, API ? undefined : window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const api = {
  listSpecimens: (params: {
    page?: number;
    page_size?: number;
    district?: string;
    modern_district?: string;
    country?: string;
    collector?: string;
    name?: string;
    date_from?: string;
    date_to?: string;
    alt_min?: number;
    alt_max?: number;
    habitat_overall?: string;
    habitat_iucn?: string;
    has_coords?: boolean | null;
  }) => get<PaginatedResponse<ApiSpecimenSummary>>("/specimens", params),

  searchSpecimens: (q: string, page = 1, page_size = 200) =>
    get<PaginatedResponse<ApiSpecimenSummary>>("/specimens/search", {
      q,
      page,
      page_size,
    }),

  getByBbox: (
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    limit = 2000,
  ) =>
    get<ApiSpecimenSummary[]>("/specimens/bbox", {
      min_lng: minLng,
      min_lat: minLat,
      max_lng: maxLng,
      max_lat: maxLat,
      limit,
    }),

  getSpecimen: (plantId: string) =>
    get<ApiSpecimenDetail>(`/specimens/${plantId}`),

  getDistricts: () => get<{ values: string[] }>("/meta/districts"),
  getModernDistricts: () => get<{ values: string[] }>("/meta/modern-districts"),
  getCollectors: () => get<{ values: string[] }>("/meta/collectors"),
  getHabitatClasses: () => get<{ values: string[] }>("/meta/habitat-classes"),
  getIucnCategories: () => get<{ values: string[] }>("/meta/iucn-categories"),
  getStats: () => get<Record<string, unknown>>("/meta/stats"),
};
