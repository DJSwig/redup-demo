// src/services/analyzerService.js
// Node 18+ (global fetch). Set OPENAI_API_KEY and optional OPENAI_MODEL in .env.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL   = process.env.OPENAI_MODEL || "gpt-4o-mini";
const UA             = "RedUpDemo/1.6 (analyzer)";

// ---------------- Utilities ----------------
function withTimeout(promise, ms = 180000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return Promise.race([
    promise.then((r) => { clearTimeout(t); return r; }),
    new Promise((_, rej) => {
      ctrl.signal.addEventListener("abort", () => rej(new Error("OpenAI request timed out")));
    })
  ]);
}

function normSub(n) { return `r/${String(n || "").replace(/^r\//i, "").toLowerCase()}`; }
function extractDomain(url = "") { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }
function uniqueSubs(list) {
  const seen = new Set();
  return list.filter(x => {
    const key = normSub(x.name);
    if (seen.has(key)) return false;
    seen.add(key);
    x.name = key;
    return true;
  });
}
function safeJSON(str) { try { return JSON.parse(str); } catch { return null; } }

// tokenization helpers
const STOP = new Set("the of a an and or for with your this that from into about over under how why what where when who whose our we you they them me my their his her its is to in on at by as it are was were be been being do did done have has had use using used can should would could will might may not no yes just really very more most less least new latest best worst big small help need".split(" "));
function tokenize(s = "") { return (s.toLowerCase().replace(/https?:\/\/\S+/g, " ").match(/[a-z0-9][a-z0-9\-]{2,}/g) || []).filter(w => !STOP.has(w)); }
function topKeywords(text, k = 8) {
  const words = tokenize(text);
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, k).map(([w]) => w);
}
function jaccard(aArr, bArr) {
  const A = new Set(aArr), B = new Set(bArr);
  const inter = [...A].filter(x => B.has(x)).length;
  const union = A.size + B.size - inter || 1;
  return inter / union;
}

// topic hints
const COOKING_TOKENS = new Set(["recipe","recipes","cook","cooking","bake","baking","saute","sauté","simmer","fry","airfry","air-fry","oven","preheat","ingredients","tbsp","tsp","grams","ml","marinate","roast","stir-fry","knife","pan","skillet","saucepan"]);
const DRINK_TOKENS   = new Set(["drink","drinks","drinking","alcohol","beer","wine","whiskey","bourbon","vodka","gin","rum","tequila","mezcal","cocktail","martini","negroni","spritz","lager","ipa","stout","bar","mixology","shaker","bitters","vermouth","liqueur"]);
function tokenHitRate(tokens, dictionary) {
  const arr = Array.isArray(tokens) ? tokens : tokenize(String(tokens || ""));
  if (!arr.length) return 0;
  let hits = 0;
  for (const w of arr) if (dictionary.has(w)) hits++;
  return hits / arr.length;
}

// Small sleep
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Generic JSON fetch with retries + UA
async function fetchJSON(url, { tries = 3, headers = {}, timeoutMs = 20000 } = {}) {
  const baseHeaders = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*"
  };
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeoutMs);
      const resp = await fetch(url, { headers: { ...baseHeaders, ...headers }, signal: ac.signal, redirect: "follow" });
      clearTimeout(t);
      const text = await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status} on ${url} :: ${text.slice(0,200)}`);
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`Non-JSON on ${url} :: ${text.slice(0,200)}`);
      }
    } catch (e) {
      lastErr = e;
      await wait(400 * (i + 1));
    }
  }
  throw lastErr || new Error(`fetchJSON failed: ${url}`);
}

// Generic TEXT fetch with UA
async function fetchText(url, { tries = 3, headers = {}, timeoutMs = 20000 } = {}) {
  const baseHeaders = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeoutMs);
      const resp = await fetch(url, { headers: { ...baseHeaders, ...headers }, signal: ac.signal, redirect: "follow" });
      clearTimeout(t);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} on ${url}`);
      return resp.text();
    } catch (e) {
      lastErr = e;
      await wait(300 * (i + 1));
    }
  }
  throw lastErr || new Error(`fetchText failed: ${url}`);
}

function stripHtml(html = "") {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

// ---------------- OpenAI ----------------
function buildPrompt(input) {
  const { title, content, link, goal, tone, audience, seedSubreddits, tz } = input;
  return [
    { role: "system", content: "You are Redup's Post Analyzer. Return strict JSON only. Be concrete and Reddit-savvy." },
    {
      role: "user",
      content:
`Analyze a proposed Reddit post and return structured recommendations.

INPUT:
- Title: ${title || "(none)"}
- Body: ${content || "(none)"}
- Link: ${link || "(none)"}
- Goal: ${goal}
- Tone: ${tone}
- Audience: ${audience || "(general)"}
- Seed subreddits: ${seedSubreddits?.length ? seedSubreddits.join(", ") : "(none)"}
- User timezone: ${tz}

OUTPUT JSON SHAPE:
{
  "seed_subreddits": ["r/example", "..."],
  "subreddit_recommendations": [
    { "name":"r/example", "reason":"why fit", "estimated_engagement":0-100, "flair_suggestion":"text|null", "rule_flags":["..."] }
  ],
  "discovered_subreddits": [
    { "name":"r/another", "reason":"why fit", "estimated_engagement":0-100 }
  ],
  "title_variants": [ {"title":"...", "tone":"matching", "why":"short"} ],
  "sentiment": {"score": -1..1, "label": "negative|neutral|positive", "reason":"..."},
  "virality_score": 0-100,
  "best_times": [ {"subreddit":"r/example","times_local":["Tue 10:00","Thu 14:00"], "confidence": 0-1} ],
  "formatting_tips": ["bullet", "..."],
  "compliance_checklist": [ {"item":"No clickbait", "ok": true, "note":""} ],
  "first_comment_suggestion": "one short high-signal comment"
}`
    }
  ];
}

async function callOpenAI(messages) {
  const body = { model: OPENAI_MODEL, messages, temperature: 0.35, response_format: { type: "json_object" } };
  const resp = await withTimeout(fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }), 90000);
  if (!resp.ok) throw new Error(`OpenAI error ${resp.status}: ${await resp.text().catch(()=>resp.statusText)}`);
  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content || "{}";
  const parsed = safeJSON(content);
  if (!parsed || typeof parsed !== "object") throw new Error("OpenAI returned non-JSON");
  return parsed;
}

// ---------------- Reddit helpers ----------------
async function rgetOauth(path, token) {
  const resp = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA, "Accept": "application/json" }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(()=> "");
    const err = new Error(`Reddit ${resp.status} ${resp.statusText}${text ? `: ${text}` : ""}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

async function fetchPublicAbout(sub) {
  const name = sub.replace(/^r\//i, "");
  const j = await fetchJSON(`https://www.reddit.com/r/${encodeURIComponent(name)}/about.json`, { tries: 3 }).catch(() => null);
  const d = j?.data || null;
  if (!d) return { name: normSub(name), over18: false, quarantine: false, subscribers: 0, title: "", public_description: "" };
  return {
    name: normSub(name),
    over18: !!d.over18,
    quarantine: !!d.quarantine,
    subscribers: Number(d.subscribers || 0),
    title: d.title || "",
    public_description: d.public_description || ""
  };
}

async function fetchPublicRules(sub) {
  const name = sub.replace(/^r\//i, "");
  const j = await fetchJSON(`https://www.reddit.com/r/${encodeURIComponent(name)}/about/rules.json`, { tries: 3 }).catch(() => null);
  const arr = Array.isArray(j?.rules) ? j.rules : [];
  return arr;
}

async function scrapeRulesFromHTML(sub) {
  const name = sub.replace(/^r\//i, "");
  const html = await fetchText(`https://www.reddit.com/r/${encodeURIComponent(name)}/`, { tries: 2 }).catch(() => null);
  if (!html) return [];
  const blocks = [];
  const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m;
  while ((m = h2Regex.exec(html))) {
    const rawTitle = stripHtml(m[1]);
    if (!rawTitle) continue;
    const rest = html.slice(h2Regex.lastIndex);
    const bodyMatch = rest.match(/<div[^>]*id="-post-rtjson-content"[^>]*>([\s\S]*?)<\/div>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : "";
    const bodyText = stripHtml(bodyHtml);
    blocks.push({ short_name: rawTitle, description: bodyText, description_html: bodyHtml });
  }
  return blocks;
}

// Strict validator
async function readAbout(sub, token) {
  const name = sub.replace(/^r\//i, "");
  if (token) {
    const j = await rgetOauth(`/r/${name}/about`, token).catch(() => null);
    return j?.data || null;
  }
  const about = await fetchPublicAbout(name).catch(() => null);
  return about || null;
}

async function readRules(sub, token) {
  const name = sub.replace(/^r\//i, "");
  if (token) {
    const j = await rgetOauth(`/r/${name}/about/rules`, token).catch(() => null);
    if (Array.isArray(j?.rules) && j.rules.length) return j.rules;
  }
  const pub = await fetchPublicRules(name).catch(() => null);
  if (Array.isArray(pub) && pub.length) return pub;
  const scraped = await scrapeRulesFromHTML(name).catch(() => []);
  return scraped || [];
}

async function readPostRequirements(sub, token) {
  const name = sub.replace(/^r\//i, "");
  if (!token) return null;
  return await rgetOauth(`/api/v1/${name}/post_requirements`, token).catch(() => null);
}

async function validateSubStrict(name, token) {
  try {
    const sub = name.replace(/^r\//i, "");
    const d = await readAbout(sub, token);
    if (!d) return null;
    const subs = d.subscribers || d.subscribers === 0 ? d.subscribers : 0;
    const ok =
      !d.quarantine &&
      d.subreddit_type !== "private" &&
      !d.user_is_banned &&
      (subs || 0) >= 5000 &&
      d.created_utc && (Date.now() / 1000 - d.created_utc) > 30 * 24 * 3600;
    if (!ok) return null;
    return {
      name: normSub(sub),
      subscribers: subs || 0,
      title: d.title || "",
      public_description: d.public_description || "",
      type: d.subreddit_type || "public",
      over18: !!d.over18
    };
  } catch {
    return null;
  }
}

// discovery (token only)
async function discoverSubreddits(input, token) {
  const seeds = new Set((input.seedSubreddits || []).map(normSub));
  const postText = `${input.title} ${input.content} ${input.audience}`;
  const kws = topKeywords(postText, 10);
  const raw = [];
  if (token) {
    for (const k of kws) {
      const json = await rgetOauth(`/subreddits/search?q=${encodeURIComponent(k)}&limit=20&include_over_18=false`, token).catch(()=>null);
      const children = json?.data?.children || [];
      for (const c of children) {
        const d = c?.data;
        if (!d) continue;
        const name = normSub(d.display_name_prefixed || d.display_name);
        if (seeds.has(name)) continue;
        raw.push(name);
      }
    }
  }
  const validated = (await Promise.all(uniqueSubs(raw.map(n => ({ name:n }))).map(v => validateSubStrict(v.name, token)))).filter(Boolean);
  const postTokens = tokenize(postText);
  const scored = validated.map(v => {
    const aboutTokens = tokenize(`${v.title} ${v.public_description}`);
    const fit = jaccard(postTokens, aboutTokens);
    const est = Math.min(92, Math.max(40, Math.round(Math.log10(Math.max(10000, v.subscribers)) * 18 + fit * 25)));
    return {
      name: v.name,
      reason: `Similar audience • ${Intl.NumberFormat().format(v.subscribers)} members`,
      estimated_engagement: est,
      confidence: Math.round(fit * 100) / 100
    };
  });
  return uniqueSubs(scored).sort((a,b) => (b.confidence - a.confidence) || (b.estimated_engagement - a.estimated_engagement)).slice(0, 12);
}

// ---------------- Console bundle logging ----------------
function logRulesBundle(sub, source, about, rules, reqs) {
  /* eslint-disable no-console */
  console.log(`📒 [SCRAPE RULES] ${normSub(sub)}  • source=${source} • count=${Array.isArray(rules)? rules.length : 0}`);
  console.log("about:");
  console.dir({
    name: normSub(about?.name || sub),
    over18: !!about?.over18,
    quarantine: !!about?.quarantine,
    subscribers: Number(about?.subscribers || 0)
  }, { depth: null });
  console.log("rules:");
  const simplified = (rules || []).map((r, i) => ({
    index: i,
    id: `rule:${r.short_name || r.violation_reason || i}`,
    title: r.short_name || r.violation_reason || `Rule ${i+1}`,
    body_text: r.description ? stripHtml(r.description) : "",
    body_html: r.description_html || r.description || ""
  }));
  console.dir(simplified, { depth: null });
  if (reqs) {
    console.log("post_requirements:");
    console.dir(reqs, { depth: null });
  }
}

// Try everything in order: OAuth -> public JSON -> HTML
async function fetchRulesBundle(sub, token) {
  const name = sub.replace(/^r\//i, "");

  // 1) OAuth
  if (token) {
    try {
      const [aboutJ, reqs, rulesJ] = await Promise.all([
        rgetOauth(`/r/${name}/about`, token),
        readPostRequirements(name, token),
        rgetOauth(`/r/${name}/about/rules`, token)
      ]);
      const about = {
        name: normSub(name),
        over18: !!aboutJ?.data?.over18,
        quarantine: !!aboutJ?.data?.quarantine,
        subscribers: Number(aboutJ?.data?.subscribers || 0),
        title: aboutJ?.data?.title || "",
        public_description: aboutJ?.data?.public_description || ""
      };
      const rules = rulesJ?.rules || [];
      logRulesBundle(name, "api-json", about, rules, reqs);
      return { about, post_requirements: reqs, rules };
    } catch (_) { /* fall through */ }
  }

  // 2) Public JSON
  try {
    const [about, rules] = await Promise.all([
      fetchPublicAbout(name),
      fetchPublicRules(name)
    ]);
    if (rules.length) {
      logRulesBundle(name, "public-json", about, rules, null);
      return { about, post_requirements: null, rules };
    }
  } catch (_) { /* fall through */ }

  // 3) HTML scrape
  try {
    const [about, rules] = await Promise.all([
      fetchPublicAbout(name),
      scrapeRulesFromHTML(name)
    ]);
    logRulesBundle(name, "html-scrape", about, rules, null);
    return { about, post_requirements: null, rules };
  } catch (e) {
    const about = await fetchPublicAbout(name).catch(() => ({ name: normSub(name), subscribers: 0 }));
    logRulesBundle(name, "unavailable", about, [], null);
    return { about, post_requirements: null, rules: [] };
  }
}

// ---------------- Compliance checks ----------------
function checkTitleReqs(title, reqs) {
  const issues = [];
  const t = title || "";
  if (!reqs) return issues;
  if (reqs.title_text_min_length && t.length < reqs.title_text_min_length) issues.push(`Title shorter than ${reqs.title_text_min_length}`);
  if (reqs.title_text_max_length && t.length > reqs.title_text_max_length) issues.push(`Title longer than ${reqs.title_text_max_length}`);
  const must = reqs.title_required_strings || [];
  if (Array.isArray(must) && must.length && !must.some(s => t.toLowerCase().includes(String(s).toLowerCase()))) {
    issues.push(`Title missing required keyword (${must.join(" | ")})`);
  }
  const banned = reqs.title_blacklisted_strings || [];
  if (Array.isArray(banned) && banned.length && banned.some(s => t.toLowerCase().includes(String(s).toLowerCase()))) {
    issues.push(`Title includes banned term (${banned.join(", ")})`);
  }
  return issues;
}
function checkBodyReqs(body, reqs) {
  const issues = [];
  const hasBody = !!(body && body.trim().length);
  if (!reqs) return issues;
  if (reqs.body_restriction_policy === "required" && !hasBody) issues.push("Body required");
  if (reqs.body_restriction_policy === "notAllowed" && hasBody) issues.push("Body not allowed");
  return issues;
}
function checkLinkReqs(link, reqs) {
  const issues = [];
  if (!reqs || !link) return issues;
  const host = extractDomain(link);
  const wl = reqs.domain_whitelist || [];
  const bl = reqs.domain_blacklist || [];
  if (Array.isArray(wl) && wl.length && !wl.some(d => host.endsWith(String(d).toLowerCase()))) issues.push(`Link domain not whitelisted (${host})`);
  if (Array.isArray(bl) && bl.length && bl.some(d => host.endsWith(String(d).toLowerCase()))) issues.push(`Link domain is blacklisted (${host})`);
  return issues;
}

// Rule heuristics -> per-rule evaluation
function evalRuleAgainstPost(rule, input, reqs) {
  const txt = `${(rule.short_name || "")} ${(rule.description || "")}`.toLowerCase();
  const postText = `${input.title} ${input.content}`.toLowerCase();
  const hasLink = !!(input.link && input.link.trim());
  const host = hasLink ? extractDomain(input.link) : "";

  let outcome = "info"; // ok | warn | fail | info
  let note = "";

  if (/link posts? only|links? only|link\s+posts/i.test(txt)) {
    if (!hasLink) { outcome = "fail"; note = "Sub allows link posts only, but your post has no link."; }
    else {
      const wl = reqs?.domain_whitelist || [];
      if (Array.isArray(wl) && wl.length && !wl.some(d => host.endsWith(String(d).toLowerCase()))) {
        outcome = "fail"; note = `Link host ${host} not on whitelist.`;
      } else { outcome = "ok"; note = "Has link and host appears allowed."; }
    }
  }

  if (/self.?promo|promotion|no\s+advertis|no\s+marketing|no\s+blog\s*spam|no\s+surveys/.test(txt)) {
    if (hasLink) { outcome = outcome === "fail" ? "fail" : "warn"; note = "Looks like self-promo; ensure your ratio and context meet the rules."; }
    else { outcome = outcome === "fail" ? "fail" : "ok"; if (!note) note = "Rule targets self-promotion; no link detected."; }
  }

  if (/nsfw|18\+/.test(txt)) {
    const hasNSFW = /\b(nsfw|18\+|onlyfans|porn|xxx|sexual|explicit)\b/.test(postText);
    if (hasNSFW) { outcome = "warn"; note = "Mark post NSFW and use NSFW flair if required."; }
    else { outcome = outcome === "fail" ? "fail" : "info"; if (!note) note = "Applies only to adult content."; }
  }

  if (/no comment links/i.test(txt)) {
    outcome = outcome === "fail" ? "fail" : "info";
    if (!note) note = "Do not drop links in comments unless explicitly allowed.";
  }

  if (/karma|account age|age limit|1 day|24 hours/.test(txt)) {
    outcome = outcome === "fail" ? "fail" : "info";
    if (!note) note = "Automod may remove if account/karma thresholds aren’t met.";
  }

  if (/no spam|no spamming|spam/.test(txt)) {
    outcome = outcome === "fail" ? "fail" : "info";
    if (!note) note = "Avoid frequent reposts; vary copy; respect cooldowns.";
  }

  return {
    id: rule.short_name || rule.violation_reason || `rule_${Math.random().toString(36).slice(2)}`,
    title: rule.short_name || rule.violation_reason || "Rule",
    description: rule.description || "",
    outcome,
    note
  };
}

function evaluateRulesForSub(rules = [], input, reqs) {
  return rules.map(r => evalRuleAgainstPost(r, input, reqs));
}

// Main compliance
async function complianceForSubreddit(input, sub, token) {
  try {
    const name = sub.replace(/^r\//i, "");
    const bundle = await fetchRulesBundle(name, token);

    const aboutText = `${bundle?.about?.title || ""} ${bundle?.about?.public_description || ""}`;
    const postTokens = tokenize(`${input.title} ${input.content}`);
    const looksCooking  = tokenHitRate(postTokens, COOKING_TOKENS) >= 0.06;
    const looksDrinking = tokenHitRate(postTokens, DRINK_TOKENS) >= 0.06;
    const aboutTokens = tokenize(aboutText);
    const fit = jaccard(postTokens, aboutTokens);

    const issues = [];
    if (!bundle.about) issues.push("Could not read subreddit about.json");
    if (aboutText.toLowerCase().includes("recipe") && looksDrinking && !looksCooking) {
      issues.push("Low topical fit: subreddit focuses on recipes; your post appears to be about drinks/alcohol");
    }
    if (fit < 0.08) issues.push(`Low topical overlap (${Math.round(fit * 100)}%)`);

    issues.push(...checkTitleReqs(input.title, bundle.post_requirements));
    issues.push(...checkBodyReqs(input.content, bundle.post_requirements));
    issues.push(...checkLinkReqs(input.link, bundle.post_requirements));

    const rules_eval = evaluateRulesForSub(bundle.rules, input, bundle.post_requirements);
    if (rules_eval.some(r => r.outcome === "fail")) {
      issues.push("One or more explicit community rules appear to be violated");
    }
    if (bundle.post_requirements?.is_flair_required) issues.push("Flair required at submission");

    const ok = issues.length === 0 && !rules_eval.some(r => r.outcome === "fail");
    const scoreBase = Math.max(0, 100 - issues.length * 12);
    const penalty = rules_eval.filter(r => r.outcome === "fail").length * 10 + rules_eval.filter(r => r.outcome === "warn").length * 4;
    const score = Math.max(0, scoreBase - penalty);

    return {
      ok,
      score,
      items: issues.length ? issues.map(i => ({ item: i, ok: false })) : [{ item: "All checks passed", ok: true }],
      rules: (bundle.rules || []).map((r, i) => ({
        index: i,
        id: r.short_name || r.violation_reason || `rule_${i}`,
        title: r.short_name || r.violation_reason || `Rule ${i+1}`,
        body_text: r.description ? stripHtml(r.description) : "",
        body_html: r.description_html || r.description || ""
      })),
      rules_eval,
      about: bundle.about || null,
      post_requirements: bundle.post_requirements || null
    };
  } catch (e) {
    return {
      ok: false,
      score: 0,
      items: [{ item: `Could not validate rules (${e.status || e.message || "ERR"})`, ok: false }],
      rules: [],
      rules_eval: [],
      about: null,
      post_requirements: null
    };
  }
}

// ---------------- Mock (no API key) ----------------
function mockAnalysis(input) {
  const baseline = 55;
  const lenBoost = Math.max(0, 20 - Math.abs((input.title || "").length - 68) / 3);
  const virality_score = Math.max(10, Math.min(95, Math.round(baseline + lenBoost)));
  const seed = normSub(input.seedSubreddits?.[0] || "r/SideProject");
  return {
    seed_subreddits: (input.seedSubreddits || []).map(normSub),
    subreddit_recommendations: [
      { name: seed, reason: "Closest to your topic based on seed input", estimated_engagement: 72, flair_suggestion: null, rule_flags:["Check self-promo limits"] }
    ],
    discovered_subreddits: [],
    title_variants: [
      { title: (input.title || "Your post") + " — what I learned building it", tone: input.tone, why: "adds curiosity + outcome" }
    ],
    sentiment: { score: 0.15, label: "positive", reason: "optimistic language" },
    virality_score,
    best_times: [ { subreddit: seed, times_local:["Tue 10:00","Thu 14:00"], confidence: 0.62 } ],
    formatting_tips: [
      "Front-load the hook in the first 150 characters",
      "Use short paragraphs (2–3 lines) and bullets"
    ],
    compliance_checklist: [{ item:"No clickbait", ok:true, note:"" }],
    first_comment_suggestion: "Happy to share templates or code if helpful—what part should I break down first?"
  };
}

// ---------------- Public entry ----------------
export async function analyzePost(input, redditAccessToken = null) {
  // Normalize seeds early
  input.seedSubreddits = (input.seedSubreddits || []).map(s => normSub(s));

  // Log seeds cleanly
  /* eslint-disable no-console */
  console.log("[Analyzer] Seed subreddits:");
  input.seedSubreddits.forEach((s, i) => console.log(`  ${i+1}. ${s}`));

  // Helper that adds discovery (if token) and ALWAYS runs compliance
  const composeOutput = async (base) => {
    let discovered = [];
    if (redditAccessToken) {
      discovered = await discoverSubreddits(input, redditAccessToken).catch(() => []);
      base.discovered_subreddits = discovered;
    } else {
      base.discovered_subreddits = base.discovered_subreddits || [];
    }

    const toCheck = (function() {
      const arr = [];
      for (const n of (input.seedSubreddits || [])) arr.push({ name: n });
      for (const r of (base.subreddit_recommendations || [])) arr.push({ name: r.name });
      for (const d of (discovered || [])) arr.push({ name: d.name });
      const seen = new Set();
      const out = [];
      for (const x of arr) {
        const k = normSub(x.name);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ name: k });
      }
      return out.slice(0, 20);
    })();

    console.log("Check list:", toCheck.map(s => s.name));

    const compliance_by_subreddit = {};
    const rules_by_subreddit = {};

    for (const s of toCheck) {
      const name = normSub(s.name);
      const comp = await complianceForSubreddit(input, name, redditAccessToken);
      compliance_by_subreddit[name] = comp;
      rules_by_subreddit[name] = comp.rules || [];
    }

    base.compliance_by_subreddit = compliance_by_subreddit;
    base.rules_by_subreddit = rules_by_subreddit;

    return base;
  };

  if (!OPENAI_API_KEY) {
    const mock = mockAnalysis(input);
    return await composeOutput(mock);
  }

  try {
    const ai = await callOpenAI(buildPrompt(input));
    const base = {
      seed_subreddits: (ai.seed_subreddits || input.seedSubreddits || []).map(normSub),
      subreddit_recommendations: (ai.subreddit_recommendations || []).map(x => ({ ...x, name: normSub(x.name) })),
      discovered_subreddits: (ai.discovered_subreddits || []).map(x => ({ ...x, name: normSub(x.name) })),
      title_variants: ai.title_variants || [],
      sentiment: ai.sentiment || { score: 0, label: "neutral", reason: "" },
      virality_score: typeof ai.virality_score === "number" ? ai.virality_score : 50,
      best_times: ai.best_times || [],
      formatting_tips: ai.formatting_tips || [],
      compliance_checklist: ai.compliance_checklist || [],
      first_comment_suggestion: ai.first_comment_suggestion || ""
    };
    return await composeOutput(base);
  } catch (e) {
    console.warn("Analyzer falling back (OpenAI failed):", e.message);
    const mock = mockAnalysis(input);
    return await composeOutput(mock);
  }
}
