// src/services/schedulerService.js
import { query } from "../lib/db.js";

// Small helper to sanitize a LIMIT value
function toPosInt(n, fallback = 20) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return fallback;
  // clamp to something reasonable
  return Math.min(Math.trunc(x), 500);
}

export async function enqueuePost(job) {
  const {
    workspace_id = 1,
    account_id = null,
    subreddit,
    title,
    body = null,
    media_url = null,
    whenUTC, // ISO string or 'YYYY-MM-DD HH:mm:ss'
  } = job;

  // Insert scheduled post
  const res = await query(
    `INSERT INTO scheduled_posts
     (workspace_id, account_id, subreddit, title, body, media_url, when_utc, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')`,
    [workspace_id, account_id, subreddit, title, body, media_url, whenUTC]
  );

  const id = res.insertId;

  // Seed a job record for your worker (optional)
  await query(
    `INSERT INTO jobs (scheduled_id, run_at, state, attempts)
     VALUES (?, ?, 'queued', 0)`,
    [id, whenUTC]
  );

  return { id, ...job, status: "queued" };
}

export async function listUpcoming(limit = 20) {
  const lim = toPosInt(limit, 20);

  // ⚠️ Don't bind LIMIT as a parameter; inline the validated integer.
  const sql = `
    SELECT id, subreddit, title, when_utc AS whenUTC, status
    FROM scheduled_posts
    WHERE when_utc >= UTC_TIMESTAMP()
    ORDER BY when_utc ASC
    LIMIT ${lim}
  `;
  return query(sql);
}
