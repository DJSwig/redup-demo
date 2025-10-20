import { Router } from "express";
import { enqueuePost, listUpcoming } from "../services/schedulerService.js";
const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const upcoming = await listUpcoming(25);
    res.render("pages/scheduler", { title: "Scheduler", upcoming });
  } catch (e) { next(e); }
});

router.post("/api/schedule", async (req, res, next) => {
  try {
    // expects { subreddit, title, body?, media_url?, whenUTC }
    const job = await enqueuePost(req.body);
    res.json({ ok: true, job });
  } catch (e) { next(e); }
});

export default router;
