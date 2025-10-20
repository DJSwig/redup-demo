// server.js (root, ESM)
// - Loads env via dotenv
// - Views from src/views (with global express-ejs-layouts)
// - Static from src/public
// - Sessions + Passport (Discord ready; modular for more providers)
// - Auto-mount routes from src/routes (*.js ESM and *.cjs CJS)
// - Optional DB ping
import "./src/lib/web-compat.js";
import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs/promises";
import expressLayouts from "express-ejs-layouts";
import session from "express-session";
import passport from "passport";
import { configureAuth } from "./src/lib/auth/strategies.js";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Paths
const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, "src");
const VIEWS_DIR = path.join(SRC_DIR, "views");
const PUBLIC_DIR = path.join(SRC_DIR, "public");
const ROUTES_DIR = path.join(SRC_DIR, "routes");

const app = express();

// ---- Core
app.disable("x-powered-by");

// TRUST_PROXY: "1" (nginx) or "loopback", etc.
const TRUST_PROXY = process.env.TRUST_PROXY ?? "1";
app.set("trust proxy", /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);

app.set("view engine", "ejs");
app.set("views", VIEWS_DIR);
// allow absolute includes from /views, e.g. <%- include('/partials/_nav') %>
app.locals.basedir = VIEWS_DIR;

// Global layout via express-ejs-layouts
app.use(expressLayouts);
app.set("layout", "layouts/main"); // relative to VIEWS_DIR

// Body/static
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ---- Sessions & Passport (configure BEFORE routes)
const COOKIE_SECURE = String(process.env.COOKIE_SECURE).toLowerCase() === "true";
const SESSION_NAME = process.env.COOKIE_NAME || "redup.sid";
const MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS || 7);

app.use(
  session({
    name: SESSION_NAME,
    secret: process.env.SESSION_SECRET || "change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE, // true for HTTPS (staging/prod)
      maxAge: MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN || undefined, // e.g. .beatdeskapp.com
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Register strategies (Discord now; others later in ./src/lib/auth/strategies.js)
await configureAuth(passport);

// ---- Optional DB ping at boot (if lib exists)
try {
  const db = await import("./src/lib/db.js").catch(() => null);
  if (db?.ping) {
    await db.ping();
    console.log(`✓ DB connected (${db.DB_CLIENT || "unknown client"})`);
  }
} catch (e) {
  console.warn("! DB connection failed (non-fatal):", e?.message || e);
}

// ---- Route auto-loader
const requireCJS = createRequire(import.meta.url);

const likelyCommonJS = async (absPath) => {
  // Heuristic for .js files that still use CJS syntax
  try {
    const txt = await fs.readFile(absPath, "utf8");
    return /module\.exports|exports\.[A-Za-z_]|[^.\w]require\(/.test(txt);
  } catch {
    return false;
  }
};

const normalizeRouter = (mod) => {
  if (!mod) return null;
  if (typeof mod === "function") return mod; // CJS: module.exports = router
  if (mod.default && typeof mod.default === "function") return mod.default; // ESM default
  if (mod.router && typeof mod.router === "function") return mod.router; // named export
  return null;
};

const mountRoutes = async () => {
  let mountedIndex = false;

  try {
    const entries = await fs.readdir(ROUTES_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && /\.(c?js)$/.test(e.name))
      // mount index first, then alpha
      .map((e) => e.name)
      .sort((a, b) => (a.startsWith("index.") ? -1 : b.startsWith("index.") ? 1 : a.localeCompare(b)));

    for (const file of files) {
      const ext = path.extname(file); // .js or .cjs
      const base = file.replace(/\.(c?js)$/, "");
      const mountPath = base === "index" ? "/" : `/${base}`;
      const abs = path.join(ROUTES_DIR, file);

      try {
        let mod;
        if (ext === ".cjs") {
          // CommonJS file: safe to require under ESM entry
          mod = requireCJS(abs);
        } else {
          // .js file: should be ESM under "type":"module"
          if (await likelyCommonJS(abs)) {
            console.warn(
              `Route autoload warning: "${path.relative(
                ROOT,
                abs
              )}" looks like CommonJS, but ".js" is ESM under "type":"module". Rename to ".cjs" or convert to ESM. Skipping.`
            );
            continue;
          }
          mod = await import(`./src/routes/${file}`);
        }

        const router = normalizeRouter(mod);
        if (router) {
          app.use(mountPath, router);
          console.log(`→ mounted src/routes/${file} at ${mountPath}`);
          if (mountPath === "/") mountedIndex = true;
        } else {
          console.warn(`Route autoload warning: "${file}" did not export a router function.`);
        }
      } catch (err) {
        console.warn(`Route autoload error for "${file}": ${err?.message || err}`);
      }
    }
  } catch (e) {
    if (e?.code !== "ENOENT") console.warn("Route directory scan failed:", e?.message || e);
  }

  // Fallback homepage if no index route was mounted
  if (!mountedIndex) {
    app.get("/", (_req, res) => res.render("pages/index", { title: "Redup" }));
  }
};

await mountRoutes();

// ---- Health / Ready
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, name: "Redup", env: process.env.NODE_ENV, time: new Date().toISOString() })
);

// ---- 404
app.use((req, res) => res.status(404).render("pages/404", { url: req.originalUrl }));

// ---- Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).render("pages/500", {
    error: process.env.NODE_ENV === "development" ? err : {},
  });
});

// ---- Start
const PORT = Number(process.env.PORT || 8001);
app.listen(PORT, () => {
  console.log(`✓ Redup running on http://localhost:${PORT}`);
  if (process.env.BASE_URL) console.log(`✓ Public URL: ${process.env.BASE_URL}`);
});

export default app;
