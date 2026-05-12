import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SpecimenImage } from "./SpecimenImage";
import type { Specimen } from "../types/specimen";

// ── Mini-map ──────────────────────────────────────────────────────
function SpecimenMiniMap({ specimen }: { specimen: Specimen }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (specimen.latitude === null || specimen.longitude === null) return;
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [29.4, -19.0],
      zoom: 5,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
    });

    map.once("load", () => {
      map.fitBounds(
        [[25.2, -22.4], [33.1, -15.6]],
        { padding: 12, animate: false },
      );
    });

    const el = document.createElement("div");
    el.style.cssText =
      "width:10px;height:10px;background:#c4952a;border:2px solid #fff;" +
      "border-radius:50%;box-shadow:0 0 8px rgba(196,149,42,0.8)";

    new maplibregl.Marker({ element: el })
      .setLngLat([specimen.longitude, specimen.latitude])
      .addTo(map);

    return () => map.remove();
  }, [specimen.plant_id]);

  if (specimen.latitude === null || specimen.longitude === null) return null;

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: "1px solid var(--border)",
        position: "relative",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: 180 }} />
      <div
        style={{
          position: "absolute",
          bottom: 6,
          left: 8,
          fontFamily: "var(--font-mono)",
          fontSize: "0.58rem",
          color: "#fff",
          background: "rgba(10,8,4,0.65)",
          padding: "2px 6px",
          letterSpacing: "0.04em",
          pointerEvents: "none",
        }}
      >
        {specimen.latitude.toFixed(4)}°, {specimen.longitude.toFixed(4)}°
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function MetaRow({
  label,
  value,
  italic = false,
  mono = false,
}: {
  label: string;
  value: string | number | null | undefined;
  italic?: boolean;
  mono?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 8,
        padding: "4px 0",
        fontSize: "0.85rem",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--sepia)",
          paddingTop: 2,
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontStyle: italic ? "italic" : "normal",
          fontFamily: mono ? "var(--font-mono)" : undefined,
          fontSize: mono ? "0.78rem" : undefined,
          lineHeight: 1.4,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MetaGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.62rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase" as const,
          color: "var(--gold-text)",
          marginBottom: 8,
          paddingBottom: 4,
          borderBottom: "1px solid var(--parchment-dark)",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

/** Renders the IUCN category list as styled badges */
function IucnBadges({ categories }: { categories: string[] }) {
  if (!categories.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
      {categories.map((cat) => {
        const match = cat.match(/^(\d+\.?\d*)\s+(.+)$/);
        const code = match?.[1] ?? "";
        const label = match?.[2] ?? cat;
        return (
          <span
            key={cat}
            title={cat}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "var(--parchment-dark)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "2px 7px",
              fontSize: "0.72rem",
              lineHeight: 1.4,
            }}
          >
            {code && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  color: "var(--gold-text)",
                  fontWeight: 600,
                }}
              >
                {code}
              </span>
            )}
            <span style={{ color: "var(--ink-light)" }}>{label}</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Prev / Next navigation bar ────────────────────────────────────
function NavBar({
  specimen,
  specimens,
  onNavigate,
}: {
  specimen: Specimen;
  specimens: Specimen[];
  onNavigate: (s: Specimen) => void;
}) {
  const idx = specimens.findIndex((s) => s.plant_id === specimen.plant_id);
  const total = specimens.length;
  const prev = idx > 0 ? specimens[idx - 1] : null;
  const next = idx < total - 1 ? specimens[idx + 1] : null;

  const btnStyle = (enabled: boolean): React.CSSProperties => ({
    background: "none",
    border: "none",
    padding: "0 10px",
    height: "100%",
    fontFamily: "var(--font-mono)",
    fontSize: "0.7rem",
    letterSpacing: "0.06em",
    color: enabled ? "var(--sepia)" : "var(--border)",
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.4,
    transition: "color 0.12s",
    display: "flex",
    alignItems: "center",
    gap: 5,
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid var(--parchment-dark)",
        height: 36,
        flexShrink: 0,
      }}
    >
      <button
        disabled={!prev}
        onClick={() => prev && onNavigate(prev)}
        style={btnStyle(!!prev)}
        title={prev ? `← ${prev.name ?? prev.plant_id}` : undefined}
      >
        ← <span style={{ textTransform: "uppercase", fontSize: "0.6rem" }}>Prev</span>
      </button>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "0.62rem",
          color: "var(--sepia)",
          letterSpacing: "0.08em",
          borderLeft: "1px solid var(--parchment-dark)",
          borderRight: "1px solid var(--parchment-dark)",
        }}
      >
        {idx >= 0 ? `${idx + 1} / ${total}` : `— / ${total}`}
      </div>

      <button
        disabled={!next}
        onClick={() => next && onNavigate(next)}
        style={btnStyle(!!next)}
        title={next ? `${next.name ?? next.plant_id} →` : undefined}
      >
        <span style={{ textTransform: "uppercase", fontSize: "0.6rem" }}>Next</span> →
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export function DetailPanel({
  specimen,
  specimens = [],
  onNavigate,
}: {
  specimen: Specimen | null;
  specimens?: Specimen[];
  onNavigate?: (s: Specimen) => void;
}) {
  if (!specimen) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.8rem",
          gap: 16,
          letterSpacing: "0.08em",
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.35"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          <path d="M12 6v6M12 16h.01" strokeWidth="1.5" />
        </svg>
        <span>Select a specimen from the table or map</span>
        <span style={{ fontSize: "0.68rem", opacity: 0.6 }}>
          Click a row or a map marker
        </span>
      </div>
    );
  }

  // District: show modern name; if it differs from historical, show both
  const districtDisplay =
    specimen.modern_district &&
    specimen.district &&
    specimen.modern_district !== specimen.district
      ? `${specimen.modern_district} (hist. ${specimen.district})`
      : specimen.modern_district || specimen.district || null;

  // Altitude: altitude_m is a number — use typeof null-check, not !== ""
  const altitudeDisplay =
    specimen.altitude_m !== null
      ? `${specimen.altitude_m} m`
      : specimen.altitude_raw || null;

  const hasHabitat =
    specimen.habitat_overall_description ||
    specimen.habitat_iucn_category_description.length > 0 ||
    specimen.habitat;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── Left: image + footer ── */}
      <div
        style={{
          background: "#0d0a06",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, overflow: "hidden" }}>
          <SpecimenImage specimen={specimen} />
        </div>
      </div>

      {/* ── Right: metadata ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderLeft: "2px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {/* Prev / Next navigation */}
        {onNavigate && specimens.length > 0 && (
          <NavBar
            specimen={specimen}
            specimens={specimens}
            onNavigate={onNavigate}
          />
        )}

        {/* Scrollable metadata */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
        {/* Species header */}
        <div
          style={{
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.3rem",
              fontStyle: "italic",
              color: "var(--moss)",
              lineHeight: 1.3,
              marginBottom: 6,
            }}
          >
            {specimen.name ?? "Unknown species"}
          </h2>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.72rem",
              color: "var(--sepia)",
              letterSpacing: "0.08em",
            }}
          >
            {specimen.plant_id}
          </span>
        </div>

        {/* Collection */}
        <MetaGroup title="Collection">
          <MetaRow label="Date" value={specimen.date} />
          <MetaRow label="Collector" value={specimen.collector_name} />
          <MetaRow label="Coll. No." value={specimen.collector_number} mono />
        </MetaGroup>

        {/* Location */}
        <MetaGroup title="Location">
          <MetaRow label="Country" value={specimen.country} />
          <MetaRow label="District" value={districtDisplay} />
          <MetaRow label="Geography" value={specimen.geographic_info} />
          <MetaRow label="Grid ref." value={specimen.grid_reference} mono />
          <MetaRow label="Altitude" value={altitudeDisplay} />
        </MetaGroup>

        {/* Habitat — only render group if there is something to show */}
        {hasHabitat && (
          <MetaGroup title="Habitat">
            {/* 1. Top-level summary e.g. "Forest, Wetlands (Inland)" */}
            <MetaRow
              label="Type"
              value={specimen.habitat_overall_description}
            />

            {/* 2. IUCN category badges */}
            {specimen.habitat_iucn_category_description.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  gap: 8,
                  padding: "4px 0",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    color: "var(--sepia)",
                    paddingTop: 4,
                    letterSpacing: "0.03em",
                  }}
                >
                  IUCN cat.
                </span>
                <IucnBadges
                  categories={specimen.habitat_iucn_category_description}
                />
              </div>
            )}

            {/* 3. Free-text note as supplementary context */}
            {specimen.habitat && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  background: "var(--parchment-dark)",
                  borderLeft: "2px solid var(--gold)",
                  fontSize: "0.82rem",
                  color: "var(--ink-light)",
                  fontStyle: "italic",
                  lineHeight: 1.5,
                }}
              >
                {specimen.habitat}
              </div>
            )}
          </MetaGroup>
        )}

        {/* Botany */}
        <MetaGroup title="Botany">
          <MetaRow label="Phenotype" value={specimen.phenotype} italic />
          <MetaRow label="Flowering" value={specimen.flowering_state} />
        </MetaGroup>

        {/* Verbatim field notes */}
        {specimen.description && (
          <MetaGroup title="Field Notes">
            <div
              style={{
                background: "var(--parchment-dark)",
                borderLeft: "3px solid var(--gold)",
                padding: "12px 14px",
                fontStyle: "italic",
                color: "var(--ink-light)",
                fontSize: "0.85rem",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              {specimen.description}
            </div>
          </MetaGroup>
        )}
        </div> {/* end scrollable metadata */}

        <SpecimenMiniMap specimen={specimen} />
      </div>
    </div>
  );
}
