// src/services/authService.js
import { query } from "../lib/db.js";

/* ----------------------------------------------------------------------------
 * OAuth account UPSERT (schema-flexible, no `updated_at`)
 * ---------------------------------------------------------------------------*/
async function upsertOAuthAccount({
  provider,
  accountId,
  userId,
  username = null,
  displayName = null,
  avatarUrl = null,
  accessToken = null,
  refreshToken = null,
}) {
  // Attempt 1: rich columns (username/display_name/avatar_url + tokens)
  try {
    await query(
      `
      INSERT INTO oauth_accounts
        (provider, account_id, user_id, username, display_name, avatar_url, access_token, refresh_token)
      VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        user_id=VALUES(user_id),
        username=VALUES(username),
        display_name=VALUES(display_name),
        avatar_url=VALUES(avatar_url),
        access_token=VALUES(access_token),
        refresh_token=VALUES(refresh_token)
      `,
      [
        provider,
        accountId,
        userId,
        username,
        displayName,
        avatarUrl,
        accessToken,
        refreshToken,
      ]
    );
    return;
  } catch (e) {
    if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
  }

  // Attempt 2: minimal with tokens only
  try {
    await query(
      `
      INSERT INTO oauth_accounts
        (provider, account_id, user_id, access_token, refresh_token)
      VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        user_id=VALUES(user_id),
        access_token=VALUES(access_token),
        refresh_token=VALUES(refresh_token)
      `,
      [provider, accountId, userId, accessToken, refreshToken]
    );
    return;
  } catch (e2) {
    if (e2?.code !== "ER_BAD_FIELD_ERROR") throw e2;
  }

  // Attempt 3: bare minimum (no token columns exist)
  await query(
    `
    INSERT INTO oauth_accounts (provider, account_id, user_id)
    VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)
    `,
    [provider, accountId, userId]
  );
}

/* ----------------------------------------------------------------------------
 * Users & lookups
 * ---------------------------------------------------------------------------*/
async function findUserRowById(id) {
  const rows = await query(`SELECT id, email, name FROM users WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findUserByOAuth(provider, accountId) {
  const rows = await query(
    `
    SELECT u.id, u.email, u.name
    FROM oauth_accounts oa
    JOIN users u ON u.id = oa.user_id
    WHERE oa.provider = ? AND oa.account_id = ?
    LIMIT 1
    `,
    [provider, accountId]
  );
  return rows[0] || null;
}

// Create a user with best-effort columns; fall back if some are missing
async function createUser({ name = null, email = null }) {
  // 1) name + email + created_at
  try {
    const res = await query(
      `INSERT INTO users (name, email, created_at) VALUES (?, ?, UTC_TIMESTAMP())`,
      [name, email]
    );
    return { id: res.insertId, name, email };
  } catch (e) {
    if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
  }
  // 2) name + email
  try {
    const res = await query(`INSERT INTO users (name, email) VALUES (?, ?)`, [name, email]);
    return { id: res.insertId, name, email };
  } catch (e2) {
    if (e2?.code !== "ER_BAD_FIELD_ERROR") throw e2;
  }
  // 3) name only
  try {
    const res = await query(`INSERT INTO users (name) VALUES (?)`, [name]);
    return { id: res.insertId, name, email: null };
  } catch (e3) {
    if (e3?.code !== "ER_BAD_FIELD_ERROR") throw e3;
  }
  // 4) bare insert
  const res = await query(`INSERT INTO users () VALUES ()`);
  return { id: res.insertId, name: null, email: null };
}

/* ----------------------------------------------------------------------------
 * Exports (used by strategies.js)
 * ---------------------------------------------------------------------------*/
export async function findUserById(id) {
  return findUserRowById(id);
}

/** Discord: upsert user + oauth account, then return user row. */
export async function findOrCreateUserFromDiscord(profile, tokens = {}) {
  const accountId   = String(profile?.id || "");
  const username    = profile?.username || null;
  const displayName = profile?.global_name || profile?.displayName || username || null;
  const email       =
    (Array.isArray(profile?.emails) && profile.emails[0]?.value) ? profile.emails[0].value :
    profile?.email || null;
  const avatarUrl   =
    profile?.avatarURL ||
    (profile?.id && profile?.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : null);

  if (!accountId) throw new Error("Discord profile missing id");

  const existing = await findUserByOAuth("discord", accountId);
  if (existing) {
    await upsertOAuthAccount({
      provider: "discord",
      accountId,
      userId: existing.id,
      username,
      displayName,
      avatarUrl,
      accessToken: tokens.accessToken || null,
      refreshToken: tokens.refreshToken || null,
    });
    return existing;
  }

  const user = await createUser({ name: displayName || username, email });
  await upsertOAuthAccount({
    provider: "discord",
    accountId,
    userId: user.id,
    username,
    displayName,
    avatarUrl,
    accessToken: tokens.accessToken || null,
    refreshToken: tokens.refreshToken || null,
  });
  return await findUserRowById(user.id);
}

/** Reddit: link-aware; if `linkToUserId` is provided, attach to that user. */
export async function findOrCreateUserFromReddit(profile, tokens = {}) {
  const accountId   = String(profile?.id || profile?.name || "");
  const username    = profile?.name || profile?.username || profile?.id || null;
  const displayName = profile?.displayName || username || null;
  const email       = null; // Reddit doesn't provide email under standard scopes
  const avatarUrl   = profile?._json?.icon_img || profile?.photos?.[0]?.value || null;

  if (!accountId) throw new Error("Reddit profile missing id/name");

  const linkToUserId = tokens.linkToUserId || null;

  if (linkToUserId) {
    // If already linked to someone else, block hijack
    const already = await findUserByOAuth("reddit", accountId);
    if (already && already.id !== linkToUserId) {
      throw new Error("This Reddit account is already linked to a different Redup user.");
    }
    await upsertOAuthAccount({
      provider: "reddit",
      accountId,
      userId: linkToUserId,
      username,
      displayName,
      avatarUrl,
      accessToken: tokens.accessToken || null,
      refreshToken: tokens.refreshToken || null,
    });
    return await findUserRowById(linkToUserId);
  }

  // Regular sign-in/up via Reddit
  const existing = await findUserByOAuth("reddit", accountId);
  if (existing) {
    await upsertOAuthAccount({
      provider: "reddit",
      accountId,
      userId: existing.id,
      username,
      displayName,
      avatarUrl,
      accessToken: tokens.accessToken || null,
      refreshToken: tokens.refreshToken || null,
    });
    return existing;
  }

  const user = await createUser({ name: displayName || username, email });
  await upsertOAuthAccount({
    provider: "reddit",
    accountId,
    userId: user.id,
    username,
    displayName,
    avatarUrl,
    accessToken: tokens.accessToken || null,
    refreshToken: tokens.refreshToken || null,
  });
  return await findUserRowById(user.id);
}

/* Optional aliases for compatibility */
export const upsertDiscordUser = findOrCreateUserFromDiscord;
export const upsertRedditUser  = findOrCreateUserFromReddit;
