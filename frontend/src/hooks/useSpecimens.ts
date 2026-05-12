import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api } from "../api";
import { mapApiSpecimen } from "../types/specimen";
import type { Specimen, SpecimenFilters } from "../types/specimen";
import { DEFAULT_FILTERS } from "../types/specimen";

const API = import.meta.env.VITE_API_URL ?? "";

// ── Resolve image availability — single request instead of N+1 ────
async function resolveImageAvailability(signal: AbortSignal): Promise<Set<string>> {
  const res = await fetch(`${API}/meta/image-ids`, { signal });
  if (!res.ok) return new Set();
  const ids: string[] = await res.json();
  return new Set(ids);
}

export function useSpecimens() {
  // ── Remote data ───────────────────────────────────────────────
  const [allSpecimens, setAllSpecimens] = useState<Specimen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const [districts, setDistricts] = useState<string[]>([]);
  const [habitats, setHabitats] = useState<string[]>([]);

  // ── Image availability (resolved via /images/{id}, not image_path) ─
  const [imageAvailability, setImageAvailability] = useState<Set<string>>(
    new Set(),
  );
  const [imagesLoading, setImagesLoading] = useState(true);

  // ── Filter / selection state ──────────────────────────────────
  const [filters, setFilters] = useState<SpecimenFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Specimen | null>(null);

  // ── Load all specimens on mount ───────────────────────────────
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setImagesLoading(true);
      setError(null);

      try {
        const [specimensRes, districtsRes] = await Promise.all([
          api.listSpecimens({ page: 1, page_size: 2000 }),
          api.getModernDistricts(),
        ]);

        if (controller.signal.aborted) return;

        const mapped = specimensRes.results.map(mapApiSpecimen);
        setAllSpecimens(mapped);
        setTotalCount(specimensRes.total);
        setDistricts(districtsRes.values);

        const uniqueHabitats = [
          ...new Set(mapped.flatMap((s) => s.habitat_iucn_category_description)),
        ].sort();
        setHabitats(uniqueHabitats);
        setLoading(false);

        // Resolve image availability in the background — single request.
        const available = await resolveImageAvailability(controller.signal);
        if (!controller.signal.aborted) {
          setImageAvailability(available);
          setImagesLoading(false);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Failed to load specimens",
          );
          setLoading(false);
          setImagesLoading(false);
        }
      }
    }

    load();
    return () => controller.abort();
  }, []);

  // ── Detail cache — avoids re-fetching when revisiting a specimen ─
  const detailCache = useRef<Map<string, Specimen>>(new Map());

  // ── Fetch full detail for selected specimen ───────────────────
  const selectSpecimen = useCallback(async (specimen: Specimen | null) => {
    if (!specimen) {
      setSelected(null);
      return;
    }
    setSelected(specimen);

    const cached = detailCache.current.get(specimen.plant_id);
    if (cached) {
      setSelected(cached);
      return;
    }

    try {
      const detail = await api.getSpecimen(specimen.plant_id);
      const mapped = mapApiSpecimen(detail);
      detailCache.current.set(specimen.plant_id, mapped);
      setSelected(mapped);
    } catch {
      // Non-fatal — keep the summary version
    }
  }, []);

  // ── Filter helpers ────────────────────────────────────────────
  function setFilter(key: keyof SpecimenFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function setBbox(bbox: [number, number, number, number] | null) {
    setFilters((prev) => ({ ...prev, bbox }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  // ── Client-side filtering ─────────────────────────────────────
  const filteredSpecimens = useMemo(() => {
    return allSpecimens.filter((s) => {
      if (
        filters.species &&
        !s.name?.toLowerCase().includes(filters.species.toLowerCase())
      )
        return false;

      if (
        filters.collector &&
        !s.collector_name
          ?.toLowerCase()
          .includes(filters.collector.toLowerCase())
      )
        return false;

      if (
        filters.plant_id &&
        !s.plant_id?.toLowerCase().includes(filters.plant_id.toLowerCase())
      )
        return false;

      if (filters.district && s.modern_district !== filters.district) return false;
      if (
        filters.habitat_iucn &&
        !s.habitat_iucn_category_description.includes(filters.habitat_iucn)
      )
        return false;

      if (filters.date_from && s.date && s.date < filters.date_from)
        return false;
      if (filters.date_to && s.date && s.date > filters.date_to) return false;

      const altMin = filters.alt_min ? parseFloat(filters.alt_min) : null;
      const altMax = filters.alt_max ? parseFloat(filters.alt_max) : null;
      if (altMin !== null && (s.altitude_m ?? 0) < altMin) return false;
      if (altMax !== null && (s.altitude_m ?? Infinity) > altMax) return false;

      if (filters.bbox) {
        if (s.latitude === null || s.longitude === null) return false;
        const [minLng, minLat, maxLng, maxLat] = filters.bbox;
        if (s.longitude < minLng || s.longitude > maxLng) return false;
        if (s.latitude < minLat || s.latitude > maxLat) return false;
      }

      return true;
    });
  }, [allSpecimens, filters]);

  return {
    allSpecimens,
    filteredSpecimens,
    totalCount,
    loading,
    error,
    filters,
    setFilter,
    setBbox,
    clearFilters,
    selected,
    setSelected: selectSpecimen,
    districts,
    habitats,
    // Image availability — use these instead of s.image_path for UI logic
    imageAvailability,
    imagesLoading,
  };
}
