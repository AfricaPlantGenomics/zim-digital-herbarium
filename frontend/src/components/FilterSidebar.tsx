import type { SpecimenFilters } from "../types/specimen";
import { Combobox } from "./Combobox";

interface FilterSidebarProps {
  filters: SpecimenFilters;
  onFilterChange: (key: keyof SpecimenFilters, value: string) => void;
  onClearFilters: () => void;
  onClearBbox: () => void;
  districts: string[];
  habitats: string[];
  hasBbox: boolean;
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--parchment)",
        padding: "14px",
      }}
    >
      <h3
        className="mono"
        style={{
          fontSize: "0.65rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--sepia)",
          marginBottom: "10px",
          paddingBottom: "6px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

export function FilterSidebar({
  filters,
  onFilterChange,
  onClearFilters,
  onClearBbox,
  districts,
  habitats,
  hasBbox,
}: FilterSidebarProps) {
  return (
    <>
      <FilterSection title="Specimen">
        <label>Species name</label>
        <input
          type="text"
          placeholder="Search species…"
          value={filters.species}
          onChange={(e) => onFilterChange("species", e.target.value)}
        />

        <label>Collector</label>
        <input
          type="text"
          placeholder="Collector name…"
          value={filters.collector}
          onChange={(e) => onFilterChange("collector", e.target.value)}
        />

        <label>Plant ID</label>
        <input
          type="text"
          placeholder="SRGH…"
          value={filters.plant_id}
          onChange={(e) => onFilterChange("plant_id", e.target.value)}
        />
      </FilterSection>

      <FilterSection title="Collection Date">
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          <div>
            <label>From</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => onFilterChange("date_from", e.target.value)}
            />
          </div>
          <div>
            <label>To</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => onFilterChange("date_to", e.target.value)}
            />
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Location">
        <label>District</label>
        <Combobox
          value={filters.district}
          onChange={(v) => onFilterChange("district", v)}
          options={districts}
          placeholder="All districts…"
          emptyLabel="All districts"
        />

        <label style={{ marginTop: 10, display: "block" }}>
          Habitat (IUCN)
        </label>
        <Combobox
          value={filters.habitat_iucn}
          onChange={(v) => onFilterChange("habitat_iucn", v)}
          options={habitats}
          placeholder="All IUCN categories…"
          emptyLabel="All categories"
        />

        {hasBbox && (
          <button
            className="btn-danger"
            onClick={onClearBbox}
            style={{ marginTop: 8, width: "100%", fontSize: "0.7rem" }}
          >
            ✕ Clear map area filter
          </button>
        )}
      </FilterSection>

      <FilterSection title="Altitude (m)">
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          <div>
            <label>Min</label>
            <input
              type="text"
              placeholder="0"
              value={filters.alt_min}
              onChange={(e) => onFilterChange("alt_min", e.target.value)}
            />
          </div>
          <div>
            <label>Max</label>
            <input
              type="text"
              placeholder="∞"
              value={filters.alt_max}
              onChange={(e) => onFilterChange("alt_max", e.target.value)}
            />
          </div>
        </div>
      </FilterSection>

      <button
        className="btn-ghost"
        onClick={onClearFilters}
        style={{ width: "100%", marginTop: 4 }}
      >
        ✕ Clear all filters
      </button>

      {/* Citation notice — update the citation string below when available */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 16,
          borderTop: "1px solid var(--border)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            color: "var(--sepia)",
            letterSpacing: "0.04em",
            lineHeight: 1.6,
            opacity: 0.8,
          }}
        >
          <span
            style={{
              display: "block",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 4,
              color: "var(--gold-text)",
            }}
          >
            Citation
          </span>
          If you use this resource, please cite:
          <br />
          <span style={{ fontStyle: "italic" }}>
            [Citation to be provided]{" "}
            <a
              href="[URL to be provided]"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--gold-text)",
                textDecoration: "underline",
                fontStyle: "normal",
              }}
            >
              [Link text]
            </a>
          </span>
        </p>
      </div>
    </>
  );
}
