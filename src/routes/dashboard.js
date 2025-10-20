// src/routes/dashboard.js
import { Router } from "express";
import authRequired from "../middlewares/authRequired.js";
import { listUpcoming } from "../services/schedulerService.js";
import { query } from "../lib/db.js";
import { getRedditAccount, getDiscordAccount } from "../services/accountsService.js";

const router = Router();

// Run a query and gracefully handle missing tables
async function safeQuery(sql, params = [], fallback = []) {
  try {
    return await query(sql, params);
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE") return Array.isArray(fallback) ? fallback : [fallback];
    throw e;
  }
}

router.get("/", authRequired, async (req, res, next) => {
  try {
    // Connected accounts (for header chip/avatar)
    const [reddit, discord] = await Promise.all([
      getRedditAccount(req.user.id),
      getDiscordAccount(req.user.id),
    ]);

    // Optionally force Reddit connection on dashboard (set in .env)
    const REQ = String(process.env.REQUIRE_REDDIT_ON_DASHBOARD || "").toLowerCase();
    const mustConnect = REQ === "true" || REQ === "1";
    if (!reddit && mustConnect) {
      return res.redirect(`/connect/reddit?next=${encodeURIComponent("/dashboard")}`);
    }

    // Upcoming posts (don’t explode if table missing)
    let upcoming = [];
    try {
      upcoming = await listUpcoming(12);
    } catch (e) {
      if (e?.code !== "ER_NO_SUCH_TABLE") throw e;
      upcoming = [];
    }

    // Counts
    const [{ scheduled = 0 } = {}] = await safeQuery(
      `
      SELECT COUNT(*) AS scheduled
      FROM scheduled_posts
      WHERE when_utc >= UTC_TIMESTAMP()
      `,
      [],
      [{ scheduled: 0 }]
    );

    const [{ queued = 0 } = {}] = await safeQuery(
      `
      SELECT COUNT(*) AS queued
      FROM scheduled_posts
      WHERE status = 'queued'
      `,
      [],
      [{ queued: 0 }]
    );

    // Metrics (safe if table isn't created yet)
    const [{ rate = 0 } = {}] = await safeQuery(
      `
      SELECT COALESCE(AVG(CASE WHEN \`rank\` <= 5 THEN 1 ELSE 0 END), 0) AS rate
      FROM post_metrics
      `,
      [],
      [{ rate: 0 }]
    );

    const [{ up = 0 } = {}] = await safeQuery(
      `
      SELECT COALESCE(ROUND(AVG(upvotes)), 0) AS up
      FROM post_metrics
      WHERE captured_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
      `,
      [],
      [{ up: 0 }]
    );

    // Last 7 days mini chart (no CTE; works on older MySQL/MariaDB)
    const metrics =
      (await safeQuery(
        `
        SELECT
          DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL d DAY), '%a') AS label,
          COALESCE((
            SELECT ROUND(AVG(pm.upvotes))
            FROM post_metrics pm
            WHERE DATE(pm.captured_at) = DATE_SUB(CURDATE(), INTERVAL d DAY)
          ), 0) AS upvotes
        FROM (
          SELECT 6 AS d UNION ALL SELECT 5 UNION ALL SELECT 4 UNION ALL
          SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1 UNION ALL SELECT 0
        ) AS days
        ORDER BY d ASC
        `,
        [],
        []
      )) || [];

    res.render("pages/dashboard", {
      title: "Dashboard",
      user: req.user,
      reddit,                  // header chip / banner
      discord,                 // header avatar preference
      next: req.originalUrl,   // CTA return path for “Connect Reddit”
      stats: { scheduled, queued, hitRate: Number(rate), avgUpvotes: up },
      upcoming,
      metrics,
      active: "dashboard",
    });
  } catch (e) {
    next(e);
  }
});

export default router;
