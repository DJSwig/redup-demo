import { Router } from "express";
import { query } from "../lib/db.js";
const router = Router();

router.get("/", (req, res) =>
  res.render("pages/analytics", { title: "Analytics" })
);

router.get("/api/overview", async (_req, res, next) => {
  try {
    const [{ hits = 0 } = {}] = await query(
      `SELECT COUNT(*) AS hits FROM post_metrics WHERE rank <= 5`
    );
    const topSubs = await query(
      `SELECT subreddit, AVG(upvotes) AS avg_up, AVG(comments) AS avg_comments, COUNT(*) AS posts
       FROM scheduled_posts sp
       LEFT JOIN post_metrics pm ON pm.scheduled_id = sp.id
       GROUP BY subreddit
       ORDER BY avg_up DESC
       LIMIT 5`
    );
    const [{ rate = 0 } = {}] = await query(
      `SELECT COALESCE(AVG(CASE WHEN rank <= 5 THEN 1 ELSE 0 END),0) AS rate
       FROM post_metrics`
    );

    res.json({
      hitRate: Number(rate),
      topSubs,
      totals: { top5Hits: hits }
    });
  } catch (e) { next(e); }
});

export default router;
