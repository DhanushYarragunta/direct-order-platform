"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import { request } from "@/lib/client";
import type { LocationSuggestion } from "@/lib/profile-types";
import type { AddressSearchResult } from "@/lib/address-search";
import "./address-search.css";

export function AddressSearch({ onSelect, onQueryChange, label = "Search delivery location", initialQuery = "" }: {
  onSelect: (value: LocationSuggestion) => void;
  onQueryChange?: () => void;
  label?: string;
  initialQuery?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [result, setResult] = useState<AddressSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  const [retry, setRetry] = useState(0);
  const normalized = query.trim().replace(/\s+/g, " ");
  const visible = expanded && normalized.length >= 3 && selectedQuery !== query;

  useEffect(() => {
    setResult(null); setError(""); setActive(-1);
    if (normalized.length < 3 || selectedQuery === query) { setLoading(false); return; }
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void request<AddressSearchResult>(`/api/locations/search?q=${encodeURIComponent(normalized)}`, "GET", undefined, controller.signal)
        .then((value) => { if (alive) setResult(value); })
        .catch((failure: Error) => { if (alive && !controller.signal.aborted) setError(failure.message); })
        .finally(() => { if (alive) setLoading(false); });
    }, 600);
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [normalized, retry, selectedQuery, query]);
  useEffect(() => {
    if (visible && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, visible, id]);

  function select(value: LocationSuggestion) {
    setSelectedQuery(value.name); setQuery(value.name); setExpanded(false); setActive(-1);
    onSelect(value);
  }
  function change(value: string) {
    setSelectedQuery(null); setQuery(value); setResult(null); setError(""); setActive(-1); setExpanded(true);
    onQueryChange?.();
  }
  return <div className="address-search" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
  }}>
    <label htmlFor={`${id}-input`}>{label}</label>
    <div className={`address-search-control ${visible ? "is-open" : ""}`}>
      <Search size={20} aria-hidden="true" />
      <input ref={input} id={`${id}-input`} type="text" role="combobox" autoComplete="off" spellCheck={false}
        aria-autocomplete="list" aria-expanded={visible} aria-controls={`${id}-results`}
        aria-activedescendant={visible && active >= 0 && result?.results[active] ? `${id}-option-${active}` : undefined}
        aria-describedby={`${id}-help`} placeholder="Area, building or landmark in Hyderabad" maxLength={120}
        value={query} onChange={(event) => change(event.target.value)} onFocus={() => setExpanded(true)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); setActive(-1); }
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && result?.results.length) {
            event.preventDefault(); setExpanded(true);
            setActive((current) => event.key === "ArrowDown" ? (current + 1) % result.results.length
              : current < 0 ? result.results.length - 1 : (current - 1 + result.results.length) % result.results.length);
          }
          if (event.key === "Enter" && selectedQuery !== query) {
            // Never submit an address form with free text pretending to be a place.
            event.preventDefault();
            if (visible && active >= 0 && result?.results[active]) select(result.results[active]);
            else setExpanded(true);
          }
        }} />
      {query && <button type="button" className="address-search-clear" aria-label="Clear location search" onClick={() => {
        change(""); input.current?.focus();
      }}><X size={18} /></button>}
    </div>
    <p id={`${id}-help`} className="address-search-help">Choose a suggestion, then add your flat or house details. Searches use OpenStreetMap place data.</p>
    {visible && <div className="address-search-dropdown">
      <div className="address-search-status" role="status" aria-live="polite">
        {loading ? <><LoaderCircle size={17} className="spin" aria-hidden="true" /> Finding places…</>
          : error ? <span>{error}</span>
            : result?.warning || (result ? `${result.results.length} ${result.results.length === 1 ? "place" : "places"} found` : "")}
      </div>
      <ul id={`${id}-results`} role="listbox" aria-label="Location suggestions" className="address-search-results">
        {!loading && !error && result?.results.map((item, index) => <li key={item.id} id={`${id}-option-${index}`}
          role="option" aria-selected={active === index} className={active === index ? "active" : ""}
          onMouseDown={(event) => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => select(item)}>
          <span className="address-search-pin"><MapPin size={19} aria-hidden="true" /></span>
          <span><strong>{item.name}</strong><span>{item.address.startsWith(`${item.name}, `) ? item.address.slice(item.name.length + 2) : item.address}</span>
            {item.kind === "area" && <small>Area centre · full address needed</small>}</span>
        </li>)}
      </ul>
      {!loading && (error || result?.provider === "local") && <button type="button" className="address-search-retry"
        onClick={() => setRetry((value) => value + 1)}>Try map search again</button>}
      {result && <div className="address-search-attribution">{result.provider === "photon"
        ? <><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a><span> · Search by Photon</span></>
        : result.attribution}</div>}
    </div>}
  </div>;
}
