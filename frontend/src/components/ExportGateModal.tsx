import { useState, useEffect, useRef } from "react";

// ── Shared types (imported by ExportMenu) ─────────────────────────

export type ExportScope = "filtered" | "selected" | "all";
export type ExportType = "csv" | "zip";
export type UseCase = "Research" | "Education" | "Personal" | "Other";

export interface PendingExport {
  type: ExportType;
  scope: ExportScope;
  specimenCount: number;
  scopeDescription: string;
}

export interface GateFormData {
  fullName: string;
  email: string;
  useCase: UseCase;
}

// ── Constants ─────────────────────────────────────────────────────

const DETAILS_KEY = "herbarium_user_details";
const LOG_KEY = "herbarium_export_log";
const MAX_LOG_ENTRIES = 1000;

// ── Helpers ───────────────────────────────────────────────────────

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function appendLocalLog(
  formData: GateFormData,
  pending: PendingExport,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    fullName: formData.fullName,
    email: formData.email,
    useCase: formData.useCase,
    exportType: pending.type,
    scope: pending.scope,
    specimenCount: pending.specimenCount,
    userAgent: navigator.userAgent,
  };
  try {
    const existing: unknown[] = JSON.parse(
      localStorage.getItem(LOG_KEY) ?? "[]",
    );
    const updated = [...existing, entry].slice(-MAX_LOG_ENTRIES);
    localStorage.setItem(LOG_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable — silently skip
  }
}

// ── Component ─────────────────────────────────────────────────────

interface Props {
  pending: PendingExport;
  onConfirm: (data: GateFormData) => void;
  onCancel: () => void;
}

export function ExportGateModal({ pending, onConfirm, onCancel }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState<UseCase | "">("");
  const [rememberMe, setRememberMe] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Restore saved details
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DETAILS_KEY);
      if (saved) {
        const p = JSON.parse(saved) as Partial<
          GateFormData & { rememberMe: boolean }
        >;
        setFullName(p.fullName ?? "");
        setEmail(p.email ?? "");
        setUseCase(p.useCase ?? "");
        setRememberMe(true);
      }
    } catch {
      // ignore
    }
    nameRef.current?.focus();
  }, []);

  // Escape key + focus trap
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const isValid =
    fullName.trim().length > 0 && isValidEmail(email) && useCase !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const data: GateFormData = {
      fullName: fullName.trim(),
      email: email.trim(),
      useCase: useCase as UseCase,
    };
    try {
      if (rememberMe) {
        localStorage.setItem(
          DETAILS_KEY,
          JSON.stringify({ ...data, rememberMe: true }),
        );
      } else {
        localStorage.removeItem(DETAILS_KEY);
      }
    } catch {
      // ignore
    }
    onConfirm(data);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gate-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 18, 9, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(2px)",
        padding: "16px",
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: "var(--parchment)",
          border: "1px solid var(--border)",
          borderRadius: "2px 5px 2px 10px / 10px 2px 5px 2px",
          maxWidth: 480,
          width: "100%",
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.55), inset 0 0 60px rgba(196,168,122,0.04)",
          overflow: "hidden",
        }}
      >
        {/* Gold top rule */}
        <div
          style={{
            height: 3,
            background:
              "linear-gradient(90deg, transparent, var(--gold), transparent)",
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: "20px 28px 16px",
            textAlign: "center",
            borderBottom: "1px solid var(--parchment-dark)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.55rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--gold-text)",
              marginBottom: 10,
            }}
          >
            ✦ Collection Access Register ✦
          </div>
          <div
            id="gate-title"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.4rem",
              color: "var(--ink)",
              fontStyle: "italic",
              lineHeight: 1.15,
            }}
          >
            Specimen Data Request
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              color: "var(--sepia)",
              letterSpacing: "0.06em",
              display: "flex",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                background: "rgba(196,149,42,0.1)",
                border: "1px solid var(--border)",
                padding: "2px 8px",
              }}
            >
              {pending.type.toUpperCase()}
            </span>
            <span>{pending.scopeDescription}</span>
            <span>{pending.specimenCount.toLocaleString()} records</span>
          </div>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ padding: "18px 28px 20px" }}>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "0.82rem",
              color: "var(--sepia)",
              lineHeight: 1.6,
              marginBottom: 18,
              fontStyle: "italic",
              borderLeft: "2px solid var(--border)",
              paddingLeft: 10,
            }}
          >
            To assist with attribution and usage tracking, please sign the
            register before downloading.
          </p>

          {/* Full Name */}
          <div style={{ marginBottom: 12 }}>
            <label
              htmlFor="gate-name"
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                color: "var(--sepia)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Full Name
            </label>
            <input
              id="gate-name"
              ref={nameRef}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder=""
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "0.9rem",
                width: "100%",
              }}
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: 12 }}>
            <label
              htmlFor="gate-email"
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                color: "var(--sepia)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Email Address
            </label>
            <input
              id="gate-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=""
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "0.9rem",
                width: "100%",
              }}
            />
          </div>

          {/* Use Case */}
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="gate-usecase"
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                color: "var(--sepia)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Purpose of Use
            </label>
            <select
              id="gate-usecase"
              value={useCase}
              onChange={(e) => setUseCase(e.target.value as UseCase)}
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "0.9rem",
                width: "100%",
              }}
            >
              <option value="">— Select purpose —</option>
              <option value="Research">Research</option>
              <option value="Education">Education</option>
              <option value="Personal">Personal</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Remember me */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: "rgba(196,149,42,0.06)",
              border: "1px solid rgba(196,149,42,0.2)",
              marginBottom: 20,
            }}
          >
            <input
              type="checkbox"
              id="gate-remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ accentColor: "var(--gold)", cursor: "pointer" }}
            />
            <label
              htmlFor="gate-remember"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                color: "var(--sepia)",
                letterSpacing: "0.04em",
                cursor: "pointer",
                textTransform: "none",
                marginTop: 0,
                marginBottom: 0,
              }}
            >
              Remember my details for future downloads
            </label>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onCancel}
              className="btn-ghost"
              style={{ fontSize: "0.68rem" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              style={{
                background: isValid ? "var(--moss)" : "rgba(74,94,53,0.25)",
                color: isValid ? "var(--parchment)" : "var(--sepia)",
                border: `1px solid ${isValid ? "var(--moss)" : "var(--border)"}`,
                fontFamily: "var(--font-mono)",
                fontSize: "0.68rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "8px 20px",
                cursor: isValid ? "pointer" : "not-allowed",
                transition: "all 0.15s",
              }}
            >
              ⬇ Download {pending.type.toUpperCase()}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div
          style={{
            padding: "8px 28px 12px",
            borderTop: "1px solid var(--parchment-dark)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.55rem",
              color: "var(--sepia)",
              opacity: 0.65,
              letterSpacing: "0.04em",
            }}
          >
            Your details will not be shared with third parties.
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.55rem",
              color: "var(--gold-text)",
              opacity: 0.7,
              letterSpacing: "0.08em",
            }}
          >
            SRGH ✦ {new Date().getFullYear()}
          </span>
        </div>

        {/* Bottom gold rule */}
        <div
          style={{
            height: 2,
            background:
              "linear-gradient(90deg, transparent, var(--border), transparent)",
          }}
        />
      </div>
    </div>
  );
}
