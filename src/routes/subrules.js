// src/routes/subrules.js
// Mount in your server: app.use(subrulesRouter);
import express from "express";
import authRequired from "../middlewares/authRequired.js";
import { getRedditAccount } from "../services/accountsService.js";

const router = express.Router();
const UA = "RedUpDemo/1.0 (rules-fetch)";

async function rget(path, token) {
  const resp = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA }
  });
  if (!resp.ok) throw new Error(`Reddit ${resp.status} ${resp.statusText}`);
  return resp.json();
}

router.get("/api/subreddits/:name/rules", authRequired, async (req, res) => {
  try {
    const sub = req.params.name.replace(/^r\//i, "");
    const acct = await getRedditAccount(req.user.id).catch(() => null);
    const token = acct?.accessToken;
    if (!token) throw new Error("Connect Reddit to view rules.");

    const [rules, reqs, flairs] = await Promise.all([
      rget(`/r/${sub}/about/rules`, token),
      rget(`/api/v1/${sub}/post_requirements`, token),
      rget(`/r/${sub}/api/link_flair_v2`, token).catch(() => [])
    ]);

    // 🔊 Server console logging
    /* eslint-disable no-console */
    console.groupCollapsed(`[rules] r/${sub}`);
    console.log("post_requirements", reqs);
    console.log("rules", rules?.rules);
    console.log("flairs", flairs);
    console.groupEnd();

    res.json({
      ok: true,
      data: {
        rules: rules?.rules || [],
        site_rules: rules?.site_rules || [],
        post_requirements: reqs || null,
        flairs: Array.isArray(flairs) ? flairs : []
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
