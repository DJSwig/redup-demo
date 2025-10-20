// src/lib/db.js
import "dotenv/config";
import mysql from "mysql2/promise";

export const DB_CLIENT = "mysql";
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

export async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
export async function ping() { await pool.query("SELECT 1"); }
export async function end() { await pool.end(); }
