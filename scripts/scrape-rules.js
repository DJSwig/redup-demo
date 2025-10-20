#!/usr/bin/env node
// Node 18+
// npm i cheerio
import fs from "fs/promises";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UA = "RuleScraper/1.0 (+https://example.edu project; contact@example.edu)";

// ------------ helpers ------------
function normSub(arg) {
  const s = String(arg || "").trim().replace(/^\/?r\//i, "");
  if (!s) throw new Error("Missing subreddit name");
  return s;
}

async function getJSON(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json,text/*;q=0.8"
    }
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    const err = new Error(`GET ${url} → ${r.status} ${r.statusText}${text ? `: ${text.slice(0, 120)}…` : ""}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

async function getHTML(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    const err = new Error(`GET ${url} → ${r.status} ${r.statusText}${text ? `: ${text.slice(0, 120)}…` : ""}`);
    err.status = r.status;
    throw err;
  }
  return r.text();
}

function cleanText(s = "") {
  return s.replace(/\s+/g, " ").trim();
}

function absolutizeLinks($scope, base = "https://www.reddit.com") {
  $scope.find("a[href]").each((_, a) => {
    const $a = $scope(a);
    const href = String($a.attr("href") || "");
    if (/^https?:\/\//i.test(href)) return;
    if (href.startsWith("#")) return;
    $a.attr("href", base + (href.startsWith("/") ? href : "/" + href));
  });
  return $scope;
}

// ------------ parsers ------------
/**
 * Parse modern (new Reddit) "faceplate" rules widget as in the provided snippet.
 * Returns array of {index, id, title, body_text, body_html}
 */
function parseNewRulesWidget(html) {
  const $ = cheerio.load(html);
  // Look for faceplate-expandable-section-helper > details blocks
  const details = $("faceplate-expandable-section-helper > details");
  const out = [];

  details.each((_, el) => {
    const $details = $(el);
    // Ensure this is the rules widget: summary contains a faceplate-tracker[source="rules_widget"]
    const isRule = $details.find('summary faceplate-tracker[source="rules_widget"]').length > 0;
    if (!isRule) return;

    const $summary = $details.find("summary").first();
    const id = $summary.attr("aria-controls") || null;

    // Rule index number
    const idxTxt = $summary.find('span.text-neutral-content-weak.text-14.font-normal').first().text().trim();
    const index = Number.parseInt(idxTxt, 10) || null;

    // Title (h2 inside summary)
    const title = cleanText($summary.find("h2").first().text());

    // Body: the paired content div often sits under faceplate-auto-height-animator content
    // Try a few selectors to be robust
    let $content =
      $details.find(`#${CSS.escape(id)} #\\-post-rtjson-content`).first();
    if (!$content.length) {
      $content = $details.find(`[id="${id}"] .md`).first();
    }
    if (!$content.length) {
      // last resort: any .md inside this details
      $content = $details.find(".md").first();
    }

    const $htmlScope = cheerio.load("<div/>")("div");
    $htmlScope.append($content.clone());
    absolutizeLinks($htmlScope);
    const body_html = $htmlScope.html() || "";
    const body_text = cleanText($content.text() || "");

    if (title || body_text) {
      out.push({ index, id, title, body_text, body_html });
    }
  });

  return out;
}

/**
 * Parse new Reddit "about/rules" page (still faceplate, but page-scoped).
 */
function parseNewAboutRules(html) {
  // It often uses the same widget; reuse the same parser.
  return parseNewRulesWidget(html);
}

/**
 * Parse old.reddit.com/r/{sub}/about/rules
 */
function parseOldRules(html) {
  const $ = cheerio.load(html);
  const out = [];
  // Typical structure: .content .rules list with h2 + .md
  $(".content .rules").each((_, ul) => {
    $(ul)
      .children("li")
      .each((i, li) => {
        const $li = $(li);
        const index = i + 1;
        const title = cleanText($li.find("h2").first().text());
        const $md = $li.find(".md").first();
        const $wrap = cheerio.load("<div/>")("div");
        $wrap.append($md.clone());
        absolutizeLinks($wrap, "https://old.reddit.com");
        const body_html = $wrap.html() || "";
        const body_text = cleanText($md.text() || "");
        if (title || body_text) out.push({ index, id: null, title, body_text, body_html });
      });
  });
  return out;
}

/**
 * Parse API JSON from /about/rules.json (no OAuth needed).
 */
function parseApiRules(json) {
  const rules = json?.rules || [];
  return rules.map((r, i) => ({
    index: (typeof r.priority === "number" ? r.priority : (i + 1)),
    id: r.short_name ? `api:${r.short_name}` : null,
    title: r.short_name || "",
    body_text: cleanText(r.description || ""),
    body_html: r.description_html || ""
  }));
}

// ------------ main ------------
async function verifySubExists(sub) {
  try {
    const about = await getJSON(`https://www.reddit.com/r/${sub}/about.json`);
    const d = about?.data;
    const exists =
      d && typeof d.subscribers === "number" && d.display_name_prefixed?.toLowerCase() === `r/${sub}`.toLowerCase();
    if (!exists) throw new Error("About response didn’t look like a real subreddit.");
    return {
      name: d.display_name_prefixed || `r/${sub}`,
      over18: !!d.over18,
      quarantine: !!d.quarantine,
      subscribers: d.subscribers || 0,
    };
  } catch (e) {
    if (e.status === 404) throw new Error(`Subreddit r/${sub} does not exist (404).`);
    throw e;
  }
}

async function scrape(subArg, outPath) {
  const sub = normSub(subArg);
  const about = await verifySubExists(sub);

  // Try modern home (widget on /r/sub)
  try {
    const html = await getHTML(`https://www.reddit.com/r/${sub}/`);
    const rules = parseNewRulesWidget(html);
    if (rules.length) {
      return { subreddit: `r/${sub}`, source: "new-home", about, count: rules.length, rules };
    }
  } catch (_) {}

  // Try modern about/rules
  try {
    const html = await getHTML(`https://www.reddit.com/r/${sub}/about/rules`);
    const rules = parseNewAboutRules(html);
    if (rules.length) {
      return { subreddit: `r/${sub}`, source: "new-about-rules", about, count: rules.length, rules };
    }
  } catch (_) {}

  // Try old reddit rules page
  try {
    const html = await getHTML(`https://old.reddit.com/r/${sub}/about/rules`);
    const rules = parseOldRules(html);
    if (rules.length) {
      return { subreddit: `r/${sub}`, source: "old-about-rules", about, count: rules.length, rules };
    }
  } catch (_) {}

  // Fallback: public JSON endpoint
  try {
    const json = await getJSON(`https://www.reddit.com/r/${sub}/about/rules.json`);
    const rules = parseApiRules(json);
    if (rules.length) {
      return { subreddit: `r/${sub}`, source: "api-json", about, count: rules.length, rules };
    }
  } catch (e) {
    // swallow, fail below
  }

  throw new Error(`Could not locate rules for r/${sub} via HTML or API.`);
}

// CLI
(async () => {
  try {
    const [,, subArgRaw, ...rest] = process.argv;
    if (!subArgRaw) {
      console.error("Usage: node scripts/scrape-rules.js <subreddit|r/subreddit> [--out=path.json]");
      process.exit(1);
    }
    const outFlag = rest.find(a => a.startsWith("--out="));
    const outPath = outFlag ? outFlag.slice("--out=".length) : null;

    const result = await scrape(subArgRaw, outPath);

    const payload = JSON.stringify(result, null, 2);
    if (outPath) {
      const abs = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
      await fs.writeFile(abs, payload, "utf8");
      console.log(`✓ Saved ${result.count} rules for ${result.subreddit} from [${result.source}] → ${abs}`);
    } else {
      console.log(payload);
    }
  } catch (e) {
    console.error("✗ Scrape failed:", e.message || e);
    process.exit(2);
  }
})();
