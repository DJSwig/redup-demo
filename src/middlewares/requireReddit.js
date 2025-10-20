// src/middlewares/requireReddit.js
import { getRedditAccount } from "../services/accountsService.js";

export default async function requireReddit(req, res, next) {
  try {
    if (!req.user) return res.redirect("/auth/login"); // belt & suspenders
    const acct = await getRedditAccount(req.user.id);
    if (!acct) {
      const nextUrl = encodeURIComponent(req.originalUrl || "/dashboard");
      return res.redirect(`/connect/reddit?next=${nextUrl}`);
    }
    req.reddit = acct;
    next();
  } catch (e) {
    next(e);
  }
}
