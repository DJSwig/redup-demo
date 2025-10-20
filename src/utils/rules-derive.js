// utils/rules-derive.js
export function deriveRuleFlags({ rules }) {
  const text = (s="") => s.toLowerCase();

  const has = (needle) =>
    rules.some(r => text(r.title).includes(needle) || text(r.body_text).includes(needle));

  const contains = (pred) =>
    rules.some(r => pred(text(r.title)) || pred(text(r.body_text)));

  const linkOnly = has("link posts only");
  const requiresDiscordGG = contains(t => t.includes("discord.gg"));

  const nsfw = has("nsfw");
  const detailed = has("detailed posts");

  const noSpam = has("no spamming") || contains(t => t.includes("every 24 hours"));
  const cooldownHours = 24;

  const noTradeSell = contains(t => t.includes("trading/") || t.includes("trading") || t.includes("selling"));
  const noCommentLinks = has("no comment links");

  // Karma / account age: extract numbers if present
  let minKarma = null, minAgeHours = null;
  rules.forEach(r => {
    const t = `${r.title} ${r.body_text}`.toLowerCase();
    const km = t.match(/(\d+)\s*(?:post\s*)?karma/);
    if (km) minKarma = Number(km[1]);
    const age = t.match(/(\d+)\s*(?:hours?|day)/);
    if (age) {
      const n = Number(age[1]);
      minAgeHours = t.includes("day") ? n * 24 : n;
    }
  });

  return {
    linkOnly,
    requiresDiscordGG,
    nsfw,
    detailed,
    noSpam,
    cooldownHours,
    noTradeSell,
    noCommentLinks,
    minKarma,
    minAgeHours
  };
}
