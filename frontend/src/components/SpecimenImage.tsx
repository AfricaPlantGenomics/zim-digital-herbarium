// Drop-in replacement for the image section of DetailPanel.tsx
// Replace the existing resolveImageUrl function and SpecimenImage component
// with this file's exports.

import { useState, useEffect, useCallback } from "react";
import type { Specimen } from "../types/specimen";

const API = import.meta.env.VITE_API_URL ?? "";

interface ImageMeta {
  rotation: string;
  filename: string;
  url: string;
}

// ── Fullscreen lightbox ───────────────────────────────────────────
function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(10, 8, 4, 0.94)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-out",
      }}
    >
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "92vw",
          maxHeight: "92vh",
          objectFit: "contain",
          boxShadow: "0 8px 48px rgba(0,0,0,0.8)",
          cursor: "default",
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          background: "none",
          border: "1px solid rgba(196,149,42,0.4)",
          color: "var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          letterSpacing: "0.1em",
          padding: "5px 12px",
          cursor: "pointer",
          textTransform: "uppercase",
        }}
      >
        ✕ Close
      </button>
    </div>
  );
}

// ── Image gallery — fetches available images from API ─────────────
export function SpecimenImage({ specimen }: { specimen: Specimen }) {
  const [images, setImages] = useState<ImageMeta[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [fetchError, setFetchError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  // Fetch image metadata when specimen changes
  useEffect(() => {
    setImages([]);
    setFetchError(false);
    setLoadStatus("loading");

    fetch(`${API}/images/${specimen.plant_id}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data: ImageMeta[]) => setImages(data))
      .catch(() => setFetchError(true));
  }, [specimen.plant_id]);

  // Placeholder when no images available
  if (fetchError || (images.length === 0 && !loadStatus)) {
    return <ImagePlaceholder specimen={specimen} reason="No image on record" />;
  }

  const active = images[0];
  if (!active)
    return <ImagePlaceholder specimen={specimen} reason="Loading…" />;

  const imageUrl = `${API}${active.url}?max_width=1200`;
  const fullUrl  = `${API}${active.url}`;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Image */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {loadStatus === "loading" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, #111 25%, #1a1209 50%, #111 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
            }}
          />
        )}

        <img
          key={imageUrl}
          src={imageUrl}
          alt={`${specimen.name ?? "Specimen"} (${active.rotation})`}
          onLoad={() => setLoadStatus("loaded")}
          onError={() => setLoadStatus("error")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: loadStatus === "error" ? "none" : "block",
          }}
        />

        {loadStatus === "error" && (
          <ImagePlaceholder specimen={specimen} reason="Image failed to load" />
        )}

        {/* Zoom button */}
        {loadStatus === "loaded" && (
          <button
            onClick={() => setLightboxOpen(true)}
            title="View full size"
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(26,18,9,0.75)",
              border: "1px solid rgba(196,149,42,0.4)",
              color: "var(--border)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              padding: "4px 8px",
              cursor: "pointer",
              letterSpacing: "0.04em",
              lineHeight: 1,
            }}
          >
            ⤢
          </button>
        )}

      </div>

      {lightboxOpen && (
        <Lightbox
          src={fullUrl}
          alt={specimen.name ?? specimen.plant_id}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}

// ── Placeholder ───────────────────────────────────────────────────
function ImagePlaceholder({
  specimen,
  reason,
}: {
  specimen: Specimen;
  reason: string;
}) {
  const initials = (specimen.name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "#111",
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          border: "1px solid var(--gold)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.4,
        }}
      >
        <svg
          viewBox="0 0 80 80"
          width="80"
          height="80"
          fill="none"
          stroke="var(--gold)"
          strokeWidth="0.8"
        >
          <circle cx="40" cy="40" r="30" strokeDasharray="4 3" />
          <line x1="40" y1="10" x2="40" y2="70" />
          <line x1="10" y1="40" x2="70" y2="40" />
          <ellipse
            cx="40"
            cy="28"
            rx="8"
            ry="12"
            transform="rotate(-20 40 28)"
          />
          <ellipse
            cx="52"
            cy="40"
            rx="8"
            ry="12"
            transform="rotate(70 52 40)"
          />
          <ellipse
            cx="28"
            cy="40"
            rx="8"
            ry="12"
            transform="rotate(110 28 40)"
          />
        </svg>
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "2rem",
          fontStyle: "italic",
          color: "var(--gold)",
          opacity: 0.3,
          letterSpacing: "0.1em",
        }}
      >
        {initials}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: "var(--border)",
          opacity: 0.5,
          letterSpacing: "0.1em",
        }}
      >
        {reason}
      </div>
    </div>
  );
}
