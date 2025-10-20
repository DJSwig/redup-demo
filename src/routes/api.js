// src/routes/api.js
import express from "express";
import authRequired from "../middlewares/authRequired.js";
import { getRedditAccount } from "../services/accountsService.js";
import { scrapeRules } from "../lib/scrapeRules.js";

const router = express.Router();
const UA = "RedUpDemo/1.2 (api-rules)";

async function rget(path, token) {
  const resp = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`Reddit ${resp.status} ${resp.statusText}${text ? `: ${text}` : ""}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

// ---- Dev gate for open scraper endpoints (no auth required)
const devOnly = (req, res, next) => {
  const open =
    process.env.NODE_ENV !== "production" ||
    String(process.env.ALLOW_OPEN_SCRAPER || "").toLowerCase() === "true";
  if (!open) return res.status(403).json({ ok: false, error: "Scraper disabled in production" });
  next();
};

// ========= OAuth rules endpoint (kept, requires login) =========
router.get("/subreddits/:name/rules", authRequired, async (req, res) => {
  try {
    const sub = req.params.name.replace(/^r\//i, "").trim();
    const acct = await getRedditAccount(req.user.id).catch(() => null);
    const token = acct?.accessToken;
    if (!token) throw new Error("Connect Reddit to view rules.");

    const [about, rules, reqs, flairs] = await Promise.all([
      rget(`/r/${sub}/about`, token),
      rget(`/r/${sub}/about/rules`, token),
      rget(`/api/v1/${sub}/post_requirements`, token).catch(() => null),
      rget(`/r/${sub}/api/link_flair_v2`, token).catch(() => []),
    ]);

    console.log(`\n===== [SERVER RULES DUMP — OAuth] r/${sub} =====`);
    console.log("ABOUT:"); console.dir(about, { depth: null });
    console.log("POST_REQUIREMENTS:"); console.dir(reqs, { depth: null });
    console.log("RULES:"); console.dir(rules, { depth: null });
    console.log("FLAIRS:"); console.dir(flairs, { depth: null });
    console.log("===== [END DUMP] =====\n");

    res.json({
      ok: true,
      data: {
        about: about?.data || null,
        rules: rules?.rules || [],
        site_rules: rules?.site_rules || [],
        post_requirements: reqs || null,
        flairs: Array.isArray(flairs) ? flairs : []
      }
    });
  } catch (e) {
    res.status(e.status === 404 ? 404 : 500).json({ ok: false, error: e.message });
  }
});

// ========= OPEN scraper endpoints (no auth; gated by devOnly) =========

// Single sub
router.get("/subreddits/:name/rules-scrape", devOnly, async (req, res) => {
  try {
    const result = await scrapeRules(req.params.name);
    console.log(`\n====================`);
    console.log(`📒 [SCRAPE RULES] ${result.subreddit}  • source=${result.source} • count=${result.count}`);
    console.log("about:"); console.dir(result.about, { depth: null });
    console.log("rules:"); console.dir(result.rules, { depth: null });
    console.log(`====================\n`);
    res.json({ ok: true, data: result });
  } catch (e) {
    console.log(`\n====================`);
    console.log(`📒 [SCRAPE RULES] r/${String(req.params.name).replace(/^r\//i,"")} • ERROR`);
    console.log(e.message || e);
    console.log(`====================\n`);
    res.status(e.status === 404 ? 404 : 500).json({ ok: false, error: e.message });
  }
});

// Many subs (comma-separated string or JSON array)
router.post("/rules/scrape", devOnly, async (req, res) => {
  try {
    const list = Array.isArray(req.body.subs)
      ? req.body.subs
      : String(req.body.subs || "").split(",").map(s => s.trim()).filter(Boolean);

    if (!list.length) return res.status(400).json({ ok: false, error: "Provide subs as array or comma-separated string." });

    const uniq = [...new Set(list.map(s => s.replace(/^r\//i, "")))];
    const results = {};

    for (const s of uniq) {
      try {
        const r = await scrapeRules(s);
        results[r.subreddit.toLowerCase()] = r;

        console.log(`\n====================`);
        console.log(`📒 [SCRAPE RULES] ${r.subreddit}  • source=${r.source} • count=${r.count}`);
        console.log("about:"); console.dir(r.about, { depth: null });
        console.log("rules:"); console.dir(r.rules, { depth: null });
        console.log(`====================\n`);
      } catch (err) {
        results[`r/${s}`.toLowerCase()] = { error: err.message || String(err) };
        console.log(`\n====================`);
        console.log(`📒 [SCRAPE RULES] r/${s} • ERROR`);
        console.log(err.message || err);
        console.log(`====================\n`);
      }
    }

    res.json({ ok: true, data: results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
