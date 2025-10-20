// utils/rules-eval.js
import { deriveRuleFlags } from "./rules-derive.js";

export function evaluatePostAgainst(scraped, { title, content, link, nsfwFlag = false, lastPostedHoursAgo = null }) {
  const flags = deriveRuleFlags(scraped);
  const hard_fails = [];
  const soft_warns = [];

  const hasLink = !!link;
  const linkHost = (() => {
    try { return hasLink ? new URL(link).hostname.replace(/^www\./, "").toLowerCase() : ""; }
    catch { return ""; }
  })();

  // Hard checks
  if (flags.linkOnly && !hasLink) {
    hard_fails.push("Subreddit only allows **link posts**, but your draft has no external link.");
  }
  if (flags.requiresDiscordGG && linkHost && linkHost !== "discord.gg") {
    hard_fails.push('Only **discord.gg** links are accepted for this subreddit.');
  }
  if (flags.nsfw && !nsfwFlag) {
    soft_warns.push("Mark the post **NSFW** if your server/content is 18+.");
  }
  if (flags.noTradeSell && /sell|trade|buy|for sale/i.test(`${title} ${content}`)) {
    hard_fails.push("Trading/selling is not allowed here.");
  }
  if (flags.noCommentLinks && /comment/i.test(content)) {
    soft_warns.push("This sub discourages sharing links in comments; include the link in the post if needed.");
  }

  // Soft checks
  if (flags.detailed) {
    const words = (content || "").trim().split(/\s+/).filter(Boolean).length;
    if (words < 20) soft_warns.push("They expect **detail** in title/body. Add a short value proposition (why join?).");
  }
  if (flags.noSpam && typeof lastPostedHoursAgo === "number" && lastPostedHoursAgo < flags.cooldownHours) {
    soft_warns.push(`Posting cooldown is ${flags.cooldownHours}h; you posted ${lastPostedHoursAgo}h ago.`);
  }
  if (flags.minKarma) {
    soft_warns.push(`Requires ~${flags.minKarma}+ **post karma** (cannot auto-verify from here).`);
  }
  if (flags.minAgeHours) {
    soft_warns.push(`Requires account age ~${flags.minAgeHours}h (cannot auto-verify from here).`);
  }

  return {
    ok: hard_fails.length === 0,
    hard_fails,
    soft_warns,
    flags
  };
}
