import { useMemo } from "react";
import type { Specimen } from "../types/specimen";

interface Props {
  specimens: Specimen[];
  imageAvailability: Set<string>;
  imagesLoading: boolean;
}

export function DebugView({
  specimens,
  imageAvailability,
  imagesLoading,
}: Props) {
  const missing = useMemo(
    () =>
      specimens
        .filter((s) => !imageAvailability.has(s.plant_id))
        .map((s) => ({
          plant_id: s.plant_id,
          image_path: s.image_path ?? null,
          status: s.image_path ? "stale_path" : "null_path",
          date: s.date ?? null,
        })),
    [specimens, imageAvailability],
  );

  if (imagesLoading)
    return (
      <div
        style={{
          padding: 24,
          fontFamily: "var(--font-mono)",
          color: "var(--sepia)",
        }}
      >
        Resolving image availability…
      </div>
    );

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 24,
        fontFamily: "var(--font-mono)",
        fontSize: "0.75rem",
      }}
    >
      <div style={{ marginBottom: 16, color: "var(--sepia)" }}>
        {missing.length} / {specimens.length} specimens missing verified images
        — {missing.filter((r) => r.status === "null_path").length} null path,{" "}
        {missing.filter((r) => r.status === "stale_path").length} stale path
        (404)
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--border)",
              color: "var(--sepia)",
              opacity: 0.6,
            }}
          >
            <th style={{ textAlign: "left", padding: "4px 8px" }}>plant_id</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>
              image_path
            </th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>status</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>date</th>
          </tr>
        </thead>
        <tbody>
          {missing.map((r) => (
            <tr
              key={r.plant_id}
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <td style={{ padding: "4px 8px", color: "var(--gold)" }}>
                {r.plant_id}
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  color: "var(--sepia)",
                  opacity: 0.6,
                }}
              >
                {r.image_path ?? "—"}
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  color: r.status === "stale_path" ? "#c08040" : "#804040",
                }}
              >
                {r.status}
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  color: "var(--sepia)",
                  opacity: 0.5,
                }}
              >
                {r.date ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
