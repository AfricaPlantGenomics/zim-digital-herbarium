import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Specimen } from "../types/specimen";

interface MapViewProps {
  specimens: Specimen[];
  selected: Specimen | null;
  onSelectSpecimen: (s: Specimen) => void;
  onOpenDetail: (s: Specimen) => void;
  onBboxChange: (bbox: [number, number, number, number] | null) => void;
  onClearSelection: () => void;
  bbox: [number, number, number, number] | null;
}

// ── Spiderfy helpers ──────────────────────────────────────────────
const SPIDER_RADIUS_PX = 40;

function spiderfyOffsets(count: number): [number, number][] {
  if (count === 1) return [[0, 0]];
  const offsets: [number, number][] = [];
  const angleStep = (2 * Math.PI) / count;
  for (let i = 0; i < count; i++) {
    const angle = i * angleStep - Math.PI / 2;
    offsets.push([
      Math.cos(angle) * SPIDER_RADIUS_PX,
      Math.sin(angle) * SPIDER_RADIUS_PX,
    ]);
  }
  return offsets;
}

// ── Deterministic jitter ─────────────────────────────────────────
const JITTER_MAX_DEG = 0.045;

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

function deterministicJitter(specimen: Specimen): { lat: number; lng: number } {
  if (
    specimen.coord_source !== "grid_reference" ||
    specimen.latitude === null ||
    specimen.longitude === null
  ) {
    return { lat: specimen.latitude!, lng: specimen.longitude! };
  }
  const h = hashStr(specimen.plant_id);
  const latOffset = (((h & 0xffff) / 0xffff) * 2 - 1) * JITTER_MAX_DEG;
  const lngOffset = ((((h >> 16) & 0xffff) / 0xffff) * 2 - 1) * JITTER_MAX_DEG;
  return {
    lat: specimen.latitude + latOffset,
    lng: specimen.longitude + lngOffset,
  };
}

function groupByCoord(
  specimens: Specimen[],
): Map<string, { group: Specimen[]; lat: number; lng: number }> {
  const groups = new Map<
    string,
    { group: Specimen[]; lat: number; lng: number }
  >();
  for (const s of specimens) {
    if (s.latitude === null || s.longitude === null) continue;
    const { lat, lng } = deterministicJitter(s);
    const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, { group: [], lat, lng });
    groups.get(key)!.group.push(s);
  }
  return groups;
}

export function MapView({
  specimens,
  selected,
  onSelectSpecimen,
  onOpenDetail,
  onBboxChange,
  onClearSelection,
  bbox,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const spiderMarkersRef = useRef<maplibregl.Marker[]>([]);
  const spiderLinesRef = useRef<SVGSVGElement | null>(null);
  const drawStartRef = useRef<maplibregl.LngLat | null>(null);
  const isDrawing = useRef(false);
  const activeSpiderCoord = useRef<string | null>(null);

  // ── Local bbox state for toolbar UI feedback ──────────────────
  const [activeBbox, setActiveBbox] = useState<
    [number, number, number, number] | null
  >(null);
  const [isDrawMode, setIsDrawMode] = useState(false);

  // Count of georeferenced specimens within the current bbox
  const georefCount = specimens.filter((s) => s.latitude !== null).length;
  const bboxCount = activeBbox
    ? specimens.filter((s) => {
        if (s.latitude === null || s.longitude === null) return false;
        const [minLng, minLat, maxLng, maxLat] = activeBbox;
        return (
          s.longitude >= minLng &&
          s.longitude <= maxLng &&
          s.latitude >= minLat &&
          s.latitude <= maxLat
        );
      }).length
    : null;

  // ── Clear spider ──────────────────────────────────────────────
  const clearSpider = useCallback(() => {
    spiderMarkersRef.current.forEach((m) => m.remove());
    spiderMarkersRef.current = [];
    if (spiderLinesRef.current) {
      spiderLinesRef.current.remove();
      spiderLinesRef.current = null;
    }
    activeSpiderCoord.current = null;
  }, []);

  // ── Open spider ───────────────────────────────────────────────
  const openSpider = useCallback(
    (specimens: Specimen[], lngLat: maplibregl.LngLat) => {
      const map = mapRef.current;
      if (!map) return;

      clearSpider();

      const offsets = spiderfyOffsets(specimens.length);
      const centerPx = map.project(lngLat);
      const container = map.getContainer();

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      Object.assign(svg.style, {
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "10",
        overflow: "visible",
      });
      container.appendChild(svg);
      spiderLinesRef.current = svg;

      specimens.forEach((specimen, i) => {
        const [dx, dy] = offsets[i];
        const isSelected = selected?.plant_id === specimen.plant_id;
        const SIZE = 12;
        const cx = centerPx.x + dx;
        const cy = centerPx.y + dy;

        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        line.setAttribute("x1", String(centerPx.x));
        line.setAttribute("y1", String(centerPx.y));
        line.setAttribute("x2", String(cx));
        line.setAttribute("y2", String(cy));
        line.setAttribute("stroke", "#c4952a");
        line.setAttribute("stroke-width", "1");
        line.setAttribute("stroke-opacity", "0.5");
        svg.appendChild(line);

        const dot = document.createElement("div");
        Object.assign(dot.style, {
          position: "absolute",
          width: `${SIZE}px`,
          height: `${SIZE}px`,
          left: `${cx - SIZE / 2}px`,
          top: `${cy - SIZE / 2}px`,
          borderRadius: "50%",
          background: isSelected ? "#8b3a1f" : "#4a5e35",
          border: `2px solid ${isSelected ? "#c4952a" : "#f5efe0"}`,
          boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
          cursor: "pointer",
          zIndex: "11",
          transform: "scale(0)",
          transition: "transform 0.15s ease",
          boxSizing: "border-box",
        });
        container.appendChild(dot);

        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            dot.style.transform = "scale(1)";
          }),
        );

        const legLngLat = map.unproject([cx, cy]);
        const popup = new maplibregl.Popup({
          offset: 10,
          closeButton: false,
          closeOnClick: true,
          maxWidth: "280px",
          anchor: "bottom",
        })
          .setLngLat(legLngLat)
          .setHTML(buildPopupHtml(specimen));

        dot.addEventListener("mouseenter", () => {
          dot.style.transform = "scale(1.35)";
          popup.addTo(map);
        });
        dot.addEventListener("mouseleave", () => {
          dot.style.transform = "scale(1)";
          popup.remove();
        });
        // Debounce click so dblclick can cancel it before it fires.
        // Without this, the two clicks that precede dblclick trigger
        // onSelectSpecimen → selected changes → openSpider re-runs →
        // the dot is removed before the dblclick event lands on it.
        let clickTimer: ReturnType<typeof setTimeout> | null = null;

        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          if (clickTimer) return; // second click of a dblclick — ignore
          clickTimer = setTimeout(() => {
            clickTimer = null;
            onSelectSpecimen(specimen);
            popup.addTo(map);
          }, 220);
        });

        dot.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          // Cancel the pending single-click so it doesn't also fire
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          onSelectSpecimen(specimen);
          onOpenDetail(specimen);
          popup.remove();
          clearSpider();
        });

        spiderMarkersRef.current.push({
          remove: () => {
            dot.remove();
            popup.remove();
          },
        } as unknown as maplibregl.Marker);
      });
    },
    [clearSpider, selected, onSelectSpecimen],
  );

  // ── 1. Initialise map once ────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Primary: OpenFreeMap liberty. Falls back to Carto Positron if tiles fail.
    const PRIMARY_STYLE = "https://tiles.openfreemap.org/styles/liberty";
    const FALLBACK_STYLE =
      "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: PRIMARY_STYLE,
      center: [31.0, -19.0],
      zoom: 6,
    });

    // If the primary style fails to load, swap to the fallback silently
    mapRef.current.once("error", (e) => {
      if (
        e.error?.message?.includes("tiles.openfreemap") ||
        String(e.error).includes("tiles.openfreemap")
      ) {
        console.warn("OpenFreeMap tiles failed, switching to fallback style");
        mapRef.current?.setStyle(FALLBACK_STYLE);
      }
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");

    mapRef.current.on("click", () => {
      clearSpider();
      onClearSelection();
    });

    mapRef.current.on("load", () => {
      mapRef.current!.addSource("bbox-rect", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      mapRef.current!.addLayer({
        id: "bbox-fill",
        type: "fill",
        source: "bbox-rect",
        paint: { "fill-color": "#c4952a", "fill-opacity": 0.1 },
      });
      mapRef.current!.addLayer({
        id: "bbox-outline",
        type: "line",
        source: "bbox-rect",
        paint: { "line-color": "#c4952a", "line-width": 2 },
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ── 2. Render markers with spiderfy ──────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    clearSpider();

    const groups = groupByCoord(specimens);

    groups.forEach(({ group, lat, lng }, coordKey) => {
      const isGroupSelected = group.some(
        (s) => s.plant_id === selected?.plant_id,
      );
      const hasMultiple = group.length > 1;
      const isApprox = group.every((s) => s.coord_source === "grid_reference");

      const el = document.createElement("div");
      const SIZE = hasMultiple ? 18 : 14;
      const HOVER_SIZE = hasMultiple ? 24 : 20;

      Object.assign(el.style, {
        width: `${SIZE}px`,
        height: `${SIZE}px`,
        borderRadius: "50%",
        background: isGroupSelected ? "#8b3a1f" : "#4a5e35",
        border: `2px ${isApprox ? "dashed" : "solid"} ${isGroupSelected ? "#c4952a" : "#f5efe0"}`,
        opacity: isApprox ? "0.75" : "1",
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        cursor: "pointer",
        marginLeft: `-${SIZE / 2}px`,
        marginTop: `-${SIZE / 2}px`,
        transition:
          "width 0.12s ease, height 0.12s ease, margin 0.12s ease, box-shadow 0.12s ease",
        outline: hasMultiple ? "2px solid rgba(196,149,42,0.4)" : "none",
        outlineOffset: "2px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      });

      if (hasMultiple) {
        const badge = document.createElement("span");
        badge.textContent = String(group.length);
        Object.assign(badge.style, {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#f5efe0",
          fontWeight: "bold",
          lineHeight: "1",
          pointerEvents: "none",
          userSelect: "none",
        });
        el.appendChild(badge);
      }

      el.addEventListener("mouseenter", () => {
        Object.assign(el.style, {
          width: `${HOVER_SIZE}px`,
          height: `${HOVER_SIZE}px`,
          marginLeft: `-${HOVER_SIZE / 2}px`,
          marginTop: `-${HOVER_SIZE / 2}px`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.55)",
        });
        if (!hasMultiple) {
          const popup = marker.getPopup();
          if (popup && !popup.isOpen()) marker.togglePopup();
        }
      });

      el.addEventListener("mouseleave", () => {
        Object.assign(el.style, {
          width: `${SIZE}px`,
          height: `${SIZE}px`,
          marginLeft: `-${SIZE / 2}px`,
          marginTop: `-${SIZE / 2}px`,
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        });
        const popup = marker.getPopup();
        if (popup?.isOpen()) marker.togglePopup();
      });

      let markerClickTimer: ReturnType<typeof setTimeout> | null = null;

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (markerClickTimer) return; // part of a dblclick — ignore
        markerClickTimer = setTimeout(() => {
          markerClickTimer = null;
          if (hasMultiple) {
            if (activeSpiderCoord.current === coordKey) {
              clearSpider();
            } else {
              activeSpiderCoord.current = coordKey;
              openSpider(group, new maplibregl.LngLat(lng, lat));
            }
          } else {
            clearSpider();
            onSelectSpecimen(group[0]);
            const popup = marker.getPopup();
            if (popup && !popup.isOpen()) marker.togglePopup();
          }
        }, 220);
      });

      el.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (markerClickTimer) {
          clearTimeout(markerClickTimer);
          markerClickTimer = null;
        }
        const target = group[0];
        onSelectSpecimen(target);
        onOpenDetail(target);
      });

      const popup =
        group.length === 1
          ? new maplibregl.Popup({
              offset: 10,
              closeButton: false,
              closeOnClick: true,
              maxWidth: "280px",
            }).setHTML(buildPopupHtml(group[0]))
          : undefined;

      const marker = new maplibregl.Marker({ element: el }).setLngLat([
        lng,
        lat,
      ]);
      if (popup) marker.setPopup(popup);
      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [specimens, selected, clearSpider, openSpider, onSelectSpecimen]);

  // ── 3. Sync external bbox clear → wipe visual rectangle ─────────
  useEffect(() => {
    if (bbox !== null || activeBbox === null) return;
    const source = mapRef.current?.getSource(
      "bbox-rect",
    ) as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: [] });
    setActiveBbox(null);
  }, [bbox]);

  // ── 4. Draw-to-filter ─────────────────────────────────────────
  function startDrawMode() {
    const map = mapRef.current;
    if (!map || isDrawing.current) return;

    isDrawing.current = true;
    setIsDrawMode(true);
    map.getCanvas().style.cursor = "crosshair";
    map.dragPan.disable();

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      drawStartRef.current = e.lngLat;

      const onMouseMove = (e: maplibregl.MapMouseEvent) => {
        if (!drawStartRef.current) return;
        const start = drawStartRef.current;
        const end = e.lngLat;
        const source = map.getSource("bbox-rect") as maplibregl.GeoJSONSource;
        source?.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [start.lng, start.lat],
                    [end.lng, start.lat],
                    [end.lng, end.lat],
                    [start.lng, end.lat],
                    [start.lng, start.lat],
                  ],
                ],
              },
              properties: {},
            },
          ],
        });
      };

      const onMouseUp = (e: maplibregl.MapMouseEvent) => {
        map.off("mousemove", onMouseMove);
        map.off("mouseup", onMouseUp);
        map.off("mousedown", onMouseDown);
        map.getCanvas().style.cursor = "";
        map.dragPan.enable();
        isDrawing.current = false;
        setIsDrawMode(false);

        if (!drawStartRef.current) return;
        const start = drawStartRef.current;
        const end = e.lngLat;
        drawStartRef.current = null;

        // Ignore tiny accidental drags (< 0.01° in both axes)
        if (
          Math.abs(end.lng - start.lng) < 0.01 &&
          Math.abs(end.lat - start.lat) < 0.01
        ) {
          const source = map.getSource("bbox-rect") as maplibregl.GeoJSONSource;
          source?.setData({ type: "FeatureCollection", features: [] });
          return;
        }

        const bbox: [number, number, number, number] = [
          Math.min(start.lng, end.lng),
          Math.min(start.lat, end.lat),
          Math.max(start.lng, end.lng),
          Math.max(start.lat, end.lat),
        ];

        // Update local state for the count badge, then propagate up
        setActiveBbox(bbox);
        onBboxChange(bbox);
      };

      map.on("mousemove", onMouseMove);
      map.on("mouseup", onMouseUp);
    };

    map.once("mousedown", onMouseDown);
  }

  function clearBbox() {
    const map = mapRef.current;
    const source = map?.getSource("bbox-rect") as maplibregl.GeoJSONSource;
    source?.setData({ type: "FeatureCollection", features: [] });
    setActiveBbox(null);
    onBboxChange(null);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          background: "var(--parchment-dark)",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid var(--border)",
          fontSize: "0.78rem",
          fontFamily: "var(--font-mono)",
          color: "var(--sepia)",
          flexShrink: 0,
        }}
      >
        {/* Specimen count: shows filtered/total when a bbox is active */}
        <span>
          {activeBbox
            ? `${bboxCount} / ${georefCount} in area`
            : `${georefCount} georeferenced`}
        </span>

        <button
          className="btn-ghost"
          onClick={startDrawMode}
          disabled={isDrawMode}
          style={{
            fontSize: "0.7rem",
            padding: "4px 10px",
            opacity: isDrawMode ? 0.5 : 1,
            outline: isDrawMode ? "1px solid var(--gold)" : "none",
          }}
        >
          {isDrawMode ? "⌛ Drawing…" : "✎ Draw area to filter"}
        </button>

        {activeBbox && (
          <button
            className="btn-danger"
            onClick={clearBbox}
            style={{ fontSize: "0.65rem", padding: "4px 8px" }}
          >
            ✕ Clear area
          </button>
        )}
      </div>

      <div ref={containerRef} style={{ flex: 1, position: "relative" }} />
    </div>
  );
}

// ── Popup HTML builder ────────────────────────────────────────────
function buildPopupHtml(specimen: Specimen): string {
  const isApprox = specimen.coord_source === "grid_reference";
  return `
    <div style="font-family:'Cormorant Garamond',Georgia,serif; padding:4px 0;">
      <div style="
        font-style:italic;
        font-size:1rem;
        color:#e6c97a;
        margin-bottom:6px;
        line-height:1.3;
      ">
        ${specimen.name ?? "Unknown species"}
      </div>
      <div style="
        font-family:'Inconsolata',monospace;
        font-size:0.68rem;
        color:#c4a87a;
        letter-spacing:0.05em;
        line-height:1.6;
      ">
        ${specimen.plant_id}<br/>
        ${specimen.district ?? ""} · ${specimen.date ?? ""}<br/>
        ${specimen.habitat ?? ""}
      </div>
      ${
        specimen.collector_name
          ? `<div style="
              font-family:'Inconsolata',monospace;
              font-size:0.65rem;
              color:#7a5c2e;
              margin-top:4px;
            ">${specimen.collector_name}</div>`
          : ""
      }
      ${
        isApprox
          ? `<div style="
              font-family:'Inconsolata',monospace;
              font-size:0.6rem;
              color:#5a4a2e;
              margin-top:6px;
              padding-top:4px;
              border-top:1px solid #2a1f0e;
              letter-spacing:0.03em;
            ">~ position approximate (grid ref)</div>`
          : ""
      }
    </div>
  `;
}
