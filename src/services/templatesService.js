// src/services/templatesService.js
import { query } from "../lib/db.js";

export async function listTemplatesForUser(user) {
  try {
    if (user?.workspace_id) {
      return await query(
        `SELECT id, workspace_id, name, title, body, media_url, created_at
         FROM templates
         WHERE workspace_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [user.workspace_id]
      );
    }
    // Fallback: latest few (demo)
    return await query(
      `SELECT id, workspace_id, name, title, body, media_url, created_at
       FROM templates
       ORDER BY created_at DESC
       LIMIT 25`
    );
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE") return [];
    throw e;
  }
}
