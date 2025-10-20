// src/lib/auth/strategies.js
import passport from "passport";
import * as discordPkg from "passport-discord";
import * as redditPkg from "passport-reddit";
import * as authService from "../../services/authService.js"; // <- ESM-safe

// Strategy classes from CJS packages
const DiscordStrategy = discordPkg.Strategy;
const RedditStrategy  = redditPkg.Strategy;

// Map service functions with graceful fallbacks
const findUserById = authService.findUserById || authService.getUserById;

const _missing = (name) => async () => {
  throw new Error(`Missing authService.${name} — please export it from src/services/authService.js`);
};

const findOrCreateUserFromDiscord =
  authService.findOrCreateUserFromDiscord ||
  authService.upsertDiscordUser ||
  _missing("findOrCreateUserFromDiscord");

const findOrCreateUserFromReddit =
  authService.findOrCreateUserFromReddit ||
  authService.upsertRedditUser ||
  _missing("findOrCreateUserFromReddit");

function logEnabled(enabled) {
  const list = ["session", ...enabled];
  console.log("Auth strategies:", list.join(", "));
}

export function configureAuth(pass) {
  const p = pass || passport;
  const enabled = [];

  // ---- Sessions -------------------------------------------------------------
  p.serializeUser((user, done) => {
    try { done(null, user && user.id ? user.id : user); } catch (e) { done(e); }
  });

  p.deserializeUser(async (id, done) => {
    try {
      const u = findUserById ? await findUserById(id) : null;
      done(null, u || null);
    } catch (e) { done(e); }
  });

  // ---- Discord OAuth (optional) --------------------------------------------
  if (
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET &&
    process.env.DISCORD_CALLBACK_URL
  ) {
    p.use(
      new DiscordStrategy(
        {
          clientID: process.env.DISCORD_CLIENT_ID,
          clientSecret: process.env.DISCORD_CLIENT_SECRET,
          callbackURL: process.env.DISCORD_CALLBACK_URL,
          scope: ["identify", "email"],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const user = await findOrCreateUserFromDiscord(profile, { accessToken, refreshToken });
            return done(null, user);
          } catch (e) {
            return done(e);
          }
        }
      )
    );
    console.log("✓ Discord OAuth configured");
    enabled.push("discord");
  }

  // ---- Reddit OAuth (optional) ---------------------------------------------
  if (
    process.env.REDDIT_CLIENT_ID &&
    process.env.REDDIT_CLIENT_SECRET &&
    process.env.REDDIT_REDIRECT_URI
  ) {
    const redditScopes = (process.env.REDDIT_SCOPES || "identity")
      .split(/[,\s]+/)
      .filter(Boolean);

    const userAgent = process.env.REDDIT_USER_AGENT || "web:redup:0.1 (by /u/unknown)";

    const strategy = new RedditStrategy(
      {
        clientID: process.env.REDDIT_CLIENT_ID,
        clientSecret: process.env.REDDIT_CLIENT_SECRET,
        callbackURL: process.env.REDDIT_REDIRECT_URI,

        authorizationURL: "https://www.reddit.com/api/v1/authorize",
        tokenURL: "https://www.reddit.com/api/v1/access_token",

        scope: redditScopes,
        state: true,
        duration: "permanent",
        userAgent,

        // 👇 critical for linking to an existing logged-in user
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateUserFromReddit(profile, {
            accessToken,
            refreshToken,
            linkToUserId: req.user?.id || null, // link if already logged in (e.g., via Discord)
          });
          return done(null, user);
        } catch (e) {
          return done(e);
        }
      }
    );

    // Force proper User-Agent + quick diagnostics for token anomalies
    try {
      strategy._oauth2._customHeaders = strategy._oauth2._customHeaders || {};
      strategy._oauth2._customHeaders["User-Agent"] = userAgent;

      const _req = strategy._oauth2._request.bind(strategy._oauth2);
      strategy._oauth2._request = function (method, url, headers, body, accessToken, cb) {
        headers = headers || {};
        headers["User-Agent"] = userAgent;
        _req(method, url, headers, body, accessToken, (err, data, res) => {
          if (url.includes("/access_token") && (err || !data || String(data).trim() === "")) {
            const status = res && res.statusCode ? res.statusCode : "no-status";
            const snippet = data ? String(data).slice(0, 300) : "<empty>";
            console.error("Reddit token resp anomaly:", { status, snippet });
          }
          cb(err, data, res);
        });
      };
    } catch { /* best effort */ }

    p.use(strategy);
    console.log("✓ Reddit OAuth configured");
    enabled.push("reddit");
  }

  logEnabled(enabled);
}

export default configureAuth;
