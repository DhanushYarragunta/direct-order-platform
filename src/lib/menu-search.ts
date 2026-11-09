export type SearchableDish = {
  id: string;
  name: string;
  description: string;
  category: string;
  vegetarian: boolean;
  available: boolean;
};

const aliases: Record<string, string> = {
  biriyani: "biryani", biriani: "biryani", briyani: "biryani", biryanis: "biryani",
  kabab: "kebab", kababs: "kebab", kebabs: "kebab",
};

export function normalizeMenuQuery(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/)
    .map(word => aliases[word] || word).join(" ");
}

function includesTokens(text: string, tokens: string[]) {
  const words = normalizeMenuQuery(text).split(" ");
  return tokens.every(token => words.some(word => word.startsWith(token)));
}

/** Each query word must match a word prefix; spelling aliases are explicit. */
export function searchMenu<T extends SearchableDish>(items: T[], query: string) {
  const normalized = normalizeMenuQuery(query);
  if (!normalized) return items;
  const tokens = normalized.split(" ");
  return items.filter(item => includesTokens(`${item.name} ${item.category} ${item.description}`, tokens))
    .map(item => ({ item, score: normalizeMenuQuery(item.name) === normalized ? 3
      : includesTokens(item.name, tokens) ? 2 : includesTokens(item.category, tokens) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score).map(({ item }) => item);
}

export type MenuSuggestion = { id: string; value: string; kind: "dish" | "category"; detail: string };

export function menuSuggestions(items: SearchableDish[], query: string): MenuSuggestion[] {
  const normalized = normalizeMenuQuery(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ");
  const categories = [...new Set(items.map(item => item.category))]
    .filter(category => includesTokens(category, tokens)).slice(0, 2)
    .map(category => ({ id: `category-${category}`, value: category, kind: "category" as const,
      detail: `${items.filter(item => item.category === category).length} dishes · Category` }));
  const dishes = searchMenu(items, query).slice(0, 6 - categories.length)
    .map(item => ({ id: item.id, value: item.name, kind: "dish" as const,
      detail: item.available ? item.category : `${item.category} · Currently unavailable` }));
  return [...categories, ...dishes];
}
