import { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import type { Specimen } from "../types/specimen";
import { ExportGateModal, appendLocalLog } from "./ExportGateModal";
import type { PendingExport, GateFormData } from "./ExportGateModal";

// ── Types ─────────────────────────────────────────────────────────

interface ExportMenuProps {
  filteredSpecimens: Specimen[];
  selected: Specimen | null;
  allSpecimens: Specimen[];
}

type ExportScope = "filtered" | "selected" | "all";

interface ProgressState {
  active: boolean;
  label: string;
  current: number;
  total: number;
}

// ── Constants ─────────────────────────────────────────────────────

const API =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "";

const CSV_COLUMNS: { key: keyof Specimen; label: string }[] = [
  { key: "plant_id", label: "Plant ID" },
  { key: "name", label: "Species" },
  { key: "collector_name", label: "Collector" },
  { key: "collector_number", label: "Collector No." },
  { key: "date", label: "Date" },
  { key: "date_raw", label: "Date (raw)" },
  { key: "district", label: "District (historical)" },
  { key: "modern_district", label: "District (modern)" },
  { key: "country", label: "Country" },
  { key: "altitude_m", label: "Altitude (m)" },
  { key: "altitude_raw", label: "Altitude (raw)" },
  { key: "habitat", label: "Habitat (notes)" },
  { key: "habitat_overall_description", label: "Habitat (type)" },
  { key: "habitat_iucn_category_description", label: "Habitat (IUCN categories)" },
  { key: "geographic_info", label: "Geographic Info" },
  { key: "grid_reference", label: "Grid Reference" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
  { key: "coord_source", label: "Coord Source" },
  { key: "flowering_state", label: "Flowering State" },
  { key: "phenotype", label: "Phenotype" },
  { key: "description", label: "Field Notes" },
];

// ── CSV helpers ───────────────────────────────────────────────────

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = Array.isArray(value) ? value.join(" | ") : String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(specimens: Specimen[]): string {
  const header = CSV_COLUMNS.map((c) => c.label).join(",");
  const rows = specimens.map((s) =>
    CSV_COLUMNS.map((c) => escapeCell(s[c.key])).join(","),
  );
  return [header, ...rows].join("\r\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Image fetching ────────────────────────────────────────────────

interface ImageFile {
  filename: string;
  data: ArrayBuffer;
}

async function fetchImagesForSpecimen(plantId: string): Promise<ImageFile[]> {
  const listRes = await fetch(`${API}/images/${plantId}`);
  if (!listRes.ok) return [];

  const meta: { rotation: string; filename: string; url: string }[] =
    await listRes.json();
  if (!meta.length) return [];

  const results = await Promise.allSettled(
    meta.map(async (img) => {
      const r = await fetch(`${API}${img.url}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { filename: img.filename, data: await r.arrayBuffer() };
    }),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<ImageFile> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}

// ── Progress bar ──────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: ProgressState }) {
  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 320,
        background: "var(--ink)",
        border: "1px solid var(--gold)",
        padding: "14px 16px",
        zIndex: 9999,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: "0.72rem",
            color: "var(--gold-light)",
            letterSpacing: "0.06em",
          }}
        >
          {progress.label}
        </span>
        <span style={{ fontSize: "0.65rem", color: "var(--sepia)" }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: 3,
          background: "rgba(196,149,42,0.15)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--gold)",
            transition: "width 0.25s ease",
          }}
        />
      </div>
      {progress.total > 0 && (
        <div
          style={{
            fontSize: "0.6rem",
            color: "var(--sepia)",
            marginTop: 6,
            opacity: 0.6,
          }}
        >
          {progress.current} / {progress.total} specimens processed
        </div>
      )}
    </div>
  );
}

// ── Dropdown item ─────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  sublabel,
  count,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  count?: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        background: hovered && !disabled ? "var(--parchment-dark)" : "none",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        textAlign: "left",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontSize: "0.85rem", flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            color: "var(--ink)",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        {sublabel && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              color: "var(--sepia)",
              opacity: 0.7,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sublabel}
          </div>
        )}
      </div>
      {count !== undefined && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.58rem",
            color: "var(--gold-text)",
            background: "rgba(196,149,42,0.12)",
            border: "1px solid var(--border)",
            borderRadius: 2,
            padding: "1px 6px",
            flexShrink: 0,
          }}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "7px 14px 5px",
        fontFamily: "var(--font-mono)",
        fontSize: "0.58rem",
        letterSpacing: "0.15em",
        textTransform: "uppercase" as const,
        color: "var(--gold-text)",
        opacity: 1,
        borderBottom: "1px solid var(--parchment-dark)",
        marginTop: 2,
      }}
    >
      {label}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function ExportMenu({
  filteredSpecimens,
  selected,
  allSpecimens,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({
    active: false,
    label: "",
    current: 0,
    total: 0,
  });
  const [pendingExport, setPendingExport] = useState<PendingExport | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function resolveSpecimens(scope: ExportScope): Specimen[] {
    if (scope === "all") return allSpecimens;
    if (scope === "selected") return selected ? [selected] : [];
    return filteredSpecimens;
  }

  function scopeLabel(scope: ExportScope): string {
    if (scope === "all") return "herbarium-all";
    if (scope === "selected")
      return `herbarium-${selected?.plant_id ?? "specimen"}`;
    return "herbarium-filtered";
  }

  // ── CSV (internal — invoked after gate) ──────────────────────────
  const performCsvExport = useCallback(
    (scope: ExportScope) => {
      const specimens = resolveSpecimens(scope);
      if (!specimens.length) return;
      const BOM = "﻿";
      const blob = new Blob([BOM + buildCsv(specimens)], {
        type: "text/csv;charset=utf-8;",
      });
      triggerDownload(blob, `${scopeLabel(scope)}_${todayStr()}.csv`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSpecimens, filteredSpecimens, selected],
  );

  // ── ZIP (internal — invoked after gate) ──────────────────────────
  const performZipExport = useCallback(
    async (scope: ExportScope) => {
      const specimens = resolveSpecimens(scope);
      if (!specimens.length) return;

      const withImages = specimens.filter((s) => s.image_path);
      const total = withImages.length;

      setProgress({
        active: true,
        label: "Building archive…",
        current: 0,
        total,
      });

      try {
        const zip = new JSZip();

        const BOM = "﻿";
        zip.file("specimens.csv", BOM + buildCsv(specimens));

        const imagesFolder = zip.folder("images")!;

        for (let i = 0; i < withImages.length; i++) {
          const s = withImages[i];
          setProgress({
            active: true,
            label: "Fetching images…",
            current: i,
            total,
          });

          const images = await fetchImagesForSpecimen(s.plant_id);
          for (const img of images) {
            imagesFolder.file(`${s.plant_id}_${img.filename}`, img.data);
          }
        }

        setProgress({
          active: true,
          label: "Compressing…",
          current: total,
          total,
        });

        const blob: Blob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });

        triggerDownload(blob, `${scopeLabel(scope)}_${todayStr()}.zip`);
      } catch (err) {
        console.error("ZIP export failed:", err);
      } finally {
        setProgress({ active: false, label: "", current: 0, total: 0 });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSpecimens, filteredSpecimens, selected],
  );

  // ── Gate: open modal ─────────────────────────────────────────────
  function requestExport(
    type: "csv" | "zip",
    scope: ExportScope,
    scopeDescription: string,
  ) {
    setOpen(false);
    const specimenCount = resolveSpecimens(scope).length;
    if (!specimenCount) return;
    setPendingExport({ type, scope, specimenCount, scopeDescription });
  }

  // ── Gate: confirmed — log then execute ───────────────────────────
  async function handleGateConfirm(formData: GateFormData) {
    if (!pendingExport) return;
    const captured = pendingExport;
    setPendingExport(null);

    appendLocalLog(formData, captured);
    console.log("[herbarium] download event", { formData, export: captured });

    try {
      await fetch(`${API}/log/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formData.fullName,
          email: formData.email,
          use_case: formData.useCase,
          export_type: captured.type,
          scope: captured.scope,
          specimen_count: captured.specimenCount,
        }),
      });
    } catch {
      // non-critical — proceed regardless
    }

    if (captured.type === "csv") {
      performCsvExport(captured.scope);
    } else {
      performZipExport(captured.scope);
    }
  }

  const filteredCount = filteredSpecimens.length;
  const totalCount = allSpecimens.length;
  const isFiltered = filteredCount < totalCount;
  const hasSelected = selected !== null;

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: open ? "rgba(196,149,42,0.1)" : "none",
          border: open
            ? "1px solid rgba(196,149,42,0.5)"
            : "1px solid var(--border)",
          color: open ? "var(--gold-light)" : "var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          letterSpacing: "0.08em",
          padding: "5px 12px",
          cursor: "pointer",
          transition: "all 0.12s",
          textTransform: "uppercase" as const,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "0.8rem" }}>⬇</span>
        Export
        <span
          style={{
            fontSize: "0.55rem",
            opacity: 0.6,
            display: "inline-block",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          ▾
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            width: 310,
            background: "var(--parchment)",
            border: "1px solid var(--border)",
            borderTop: "2px solid var(--gold)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            zIndex: 200,
          }}
        >
          <SectionHeader label="CSV — Spreadsheet Data" />

          {isFiltered && (
            <MenuItem
              icon="📋"
              label="Export filtered results"
              sublabel="Current filters applied"
              count={filteredCount}
              onClick={() =>
                requestExport("csv", "filtered", "Filtered results")
              }
            />
          )}
          {hasSelected && (
            <MenuItem
              icon="📌"
              label="Export selected specimen"
              sublabel={selected!.name || selected!.plant_id}
              count={1}
              onClick={() =>
                requestExport("csv", "selected", "Selected specimen")
              }
            />
          )}
          <MenuItem
            icon="📄"
            label="Export all specimens"
            sublabel="Complete collection"
            count={totalCount}
            onClick={() => requestExport("csv", "all", "All specimens")}
          />

          <SectionHeader label="ZIP — Data + Images" />

          {isFiltered && (
            <MenuItem
              icon="🗃"
              label="Filtered results + images"
              sublabel="CSV and specimen photographs"
              count={filteredCount}
              onClick={() =>
                requestExport("zip", "filtered", "Filtered results")
              }
            />
          )}
          {hasSelected && (
            <MenuItem
              icon="🖼"
              label="Selected specimen + images"
              sublabel={selected!.name || selected!.plant_id}
              count={1}
              onClick={() =>
                requestExport("zip", "selected", "Selected specimen")
              }
            />
          )}
          <MenuItem
            icon="📦"
            label="All specimens + images"
            sublabel="Full archive — may take a moment"
            count={totalCount}
            onClick={() => requestExport("zip", "all", "All specimens")}
          />

          <div
            style={{
              padding: "8px 14px",
              borderTop: "1px solid var(--parchment-dark)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.58rem",
              color: "var(--sepia)",
              opacity: 0.8,
              letterSpacing: "0.04em",
            }}
          >
            ZIP includes CSV + all available specimen photographs
          </div>

          {/* Citation — update text and URL when available */}
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--parchment-dark)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.58rem",
              color: "var(--sepia)",
              lineHeight: 1.6,
              letterSpacing: "0.03em",
            }}
          >
            <span
              style={{
                display: "block",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontSize: "0.55rem",
                color: "var(--gold-text)",
                marginBottom: 4,
              }}
            >
              Citation
            </span>
            If you use this data, please cite:
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
          </div>
        </div>
      )}

      {/* Gate modal */}
      {pendingExport && (
        <ExportGateModal
          pending={pendingExport}
          onConfirm={handleGateConfirm}
onCancel={() => setPendingExport(null)}
        />
      )}

      {progress.active && <ProgressBar progress={progress} />}
    </div>
  );
}
