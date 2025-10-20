import { Router } from "express";
import mysql from "mysql2/promise";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    const [rows] = await conn.query("SELECT 1+1 AS two");
    await conn.end();
    res.json({ ok: true, rows });
  } catch (e) { next(e); }
});

export default router;
