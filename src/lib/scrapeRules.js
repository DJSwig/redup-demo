// src/lib/scrapeRules.js
// Node 18+ (global fetch). ESM.
// npm i cheerio
import * as cheerio from "cheerio";

const UA = "RuleScraper/1.0 (+edu project)";
const clean = (s = "") => s.replace(/\s+/g, " ").trim();

function absolutizeLinks($scope, base = "https://www.reddit.com") {
  $scope.find("a[href]").each((_, a) => {
    const $a = $scope(a);
    const href = String($a.attr("href") || "");
    if (/^https?:\/\//i.test(href) || href.startsWith("#")) return;
    $a.attr("href", base + (href.startsWith("/") ? href : "/" + href));
  });
  return $scope;
}

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json,text/*;q=0.8" } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    const e = new Error(`GET ${url} → ${r.status} ${r.statusText}${t ? `: ${t.slice(0,120)}…` : ""}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function getHTML(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    const e = new Error(`GET ${url} → ${r.status} ${r.statusText}${t ? `: ${t.slice(0,120)}…` : ""}`);
    e.status = r.status;
    throw e;
  }
  return r.text();
}

export async function verifySubExists(sub) {
  const s = String(sub || "").trim().replace(/^\/?r\//i, "");
  if (!s) throw new Error("Missing subreddit name.");
  const about = await getJSON(`https://www.reddit.com/r/${s}/about.json`);
  const d = about?.data;
  if (!(d && typeof d.subscribers === "number")) {
    const e = new Error(`r/${s} does not look like a real subreddit`);
    e.status = 404;
    throw e;
  }
  return {
    name: d.display_name_prefixed || `r/${s}`,
    over18: !!d.over18,
    quarantine: !!d.quarantine,
    subscribers: d.subscribers || 0,
  };
}

function parseNewRulesWidget(html) {
  const $ = cheerio.load(html);
  const details = $("faceplate-expandable-section-helper > details");
  const out = [];
  details.each((_, el) => {
    const $details = $(el);
    const hasTracker = $details.find('summary faceplate-tracker[source="rules_widget"]').length > 0;
    if (!hasTracker) return;

    const $summary = $details.find("summary").first();
    const id = $summary.attr("aria-controls") || null;

    const idxTxt = $summary.find('span.text-neutral-content-weak.text-14.font-normal').first().text().trim();
    const index = Number.parseInt(idxTxt, 10) || null;

    const title = clean($summary.find("h2").first().text());

    let $content = id ? $details.find(`[id="${id}"] #\\-post-rtjson-content`).first() : null;
    if (!$content || !$content.length) $content = id ? $details.find(`[id="${id}"] .md`).first() : null;
    if (!$content || !$content.length) $content = $details.find(".md").first();

    const $wrap = cheerio.load("<div/>")("div");
    if ($content && $content.length) $wrap.append($content.clone());
    absolutizeLinks($wrap);
    const body_html = $wrap.html() || "";
    const body_text = clean(($content && $content.text()) || "");

    if (title || body_text) out.push({ index, id, title, body_text, body_html });
  });
  return out;
}
const parseNewAboutRules = parseNewRulesWidget;

function parseOldRules(html) {
  const $ = cheerio.load(html);
  const out = [];
  $(".content .rules").each((_, ul) => {
    $(ul).children("li").each((i, li) => {
      const $li = $(li);
      const title = clean($li.find("h2").first().text());
      const $md = $li.find(".md").first();
      const $wrap = cheerio.load("<div/>")("div");
      $wrap.append($md.clone());
      absolutizeLinks($wrap, "https://old.reddit.com");
      out.push({
        index: i + 1,
        id: null,
        title,
        body_text: clean($md.text() || ""),
        body_html: $wrap.html() || "",
      });
    });
  });
  return out;
}

function parseApiRules(json) {
  const rules = json?.rules || [];
  return rules.map((r, i) => ({
    index: typeof r.priority === "number" ? r.priority : i + 1,
    id: r.short_name ? `api:${r.short_name}` : null,
    title: r.short_name || "",
    body_text: clean(r.description || ""),
    body_html: r.description_html || "",
  }));
}

export async function scrapeRules(subArg) {
  const s = String(subArg || "").trim().replace(/^\/?r\//i, "");
  const about = await verifySubExists(s);

  try {
    const html = await getHTML(`https://www.reddit.com/r/${s}/`);
    const rules = parseNewRulesWidget(html);
    if (rules.length) return { subreddit: `r/${s}`, source: "new-home", about, count: rules.length, rules };
  } catch (_) {}

  try {
    const html = await getHTML(`https://www.reddit.com/r/${s}/about/rules`);
    const rules = parseNewAboutRules(html);
    if (rules.length) return { subreddit: `r/${s}`, source: "new-about-rules", about, count: rules.length, rules };
  } catch (_) {}

  try {
    const html = await getHTML(`https://old.reddit.com/r/${s}/about/rules`);
    const rules = parseOldRules(html);
    if (rules.length) return { subreddit: `r/${s}`, source: "old-about-rules", about, count: rules.length, rules };
  } catch (_) {}

  try {
    const json = await getJSON(`https://www.reddit.com/r/${s}/about/rules.json`);
    const rules = parseApiRules(json);
    if (rules.length) return { subreddit: `r/${s}`, source: "api-json", about, count: rules.length, rules };
  } catch (_) {}

  const e = new Error(`Could not locate rules for r/${s} via HTML or API.`);
  e.status = 404;
  throw e;
}
