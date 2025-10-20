#!/usr/bin/env node
// tree.mjs — print a directory tree (text | json | markdown)
// Usage examples:
//   node tree.mjs
//   node tree.mjs --dir=/path/to/project --depth=3
//   node tree.mjs --ignore=node_modules,dist,.git --dirs-first --sizes --out=tree.txt
//   node tree.mjs --format=json --out=tree.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const cwd = process.cwd();

// --- Simple arg parser (no deps) ---
const argv = process.argv.slice(2);
const args = {};
for (const a of argv) {
  if (a.startsWith("--")) {
    const [k, v] = a.includes("=") ? a.slice(2).split("=") : [a.slice(2), "true"];
    args[k] = v;
  } else if (!args.dir) {
    args.dir = a; // allow bare path as first positional
  }
}

// --- Options with sane defaults ---
const ROOT = path.resolve(args.dir || cwd);
const MAX_DEPTH = isFinite(Number(args.depth)) ? Number(args.depth) : Infinity;
const FORMAT = (args.format || "text").toLowerCase(); // text | json | md
const OUT = args.out || null; // filepath
const SHOW_SIZES = args.sizes === "true" || args.sizes === true;
const DIRS_FIRST = args["dirs-first"] === "true" || args["dirs-first"] === true;
const INCLUDE_DOTFILES = args["include-dotfiles"] === "true" || args["include-dotfiles"] === true;

const DEFAULT_IGNORES = ["node_modules", ".git", "dist", "build", ".next", ".cache", ".DS_Store"];
const IGNORE = (args.ignore ? String(args.ignore).split(",") : DEFAULT_IGNORES).map(s => s.trim()).filter(Boolean);

// --- Helpers ---
const isHidden = (name) => name.startsWith(".");
const posixify = (p) => p.split(path.sep).join("/");
const humanSize = (bytes) => {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0, val = bytes;
  while (val >= 1024 && i < u.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

const shouldIgnore = (name, rel) => {
  if (!INCLUDE_DOTFILES && isHidden(name) && name !== ".gitignore") return true;
  // match by simple segment or prefix (no heavy globbing to keep deps zero)
  const relPosix = posixify(rel);
  return IGNORE.some(p => {
    if (!p) return false;
    const pat = p.replace(/\/+$/, ""); // strip trailing slash
    return name === pat || relPosix === pat || relPosix.startsWith(pat + "/");
  });
};

// --- Build an in-memory tree (optionally computing sizes) ---
async function buildTree(abs, rel = "", depth = 0) {
  const entryName = path.basename(abs);
  let stat;
  try {
    stat = await fs.promises.lstat(abs);
  } catch {
    return null;
  }

  const node = {
    name: entryName,
    path: rel || ".",
    type: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "dir" : "file",
  };

  if (node.type !== "dir") {
    if (SHOW_SIZES) node.size = stat.size;
    return node;
  }

  if (depth >= MAX_DEPTH) return node;

  let entries;
  try {
    entries = await fs.promises.readdir(abs, { withFileTypes: true });
  } catch {
    return node;
  }

  // Filter + map to child nodes
  const tasks = [];
  for (const d of entries) {
    const childName = d.name;
    const childRel = rel ? path.join(rel, childName) : childName;
    if (shouldIgnore(childName, childRel)) continue;
    const childAbs = path.join(abs, childName);
    tasks.push(buildTree(childAbs, childRel, depth + 1));
  }

  let children = (await Promise.all(tasks)).filter(Boolean);

  if (DIRS_FIRST) {
    children.sort((a, b) => (a.type === "dir") === (b.type === "dir") ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1);
  } else {
    children.sort((a, b) => a.name.localeCompare(b.name));
  }

  node.children = children;

  if (SHOW_SIZES) {
    // sum child sizes for directories
    const size = await dirSize(abs);
    node.size = size;
  }
  return node;
}

async function dirSize(abs) {
  let total = 0;
  let entries;
  try {
    entries = await fs.promises.readdir(abs, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const d of entries) {
    const p = path.join(abs, d.name);
    if (shouldIgnore(d.name, path.relative(ROOT, p))) continue;
    try {
      const s = await fs.promises.lstat(p);
      if (s.isDirectory()) total += await dirSize(p);
      else total += s.size;
    } catch {}
  }
  return total;
}

// --- Renderers ---
function renderText(node, prefix = "", isLast = true, isRoot = true) {
  const lines = [];
  const label = node.type === "dir" ? `${node.name}/` : node.name + (node.type === "symlink" ? " ↪" : "");
  const size = SHOW_SIZES && typeof node.size === "number" ? ` (${humanSize(node.size)})` : "";

  if (isRoot) {
    lines.push(`${label}${size}`);
  } else {
    lines.push(`${prefix}${isLast ? "└── " : "├── "}${label}${size}`);
  }

  if (node.children?.length) {
    const nextPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
    node.children.forEach((child, idx) => {
      const last = idx === node.children.length - 1;
      lines.push(...renderText(child, nextPrefix, last, false));
    });
  }
  return lines;
}

function renderMarkdown(node) {
  const text = "```\n" + renderText(node).join("\n") + "\n```";
  return text;
}

// --- Summary counts ---
function summarize(node, acc = { files: 0, dirs: 0 }) {
  if (node.type === "dir") acc.dirs++;
  else acc.files++;
  for (const c of node.children || []) summarize(c, acc);
  return acc;
}

// --- Main ---
(async function main() {
  try {
    const tree = await buildTree(ROOT, "", 0);
    if (!tree) throw new Error("Failed to build tree.");

    let output;
    if (FORMAT === "json") {
      output = JSON.stringify(tree, null, 2);
    } else if (FORMAT === "md" || FORMAT === "markdown") {
      output = renderMarkdown(tree);
    } else {
      output = renderText(tree).join("\n");
    }

    const { files, dirs } = summarize(tree);
    const header = `# ${path.basename(ROOT)} (${posixify(ROOT)})\n# ${dirs} dirs, ${files} files${SHOW_SIZES && typeof tree.size === "number" ? `, total ${humanSize(tree.size)}` : ""}\n`;

    const finalOut = FORMAT === "json" ? output : `${header}\n${output}\n`;

    if (OUT) {
      await fs.promises.writeFile(path.resolve(OUT), finalOut, "utf8");
      console.log(`✓ Wrote ${FORMAT.toUpperCase()} tree to: ${path.resolve(OUT)}`);
    } else {
      console.log(finalOut);
    }
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exit(1);
  }
})();
