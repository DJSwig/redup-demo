// src/services/accountsService.js (ESM)
import { query } from "../lib/db.js";

/** Return the user's Reddit account row or null. */
export async function getRedditAccount(userId) {
  const rows = await query(
    `
    SELECT id, provider, account_id, username, display_name, avatar_url
    FROM oauth_accounts
    WHERE user_id = ? AND provider = 'reddit'
    LIMIT 1
    `,
    [userId]
  );
  return rows[0] || null;
}
// Generic single-account fetch
export async function getAccount(userId, provider) {
  const rows = await query(
    `
    SELECT provider, account_id, username, display_name, avatar_url
    FROM oauth_accounts
    WHERE user_id = ? AND provider = ?
    LIMIT 1
    `,
    [userId, provider]
  );
  return rows[0] || null;
}


export async function getDiscordAccount(userId) {
  return getAccount(userId, "discord");
}

/** Return all OAuth connections for the user (useful for a “Connections” page). */
export async function getConnections(userId) {
  return query(
    `
    SELECT provider, account_id, username, display_name, avatar_url
    FROM oauth_accounts
    WHERE user_id = ?
    ORDER BY provider ASC
    `,
    [userId]
  );
}
