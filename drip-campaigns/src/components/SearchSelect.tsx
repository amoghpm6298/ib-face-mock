// A single-pick control for a list too long to scan: closed it shows the
// chosen item's short label, open it is a search box over the list and the
// list narrows as you type.
//
// Built rather than reusing MultiSelectDropdown because that one is a
// checkbox list with no search, which is the wrong shape for "pick exactly
// one out of forty". Matching its chrome (.msel-trigger / .msel-panel) so
// the two read as the same family.
import { useMemo, useRef, useState } from 'react';

export interface SearchOption {
  value: string;
  label: string;
  // Extra text the search should match but the closed field must not show
  // — the raw event name, for instance.
  searchText?: string;
  group?: string;
}

export function SearchSelect({
  options,
  value,
  placeholder = 'Search…',
  emptyText = 'Nothing matches that.',
  onPick,
}: {
  options: SearchOption[];
  value: string;
  placeholder?: string;
  emptyText?: string;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chosen = options.find((o) => o.value === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Matches the short label AND the raw name behind it, so searching the
    // underlying event name finds it even though the field only ever shows
    // the label.
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.searchText || '').toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="msel-trigger"
        onClick={() => {
          setOpen((o) => !o);
          setQuery('');
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        {/* Closed, this shows the short label only — never the raw name. */}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chosen ? chosen.label : 'Select…'}</span>
        <span style={{ color: 'var(--gray-400)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="msel-panel">
          <input
            ref={inputRef}
            className="f-input"
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 6 }}
          />
          {matches.length === 0 ? (
            <div className="f-hint" style={{ margin: 0 }}>
              {emptyText}
            </div>
          ) : (
            matches.map((o) => (
              <div
                className="msel-option"
                key={o.value}
                onClick={() => {
                  onPick(o.value);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <span style={{ fontWeight: o.value === value ? 600 : 400 }}>{o.label}</span>
                {o.group && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--gray-500)' }}>{o.group}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
