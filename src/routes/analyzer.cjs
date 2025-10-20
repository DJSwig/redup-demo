// src/routes/analyzer.cjs
const { Router } = require("express");
const router = Router();

let READY = false;
let initError = null;

router.get("/_diag", (_req, res) => {
  if (!initError) return res.json({ ok: READY, msg: READY ? "ready" : "warming" });
  return res.status(500).json({
    ok: false,
    name: initError.name,
    message: initError.message,
    stack: initError.stack,
  });
});

router.use((req, res, next) => {
  if (READY) return next();
  if (initError) {
    console.error("[analyzer] init failed:", initError);
    return res.status(500).send("Analyzer route failed to initialize. See /analyzer/_diag");
  }
  return res.status(503).send("Analyzer is warming up. Please retry.");
});

(async () => {
  async function importOne(label, path) {
    try {
      const mod = await import(path);
      console.log(`[analyzer] import ok: ${label} <- ${path}`);
      return mod;
    } catch (e) {
      console.error(`[analyzer] import FAILED: ${label} <- ${path}`);
      console.error(e && e.stack ? e.stack : e);
      throw Object.assign(new Error(`${label} import failed: ${e.message || e}`), { cause: e });
    }
  }

  const authRequiredMod    = await importOne("authRequired",    "../middlewares/authRequired.js");
  const analyzerServiceMod = await importOne("analyzerService", "../services/analyzerService.js");
  const accountsServiceMod = await importOne("accountsService", "../services/accountsService.js");

  const authRequired = authRequiredMod.default || authRequiredMod;
  const { analyzePost } = analyzerServiceMod;
  const { getRedditAccount, getDiscordAccount } = accountsServiceMod;

  async function loadTemplatesFor(user) {
    try {
      const mod = await import("../services/templatesService.js").catch(() => null);
      if (mod?.listTemplatesForUser) {
        const rows = await mod.listTemplatesForUser(user);
        return Array.isArray(rows) ? rows : [];
      }
    } catch {}
    return [];
  }

  router.get("/", authRequired, async (req, res, next) => {
    try {
      const [reddit, discord, templates] = await Promise.all([
        getRedditAccount(req.user.id).catch(() => null),
        getDiscordAccount(req.user.id).catch(() => null),
        loadTemplatesFor(req.user),
      ]);
      return res.render("pages/analyzer", {
        title: "Post Analyzer",
        user: req.user,
        reddit,
        discord,
        templates,
        active: "analyzer",
        next: req.originalUrl,
      });
    } catch (e) { return next(e); }
  });

  router.post("/", authRequired, async (req, res) => {
    try {
      const seedSubreddits = String(req.body.subreddits || "")
        .split(",").map(s => s.trim()).filter(Boolean).slice(0, 25);

      const input = {
        title: String(req.body.title || "").trim().slice(0, 300),
        content: String(req.body.content || "").trim().slice(0, 10000),
        link: String(req.body.link || "").trim().slice(0, 2048),
        goal: String(req.body.goal || "discussion").trim(),
        tone: String(req.body.tone || "friendly").trim(),
        audience: String(req.body.audience || "").trim().slice(0, 500),
        seedSubreddits,
        tz: process.env.SCHEDULER_TZ || "America/Detroit",
      };

      if (!input.title) return res.status(400).json({ ok: false, error: "Title is required." });

      if (seedSubreddits.length) {
        console.log("\n[Analyzer] Seed subreddits:");
        seedSubreddits.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
        console.log("");
      }

      const reddit = await getRedditAccount(req.user.id).catch(() => null);
      const redditAccessToken = reddit?.accessToken || null;

      const result = await analyzePost(input, redditAccessToken);
      return res.json({ ok: true, data: result });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: e?.message || "Analyzer failed" });
    }
  });

  READY = true;
  console.log("→ analyzer.cjs initialized");
})().catch((e) => {
  initError = e;
  console.error("[analyzer] dynamic import init error:", e?.message || e);
});

module.exports = router;
