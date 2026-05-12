import { useState } from "react";
import { useSpecimens } from "./hooks/useSpecimens";
import { Layout } from "./components/Layout";
import { Header } from "./components/Header";
import { FilterSidebar } from "./components/FilterSidebar";
import { MapView } from "./components/MapView";
import { TableView } from "./components/TableView";
import { GalleryView } from "./components/GalleryView";
import { DetailPanel } from "./components/DetailPanel";
import { ExportMenu } from "./components/ExportMenu";
import type { Specimen } from "./types/specimen";
// import { DebugView } from "./components/DebugView";

type Tab = "map" | "table" | "gallery" | "detail";

const TABS: { id: Tab; label: string; icon?: string }[] = [
  { id: "map", label: "🗺  Map View" },
  { id: "table", label: "⊞  Table View" },
  { id: "gallery", label: "⬡  Gallery" },
  {
    id: "detail",
    label: "Specimen Detail",
    icon: "https://static.vecteezy.com/system/resources/previews/034/371/289/non_2x/sprout-growing-from-the-soil-icon-germination-icon-vector.jpg",
  },
  // { id: "debug", label: "⚠  Debug" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("map");

  const {
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
    setSelected,
    districts,
    habitats,
    imageAvailability,
    imagesLoading,
  } = useSpecimens();

  function handleSelectSpecimen(specimen: Specimen | null) {
    setSelected(specimen);
    if (activeTab === "table") setActiveTab("detail");
  }

  function handleOpenDetail(specimen: Specimen) {
    setSelected(specimen);
    setActiveTab("detail");
  }

  function handleBboxChange(bbox: [number, number, number, number] | null) {
    setBbox(bbox);
    if (bbox !== null) setActiveTab("table");
  }

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ink)",
          color: "var(--gold)",
          gap: 16,
          fontFamily: "var(--font-mono)",
          fontSize: "0.8rem",
          letterSpacing: "0.1em",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: "2px solid var(--border)",
            borderTopColor: "var(--gold)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        LOADING COLLECTION…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (error) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ink)",
          color: "var(--sepia)",
          gap: 12,
          fontFamily: "var(--font-mono)",
          fontSize: "0.8rem",
          letterSpacing: "0.05em",
          padding: 40,
          textAlign: "center",
        }}
      >
        <div style={{ color: "#c04040", fontSize: "1.5rem" }}>⚠</div>
        <div style={{ color: "var(--gold)" }}>Could not connect to API</div>
        <div style={{ opacity: 0.7, maxWidth: 400 }}>{error}</div>
        <div style={{ opacity: 0.5, fontSize: "0.7rem", marginTop: 8 }}>
          Make sure the backend is running at{" "}
          {import.meta.env.VITE_API_URL ?? "http://localhost:8000"}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 16,
            padding: "8px 20px",
            background: "none",
            border: "1px solid var(--border)",
            color: "var(--sepia)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            cursor: "pointer",
            letterSpacing: "0.08em",
          }}
        >
          RETRY
        </button>
      </div>
    );
  }

  // ── Main app ──────────────────────────────────────────────────
  return (
    <Layout
      header={
        <Header
          totalCount={totalCount}
          filteredCount={filteredSpecimens.length}
        />
      }
      sidebar={
        <FilterSidebar
          filters={filters}
          onFilterChange={setFilter}
          onClearFilters={clearFilters}
          onClearBbox={() => setBbox(null)}
          districts={districts}
          habitats={habitats}
          hasBbox={filters.bbox !== null}
        />
      }
    >
      {/* Tab bar — now includes export menu on the right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--ink)",
          borderBottom: "2px solid var(--gold)",
          padding: "0 20px",
          gap: 2,
        }}
      >
        {/* Tabs */}
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: "none",
              border: "none",
              borderBottom:
                activeTab === tab.id
                  ? "2px solid var(--gold)"
                  : "2px solid transparent",
              color:
                activeTab === tab.id ? "var(--gold-light)" : "var(--border)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "11px 18px",
              marginBottom: "-2px",
              cursor: "pointer",
              transition: "color 0.15s",
            }}
          >
            {tab.icon ? (
              <img
                src={tab.icon}
                alt=""
                style={{
                  width: 14,
                  height: 14,
                  verticalAlign: "middle",
                  marginRight: 6,
                  display: "inline-block",
                }}
              />
            ) : null}
            {tab.label}
            {(tab.id === "table" || tab.id === "gallery") &&
              filteredSpecimens.length < allSpecimens.length && (
                <span
                  style={{
                    marginLeft: 6,
                    background: "var(--gold)",
                    color: "var(--ink)",
                    borderRadius: 10,
                    fontSize: "0.6rem",
                    padding: "1px 5px",
                    fontWeight: "bold",
                    verticalAlign: "middle",
                  }}
                >
                  {filteredSpecimens.length}
                </span>
              )}
          </button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Export menu — lives in the tab bar, right-aligned */}
        <div style={{ padding: "0 4px" }}>
          <ExportMenu
            filteredSpecimens={filteredSpecimens}
            selected={selected}
            allSpecimens={allSpecimens}
          />
        </div>
      </div>

      {/* Map */}
      <div
        style={{
          display: activeTab === "map" ? "flex" : "none",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <MapView
          specimens={filteredSpecimens}
          selected={selected}
          onSelectSpecimen={handleSelectSpecimen}
          onOpenDetail={handleOpenDetail}
          onBboxChange={handleBboxChange}
          onClearSelection={() => setSelected(null)}
          bbox={filters.bbox}
        />
      </div>

      {/* Table */}
      <div
        style={{
          display: activeTab === "table" ? "flex" : "none",
          flex: 1,
          overflow: "hidden",
          flexDirection: "column",
        }}
      >
        <TableView
          specimens={filteredSpecimens}
          selected={selected}
          onSelectSpecimen={handleSelectSpecimen}
        />
      </div>

      {/* Gallery */}
      <div
        style={{
          display: activeTab === "gallery" ? "flex" : "none",
          flex: 1,
          overflow: "hidden",
          flexDirection: "column",
        }}
      >
        <GalleryView
          specimens={filteredSpecimens}
          selected={selected}
          onSelectSpecimen={handleSelectSpecimen}
          onOpenDetail={handleOpenDetail}
          imageAvailability={imageAvailability}
          imagesLoading={imagesLoading}
        />
      </div>

      {/* Detail */}
      <div
        style={{
          display: activeTab === "detail" ? "flex" : "none",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <DetailPanel
          specimen={selected}
          specimens={filteredSpecimens}
          onNavigate={setSelected}
        />
      </div>

      {/* <div
        style={{
          display: activeTab === "debug" ? "flex" : "none",
          flex: 1,
          overflow: "hidden",
          flexDirection: "column",
        }}
      >
        <DebugView
          specimens={allSpecimens}
          imageAvailability={imageAvailability}
          imagesLoading={imagesLoading}
        /> */}
      {/* </div> */}
    </Layout>
  );
}
