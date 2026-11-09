"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpLeft, Search, UtensilsCrossed, X } from "lucide-react";
import { menuSuggestions, normalizeMenuQuery, type SearchableDish } from "@/lib/menu-search";
import { Diet } from "./ui";
import "./food-search.css";

export function FoodSearch({ query, onChange, onCategoryChange, items, vegetarian, onVegetarianChange, resultCount, onSubmit }: {
  query: string;
  onChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  items: SearchableDish[];
  vegetarian: boolean;
  onVegetarianChange: (value: boolean) => void;
  resultCount: number;
  onSubmit: () => void;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const eligible = vegetarian ? items.filter(item => item.vegetarian) : items;
  const suggestions = menuSuggestions(eligible, query);
  const expanded = open && suggestions.length > 0;
  const searching = !!normalizeMenuQuery(query);
  const popular = ["Biryani", "Starters", "Curries", "Sweets"]
    .filter(category => eligible.some(item => item.category === category));
  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [expanded, active, id]);
  function choose(value: string, category = false) {
    if (category) onCategoryChange(value);
    else onChange(value);
    setActive(-1);
    input.current?.focus();
    setOpen(false);
  }
  return <section className="food-search" aria-label="Menu search">
    <form role="search" aria-label="Food menu" onSubmit={event => {
      event.preventDefault(); setOpen(false); setActive(-1); onSubmit();
    }}>
      <label className="food-search-label" htmlFor={id}>What are you craving?</label>
      <div className="food-search-control" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); setActive(-1); }
      }}>
        <div className="food-search-input-row">
          <Search size={23} aria-hidden="true" />
          <input ref={input} id={id} type="text" role="combobox" aria-label="Search dishes"
            aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-options` : undefined}
            aria-activedescendant={expanded && active >= 0 && suggestions[active] ? `${id}-option-${active}` : undefined}
            autoComplete="off" spellCheck={false} maxLength={100} placeholder="Search biryani, starters, sweets…" value={query}
            onFocus={() => setOpen(true)}
            onChange={event => { onChange(event.target.value); setActive(-1); setOpen(true); }}
            onKeyDown={event => {
              if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
              if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
                event.preventDefault(); setOpen(true);
                setActive(previous => event.key === "ArrowDown" ? (previous + 1) % suggestions.length
                  : previous <= 0 ? suggestions.length - 1 : previous - 1);
              }
              if (event.key === "Enter" && expanded && active >= 0 && suggestions[active]) {
                event.preventDefault(); choose(suggestions[active].value, suggestions[active].kind === "category");
              }
            }} />
          {query && <button type="button" className="food-search-clear" aria-label="Clear search" onClick={() => choose("")}><X size={18} /></button>}
          <button className="food-search-submit" type="submit" aria-label="Show search results">Search</button>
        </div>
        {expanded && <div className="food-search-dropdown">
          <p className="food-search-dropdown-label">DISHES & CATEGORIES</p>
          <ul role="listbox" id={`${id}-options`} aria-label="Food suggestions">
            {suggestions.map((suggestion, index) => <li key={`${suggestion.kind}-${suggestion.id}`}
              role="option" aria-selected={active === index} id={`${id}-option-${index}`}>
              <button type="button" tabIndex={-1} className={active === index ? "highlighted" : ""}
                onMouseDown={event => event.preventDefault()} onClick={() => choose(suggestion.value, suggestion.kind === "category")}>
                <span className="food-search-option-icon">{suggestion.kind === "category" ? <UtensilsCrossed size={18} /> : <Search size={18} />}</span>
                <span><strong>{suggestion.value}</strong><small>{suggestion.detail}</small></span>
                <ArrowUpLeft size={18} aria-hidden="true" />
              </button>
            </li>)}
          </ul>
        </div>}
      </div>
    </form>
    <div className="food-search-tools">
      <div className="food-search-popular" aria-label="Popular searches">
        <span>Try</span>
        {popular.map(category => <button type="button" key={category} aria-label={`Search ${category}`} onClick={() => choose(category, true)}>{category}</button>)}
      </div>
      <label className="food-search-veg"><input type="checkbox" checked={vegetarian} onChange={event => {
        onVegetarianChange(event.target.checked); setActive(-1);
      }} /><Diet veg /> Veg only</label>
    </div>
    {searching && <p className="food-search-status" role="status">
      <strong>{resultCount} {resultCount === 1 ? "dish" : "dishes"}</strong> for “{query.trim()}”{vegetarian ? " · Vegetarian" : ""}
    </p>}
  </section>;
}
