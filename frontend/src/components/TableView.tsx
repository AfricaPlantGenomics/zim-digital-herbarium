import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import type { Specimen } from "../types/specimen";

interface TableViewProps {
  specimens: Specimen[];
  selected: Specimen | null;
  onSelectSpecimen: (s: Specimen) => void;
}

const col = createColumnHelper<Specimen>();

const COLUMNS = [
  col.accessor("name", {
    header: "Species",
    cell: (info) => (
      <span style={{ fontStyle: "italic", color: "var(--moss)" }}>
        {info.getValue() ?? "—"}
      </span>
    ),
  }),

  col.accessor("plant_id", {
    header: "Plant ID",
    cell: (info) => (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.72rem",
          color: "var(--sepia)",
        }}
      >
        {info.getValue()}
      </span>
    ),
  }),

  col.accessor("date", {
    header: "Date",
    cell: (info) => info.getValue() ?? "—",
  }),

  // modern_district: show value directly — no fallback to district per spec
  col.accessor("modern_district", {
    header: "District",
    cell: (info) => {
      const v = info.getValue();
      return (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            color: "var(--sepia)",
          }}
        >
          {v ?? "—"}
        </span>
      );
    },
  }),

  col.accessor("collector_name", {
    header: "Collector",
    cell: (info) => info.getValue() ?? "—",
  }),

  // altitude_m is a number | null — compare with !== null, never !== ""
  col.accessor("altitude_m", {
    header: "Alt. (m)",
    cell: (info) => {
      const m = info.getValue(); // number | null
      if (m !== null) return <span>{m} m</span>;
      // Only reach here if altitude_m was genuinely not set
      const raw = info.row.original.altitude_raw;
      return (
        <span style={{ color: "var(--sepia)", fontSize: "0.8em" }}>
          {raw ?? "—"}
        </span>
      );
    },
  }),

  col.accessor("habitat_iucn_category_description", {
    header: "Habitat (IUCN)",
    cell: (info) => {
      const cats = info.getValue();
      if (!cats || cats.length === 0)
        return <span style={{ color: "var(--sepia)" }}>—</span>;
      const first = cats[0];
      const tooltip = cats.join(" | ");
      return (
        <span
          title={tooltip}
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {first}
          {cats.length > 1 && (
            <span
              style={{
                marginLeft: 4,
                fontSize: "0.68rem",
                color: "var(--gold-text)",
                fontFamily: "var(--font-mono)",
              }}
            >
              +{cats.length - 1}
            </span>
          )}
        </span>
      );
    },
  }),
];

const COL_WIDTHS: Record<string, number | string> = {
  name: "auto",
  plant_id: 140,
  date: 100,
  modern_district: 130,
  collector_name: 150,
  altitude_m: 80,
  habitat_iucn_category_description: 220,
};

export function TableView({
  specimens,
  selected,
  onSelectSpecimen,
}: TableViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: specimens,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "0 16px 16px" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
          fontSize: "0.85rem",
        }}
      >
        <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{
                    background: "var(--ink)",
                    color: "var(--gold-light)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    padding: "10px 12px",
                    textAlign: "left",
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    borderRight: "1px solid rgba(196,149,42,0.3)",
                    width: COL_WIDTHS[header.id] ?? "auto",
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {{ asc: " ↑", desc: " ↓" }[
                    header.column.getIsSorted() as string
                  ] ?? " ⇅"}
                </th>
              ))}
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isSelected = selected?.plant_id === row.original.plant_id;
            return (
              <tr
                key={row.id}
                onClick={() => onSelectSpecimen(row.original)}
                style={{
                  cursor: "pointer",
                  background: isSelected ? "#e8f0e0" : undefined,
                  borderBottom: "1px solid var(--parchment-dark)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.background =
                      "#f0e8d5";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.background = "";
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{
                      padding: "8px 12px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      verticalAlign: "top",
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {specimens.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: "var(--sepia)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
          }}
        >
          No specimens match the current filters
        </div>
      )}
    </div>
  );
}
