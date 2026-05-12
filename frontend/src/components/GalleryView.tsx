import { useState, useMemo } from "react";
import type { Specimen } from "../types/specimen";

const API =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "";

interface GalleryViewProps {
  specimens: Specimen[];
  selected: Specimen | null;
  onSelectSpecimen: (s: Specimen) => void;
  onOpenDetail: (s: Specimen) => void;
  // Resolved from useSpecimens — the only reliable source of truth for
  // whether a specimen actually has images (image_path on the list
  // response is stale and cannot be trusted).
  imageAvailability: Set<string>;
  imagesLoading: boolean;
}

type SortKey = "date" | "name" | "district" | "plant_id";
type GroupKey = "none" | "district" | "habitat" | "year";

// ── Utility ───────────────────────────────────────────────────────
function getYear(date: string | null | undefined): string {
  if (!date) return "Unknown";
  return date.slice(0, 4);
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

// ── Specimen thumbnail ────────────────────────────────────────────
// Image URL is constructed directly — no fetch needed.
// imageAvailability (from /meta/image-ids) is the source of truth;
// /images/{plant_id}/first serves the image bytes directly.
function SpecimenThumb({
  specimen,
  hue,
  hovered,
  hasImage,
}: {
  specimen: Specimen;
  hue: number;
  hovered: boolean;
  hasImage: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  if (hasImage && !imgError) {
    const src = `${API}/images/thumbs/${specimen.plant_id}.jpg`;
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "4 / 3",
          overflow: "hidden",
          position: "relative",
          background: `hsl(${hue}, 12%, 82%)`,
          flexShrink: 0,
        }}
      >
        <img
          src={src}
          alt={specimen.name ?? specimen.plant_id}
          onError={() => setImgError(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
            transition: "transform 0.3s ease, filter 0.3s ease",
            transform: hovered ? "scale(1.04)" : "scale(1)",
            filter: hovered ? "brightness(1.05)" : "brightness(0.95)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.4) 100%)",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  }

  // Placeholder — no image
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "4 / 3",
        flexShrink: 0,
        background: `hsl(${hue}, 18%, 88%)`,
        borderBottom: `1px solid hsl(${hue}, 20%, 76%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: `hsl(${hue}, 20%, 80%)`,
          border: `1px solid hsl(${hue}, 25%, 62%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "0.75rem",
          color: `hsl(${hue}, 35%, 28%)`,
          letterSpacing: "0.05em",
          fontWeight: "bold",
        }}
      >
        {initials(specimen.name)}
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.5rem",
          color: `hsl(${hue}, 22%, 42%)`,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        no image
      </span>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────
function SpecimenCard({
  specimen,
  isSelected,
  hasImage,
  onSelect,
  onOpen,
}: {
  specimen: Specimen;
  isSelected: boolean;
  hasImage: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hue = hueFromString(specimen.plant_id);
  const isApprox = specimen.coord_source === "grid_reference";

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: isSelected ? "#f0ead6" : hovered ? "#faf6ec" : "var(--parchment)",
        border: isSelected
          ? "1px solid var(--gold)"
          : hovered
            ? "1px solid var(--border)"
            : "1px solid var(--parchment-dark)",
        borderRadius: 2,
        cursor: "pointer",
        overflow: "hidden",
        transition:
          "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
        transform: hovered && !isSelected ? "translateY(-2px)" : "none",
        boxShadow: isSelected
          ? "0 0 0 1px var(--gold), 0 4px 20px rgba(0,0,0,0.25)"
          : hovered
            ? "0 4px 16px rgba(0,0,0,0.2)"
            : "0 1px 4px rgba(0,0,0,0.12)",
      }}
    >
      {/* Top accent stripe */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `hsl(${hue}, 35%, 45%)`,
          opacity: isSelected ? 1 : 0.45,
          transition: "opacity 0.18s",
          zIndex: 2,
        }}
      />

      {/* Image / fallback thumbnail */}
      <SpecimenThumb
        specimen={specimen}
        hue={hue}
        hovered={hovered}
        hasImage={hasImage}
      />

      {/* Card body */}
      <div
        style={{
          padding: "12px 14px 10px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* plant_id */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.58rem",
            color: "var(--sepia)",
            letterSpacing: "0.1em",
            marginBottom: 3,
          }}
        >
          {specimen.plant_id}
        </div>

        {/* Species name */}
        <div
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "0.95rem",
            color: isSelected ? "var(--moss)" : "var(--ink-light)",
            lineHeight: 1.25,
            marginBottom: 10,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {specimen.name || (
            <span style={{ opacity: 0.35 }}>Unknown species</span>
          )}
        </div>

        {/* Metadata grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "5px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            letterSpacing: "0.03em",
          }}
        >
          <MetaCell
            icon="📍"
            label={
              [specimen.district, specimen.country]
                .filter(Boolean)
                .join(", ") || "—"
            }
            muted={!specimen.district && !specimen.country}
          />
          <MetaCell
            icon="📅"
            label={specimen.date ?? "—"}
            muted={!specimen.date}
          />
          <MetaCell
            icon="⛰"
            label={
              specimen.altitude_m != null ? `${specimen.altitude_m} m` : "—"
            }
            muted={specimen.altitude_m == null}
          />
          <MetaCell
            icon="🌿"
            label={specimen.habitat ?? "—"}
            muted={!specimen.habitat}
            truncate
          />
        </div>

        {/* Collector */}
        {specimen.collector_name && (
          <div
            style={{
              marginTop: 8,
              paddingTop: 7,
              borderTop: "1px solid var(--parchment-dark)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.58rem",
              color: "var(--sepia)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            ✦ {specimen.collector_name}
          </div>
        )}

        {/* Chips — use hasImage (verified) instead of specimen.image_path */}
        <div
          style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}
        >
          {isApprox && (
            <Chip
              label="~ grid ref"
              color="rgba(122,82,10,0.12)"
              textColor="var(--gold-text)"
            />
          )}
          {specimen.latitude != null && !isApprox && (
            <Chip
              label="georef"
              color="rgba(74,94,53,0.12)"
              textColor="var(--moss)"
            />
          )}
          {specimen.altitude_m != null && specimen.altitude_m > 1500 && (
            <Chip
              label="highland"
              color="rgba(50,70,120,0.1)"
              textColor="#3a5090"
            />
          )}
          {!hasImage && (
            <Chip
              label="no photo"
              color="rgba(94,61,20,0.1)"
              textColor="var(--sepia)"
            />
          )}
        </div>
      </div>

      {/* Selected dot */}
      {isSelected && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--gold)",
            boxShadow: "0 0 6px var(--gold)",
            zIndex: 3,
          }}
        />
      )}
    </div>
  );
}

function MetaCell({
  icon,
  label,
  muted,
  truncate,
}: {
  icon: string;
  label: string;
  muted?: boolean;
  truncate?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        color: muted ? "var(--border)" : "var(--sepia)",
        overflow: truncate ? "hidden" : undefined,
      }}
    >
      <span style={{ opacity: 0.55, fontSize: "0.62rem", flexShrink: 0 }}>
        {icon}
      </span>
      <span
        style={{
          overflow: truncate ? "hidden" : undefined,
          textOverflow: truncate ? "ellipsis" : undefined,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Chip({
  label,
  color,
  textColor,
}: {
  label: string;
  color: string;
  textColor: string;
}) {
  return (
    <span
      style={{
        background: color,
        color: textColor,
        fontFamily: "var(--font-mono)",
        fontSize: "0.52rem",
        letterSpacing: "0.07em",
        padding: "2px 6px",
        borderRadius: 2,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

// ── Group header ──────────────────────────────────────────────────
function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "24px 0 8px",
        marginTop: 8,
      }}
    >
      <span
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "1.1rem",
          color: "var(--gold)",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      <div
        style={{ flex: 1, height: 1, background: "rgba(196,149,42,0.35)" }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.6rem",
          color: "var(--sepia)",
          opacity: 0.5,
          letterSpacing: "0.1em",
        }}
      >
        {count}
      </span>
    </div>
  );
}

// ── Main GalleryView ──────────────────────────────────────────────
export function GalleryView({
  specimens,
  selected,
  onSelectSpecimen,
  onOpenDetail,
  imageAvailability,
  imagesLoading,
}: GalleryViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDesc, setSortDesc] = useState(true);
  const [groupKey, setGroupKey] = useState<GroupKey>("none");
  const [search, setSearch] = useState("");
  const [onlyWithImages, setOnlyWithImages] = useState(false);

  // Count and filter against the verified set, not s.image_path
  const withImageCount = imageAvailability.size;

  const searched = useMemo(() => {
    let result = specimens;
    if (onlyWithImages)
      result = result.filter((s) => imageAvailability.has(s.plant_id));
    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.plant_id?.toLowerCase().includes(q) ||
        s.collector_name?.toLowerCase().includes(q) ||
        s.district?.toLowerCase().includes(q) ||
        s.habitat?.toLowerCase().includes(q),
    );
  }, [specimens, search, onlyWithImages, imageAvailability]);

  const sorted = useMemo(() => {
    return [...searched].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "date") {
        av = a.date ?? "";
        bv = b.date ?? "";
      }
      if (sortKey === "name") {
        av = a.name ?? "";
        bv = b.name ?? "";
      }
      if (sortKey === "district") {
        av = a.district ?? "";
        bv = b.district ?? "";
      }
      if (sortKey === "plant_id") {
        av = a.plant_id ?? "";
        bv = b.plant_id ?? "";
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDesc ? -cmp : cmp;
    });
  }, [searched, sortKey, sortDesc]);

  const groups = useMemo(() => {
    if (groupKey === "none") return [{ label: null, items: sorted }];
    const map = new Map<string, Specimen[]>();
    for (const s of sorted) {
      let key = "Unknown";
      if (groupKey === "district") key = s.district ?? "Unknown";
      if (groupKey === "habitat") key = s.habitat ?? "Unknown";
      if (groupKey === "year") key = getYear(s.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label, items }));
  }, [sorted, groupKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--ink)",
      }}
    >
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          background: "var(--parchment-dark)",
          borderBottom: "1px solid var(--border)",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px", maxWidth: 260 }}>
          <span
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.35,
              fontSize: "0.7rem",
              pointerEvents: "none",
            }}
          >
            ⌕
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cards…"
            style={{
              width: "100%",
              background: "var(--parchment)",
              border: "1px solid var(--border)",
              borderRadius: 2,
              padding: "5px 8px 5px 24px",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--ink)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Photos-only toggle — shows "…" while image availability resolves */}
        {false && (
          <button
            onClick={() => setOnlyWithImages((v) => !v)}
            style={{
              background: onlyWithImages ? "rgba(196,149,42,0.12)" : "none",
              border: onlyWithImages
                ? "1px solid rgba(196,149,42,0.4)"
                : "1px solid rgba(255,255,255,0.1)",
              color: onlyWithImages ? "var(--gold)" : "var(--sepia)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.62rem",
              letterSpacing: "0.06em",
              padding: "3px 9px",
              borderRadius: 2,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.12s",
              flexShrink: 0,
            }}
          >
            ◩ Photos only ({imagesLoading ? "…" : withImageCount})
          </button>
        )}

        <Divider />

        {/* Sort */}
        <span style={labelStyle}>Sort</span>
        {(["date", "name", "district", "plant_id"] as SortKey[]).map((k) => (
          <ToolbarButton
            key={k}
            active={sortKey === k}
            onClick={() => toggleSort(k)}
            label={
              k === "plant_id" ? "ID" : k.charAt(0).toUpperCase() + k.slice(1)
            }
            suffix={sortKey === k ? (sortDesc ? " ↓" : " ↑") : ""}
          />
        ))}

        <Divider />

        {/* Group */}
        <span style={labelStyle}>Group</span>
        {(["none", "district", "habitat", "year"] as GroupKey[]).map((k) => (
          <ToolbarButton
            key={k}
            active={groupKey === k}
            onClick={() => setGroupKey(k)}
            label={k.charAt(0).toUpperCase() + k.slice(1)}
          />
        ))}

        <Divider />

        {/* Count */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.63rem",
            color: "var(--sepia)",
            opacity: 0.55,
            marginLeft: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {searched.length} / {specimens.length}
        </span>
      </div>

      {/* ── Grid ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 32px" }}>
        {searched.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
              opacity: 0.35,
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "var(--sepia)",
              letterSpacing: "0.1em",
            }}
          >
            <div style={{ fontSize: "2rem" }}>🌿</div>
            NO SPECIMENS FOUND
          </div>
        ) : (
          groups.map(({ label, items }) => (
            <div key={label ?? "__all"}>
              {label && <GroupHeader label={label} count={items.length} />}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 10,
                  paddingTop: label ? 0 : 12,
                }}
              >
                {items.map((s) => (
                  <SpecimenCard
                    key={s.plant_id}
                    specimen={s}
                    isSelected={selected?.plant_id === s.plant_id}
                    hasImage={imageAvailability.has(s.plant_id)}
                    onSelect={() => onSelectSpecimen(s)}
                    onOpen={() => onOpenDetail(s)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Small shared sub-components ───────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.6rem",
  color: "var(--sepia)",
  opacity: 0.5,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 16,
        background: "var(--border)",
        opacity: 0.5,
        flexShrink: 0,
      }}
    />
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  suffix = "",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  suffix?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(196,149,42,0.12)" : "none",
        border: active
          ? "1px solid rgba(196,149,42,0.4)"
          : "1px solid transparent",
        color: active ? "var(--gold)" : "var(--sepia)",
        fontFamily: "var(--font-mono)",
        fontSize: "0.65rem",
        letterSpacing: "0.06em",
        padding: "3px 8px",
        borderRadius: 2,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.12s",
      }}
    >
      {label}
      {suffix}
    </button>
  );
}
