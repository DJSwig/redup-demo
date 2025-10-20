// src/routes/auth.js
import { Router } from "express";
import passport from "passport";
import authRequired from "../middlewares/authRequired.js";
import { query } from "../lib/db.js";
import { getRedditAccount } from "../services/accountsService.js";

const router = Router();

function hasStrategy(name) {
  return passport && passport._strategies && passport._strategies[name];
}

/* ---------------------------
 * Discord
 * --------------------------- */
router.get("/discord", (req, res, next) => {
  if (!hasStrategy("discord")) return res.status(500).send("Discord OAuth not configured.");
  if (req.query.next) req.session.oauthNext = req.query.next; // preserve return path
  passport.authenticate("discord")(req, res, next);
});

router.get(
  "/discord/callback",
  passport.authenticate("discord", { failureRedirect: "/login?err=discord" }),
  async (req, res, next) => {
    try {
      const to = req.session.oauthNext || "/dashboard";
      delete req.session.oauthNext;

      // If no Reddit connected yet, force the connect flow
      const reddit = await getRedditAccount(req.user.id);
      if (!reddit) return res.redirect(`/connect/reddit?next=${encodeURIComponent(to)}`);

      res.redirect(to);
    } catch (e) {
      next(e);
    }
  }
);

/* ---------------------------
 * Reddit
 * --------------------------- */
router.get("/reddit", (req, res, next) => {
  if (!hasStrategy("reddit")) return res.status(500).send("Reddit OAuth not configured.");
  if (req.query.next) req.session.oauthNext = req.query.next; // preserve return path
  passport.authenticate("reddit")(req, res, next);
});

router.get(
  "/reddit/callback",
  passport.authenticate("reddit", { failureRedirect: "/connect/reddit?err=1" }),
  (req, res) => {
    const to = req.session.oauthNext || "/dashboard";
    delete req.session.oauthNext;
    res.redirect(to);
  }
);

// Optional: disconnect Reddit linkage
router.post("/reddit/disconnect", authRequired, async (req, res, next) => {
  try {
    await query(
      `DELETE FROM oauth_accounts WHERE user_id = ? AND provider = 'reddit' LIMIT 1`,
      [req.user.id]
    );
    res.redirect("/connect/reddit");
  } catch (e) {
    next(e);
  }
});

/* ---------------------------
 * Placeholders (Google / Email)
 * --------------------------- */
router.get("/google", (_req, res) =>
  res.redirect("/login?provider=google&coming_soon=1")
);

router.post("/email/start", (req, res) => {
  const email = (req.body?.email || "").trim();
  res.redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
});

/* ---------------------------
 * Session helpers
 * --------------------------- */
router.post("/logout", (req, res, next) =>
  req.logout?.((err) => (err ? next(err) : res.redirect("/")))
);
router.get("/logout", (req, res, next) =>
  req.logout?.((err) => (err ? next(err) : res.redirect("/")))
);

router.get("/me", (req, res) =>
  res.json({ ok: !!req.user, user: req.user || null })
);

export default router;
