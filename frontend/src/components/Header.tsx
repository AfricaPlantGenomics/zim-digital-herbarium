interface HeaderProps {
  totalCount: number;
  filteredCount: number;
}

export function Header({ totalCount, filteredCount }: HeaderProps) {
  return (
    <>
      {/* Left: title */}
      <div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.5rem",
            color: "var(--gold-light)",
            letterSpacing: "0.05em",
          }}
        >
          Zimbabwe National Herbarium Collection
        </h1>
        <p
          className="mono"
          style={{ color: "var(--border)", fontSize: "0.65rem" }}
        >
          Crop Wild Relative Specimens
        </p>
      </div>

      {/* Right: record count badge */}
      <div style={{ marginLeft: "auto" }}>
        <span
          className="mono"
          style={{
            color: "var(--gold-light)",
            background: "rgba(196,149,42,0.15)",
            border: "1px solid var(--gold)",
            padding: "4px 12px",
            fontSize: "0.8rem",
          }}
        >
          {/* Show filtered count if filtering is active */}
          {filteredCount < totalCount
            ? `${filteredCount} / ${totalCount} specimens`
            : `${totalCount} specimens`}
        </span>
      </div>
    </>
  );
}
