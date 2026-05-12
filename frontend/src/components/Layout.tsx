// Layout.tsx — the permanent skeleton of the app.
// It never changes — only its children (main content area) swap out.

interface LayoutProps {
  // "children" is a special React prop — it's whatever you put between
  // the opening and closing tags of a component:
  // <Layout><MapView /></Layout>  ← MapView is children
  sidebar: React.ReactNode; // the left panel
  header: React.ReactNode; // the top bar
  children: React.ReactNode; // the main content area
}

export function Layout({ sidebar, header, children }: LayoutProps) {
  return (
    // The outermost div sets up the grid
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "300px 1fr",
        gridTemplateRows: "62px 1fr",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Header spans both columns: gridColumn 1 / -1 means "from col 1 to last" */}
      <header
        style={{
          gridColumn: "1 / -1",
          background: "var(--ink)",
          borderBottom: "3px solid var(--gold)",
          display: "flex",
          alignItems: "center",
          padding: "0 var(--space-xl)",
          gap: "var(--space-lg)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        {header}
      </header>

      {/* Sidebar — second row, first column */}
      <aside
        style={{
          background: "var(--parchment-dark)",
          borderRight: "2px solid var(--border)",
          overflowY: "auto",
          padding: "var(--space-md)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-md)",
        }}
      >
        {sidebar}
      </aside>

      {/* Main content — second row, second column */}
      <main
        style={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </main>
    </div>
  );
}
