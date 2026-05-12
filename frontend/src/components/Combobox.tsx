import { useState, useRef, useEffect, useId } from "react";

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  emptyLabel?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Type or select…",
  emptyLabel = "All",
}: ComboboxProps) {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId();

  // Keep local input in sync when external value changes (e.g. clear filters)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filter options by what's typed — case-insensitive substring match
  const filtered =
    inputValue.trim() === ""
      ? options
      : options.filter((o) =>
          o.toLowerCase().includes(inputValue.toLowerCase())
        );

  // Close when clicking outside
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        // If input doesn't match any option exactly, revert to last valid value
        const exact = options.find(
          (o) => o.toLowerCase() === inputValue.toLowerCase()
        );
        if (!exact && inputValue !== "") {
          setInputValue(value);
        }
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [inputValue, value, options]);

  // Scroll highlighted item into view
  useEffect(() => {
    const item = listRef.current?.children[highlighted] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function selectOption(option: string) {
    const val = option === emptyLabel ? "" : option;
    setInputValue(val);
    onChange(val);
    setOpen(false);
    setHighlighted(0);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const total = filtered.length + 1; // +1 for the "All" option
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        setHighlighted((h) => (h + 1) % total);
        break;
      case "ArrowUp":
        e.preventDefault();
        setOpen(true);
        setHighlighted((h) => (h - 1 + total) % total);
        break;
      case "Enter":
        e.preventDefault();
        if (open) {
          if (highlighted === 0) {
            selectOption(emptyLabel);
          } else {
            selectOption(filtered[highlighted - 1]);
          }
        } else {
          setOpen(true);
        }
        break;
      case "Escape":
        setOpen(false);
        setInputValue(value);
        inputRef.current?.blur();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    setOpen(true);
    setHighlighted(0);
    // If user clears the input, clear the filter too
    if (e.target.value === "") onChange("");
  }

  const showClear = inputValue !== "";

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Input + chevron + clear button */}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={inputValue}
          placeholder={placeholder}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          style={{ paddingRight: "42px" }}
        />

        {/* Clear button */}
        {showClear && (
          <button
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault();
              selectOption(emptyLabel);
            }}
            style={{
              position: "absolute",
              right: "22px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "var(--sepia)",
              cursor: "pointer",
              fontSize: "0.75rem",
              padding: "0 2px",
              lineHeight: 1,
            }}
            aria-label="Clear"
          >
            ✕
          </button>
        )}

        {/* Chevron toggle */}
        <button
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
            inputRef.current?.focus();
          }}
          style={{
            position: "absolute",
            right: "4px",
            top: "50%",
            transform: `translateY(-50%) rotate(${open ? "180deg" : "0deg"})`,
            background: "none",
            border: "none",
            color: "var(--sepia)",
            cursor: "pointer",
            fontSize: "0.65rem",
            padding: "0 2px",
            lineHeight: 1,
            transition: "transform 0.15s ease",
          }}
          aria-label="Toggle dropdown"
        >
          ▾
        </button>
      </div>

      {/* Dropdown list */}
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            maxHeight: "200px",
            overflowY: "auto",
            background: "var(--parchment)",
            border: "1px solid var(--border)",
            borderTop: "2px solid var(--gold)",
            listStyle: "none",
            margin: 0,
            padding: 0,
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {/* "All" option */}
          <li
            role="option"
            aria-selected={value === ""}
            onMouseDown={(e) => {
              e.preventDefault();
              selectOption(emptyLabel);
            }}
            onMouseEnter={() => setHighlighted(0)}
            style={{
              padding: "7px 10px",
              fontSize: "0.78rem",
              fontFamily: "var(--font-mono)",
              color: highlighted === 0 ? "var(--gold-text)" : "var(--sepia)",
              background:
                highlighted === 0
                  ? "var(--parchment-dark)"
                  : value === ""
                    ? "rgba(196,149,42,0.08)"
                    : "none",
              cursor: "pointer",
              borderBottom: "1px solid var(--border)",
              fontStyle: "italic",
            }}
          >
            {emptyLabel}
          </li>

          {filtered.length === 0 ? (
            <li
              style={{
                padding: "7px 10px",
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                color: "var(--sepia)",
                fontStyle: "italic",
              }}
            >
              No matches
            </li>
          ) : (
            filtered.map((option, i) => {
              const idx = i + 1; // offset by 1 for the "All" row
              const isHighlighted = highlighted === idx;
              const isSelected = option === value;

              // Highlight matching substring in the option label
              const lower = option.toLowerCase();
              const query = inputValue.toLowerCase();
              const matchIdx = query ? lower.indexOf(query) : -1;

              return (
                <li
                  key={option}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(option);
                  }}
                  onMouseEnter={() => setHighlighted(idx)}
                  style={{
                    padding: "6px 10px",
                    fontSize: "0.78rem",
                    fontFamily: "var(--font-mono)",
                    color: isHighlighted
                      ? "var(--ink)"
                      : isSelected
                        ? "var(--gold-text)"
                        : "var(--ink-light)",
                    background: isHighlighted
                      ? "var(--parchment-dark)"
                      : isSelected
                        ? "rgba(196,149,42,0.12)"
                        : "none",
                    cursor: "pointer",
                    letterSpacing: "0.02em",
                  }}
                >
                  {matchIdx >= 0 ? (
                    <>
                      {option.slice(0, matchIdx)}
                      <span style={{ color: "var(--gold)", fontWeight: "bold" }}>
                        {option.slice(matchIdx, matchIdx + query.length)}
                      </span>
                      {option.slice(matchIdx + query.length)}
                    </>
                  ) : (
                    option
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
