import { Router } from "express";
import authRequired from "../middlewares/authRequired.js";
import { getRedditAccount } from "../services/accountsService.js";

const router = Router();

router.get("/reddit", authRequired, async (req, res, next) => {
  try {
    const reddit = await getRedditAccount(req.user.id);
    const nextUrl = req.query.next || "/dashboard";
    res.render("pages/connect", {
      title: reddit ? "Reddit Connected" : "Connect Reddit",
      user: req.user,
      reddit,
      next: nextUrl,
      active: "settings",
    });
  } catch (e) { next(e); }
});

export default router;
