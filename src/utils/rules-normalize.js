// utils/rules-normalize.js
import he from "he"; // npm i he

export function normalizeScrapedRules(scrape) {
  const rules = (scrape.rules || []).map((r, i) => ({
    index: Number.isFinite(r.index) ? r.index + 1 : i + 1, // 1-based
    id: r.id || null,
    title: r.title || "",
    body_text: (r.body_text || "").trim(),
    body_html: r.body_html ? he.decode(r.body_html) : ""
  }));
  return { ...scrape, rules };
}
