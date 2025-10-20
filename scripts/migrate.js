// scripts/migrate.js
import "dotenv/config";
import mysql from "mysql2/promise";

const {
  DB_HOST, DB_PORT = 3306, DB_USER, DB_PASSWORD, DB_NAME
} = process.env;

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workspaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS memberships (
  user_id INT,
  workspace_id INT,
  role ENUM('owner','admin','editor','viewer') DEFAULT 'editor',
  PRIMARY KEY (user_id, workspace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  provider ENUM('reddit','discord') NOT NULL,
  account_id VARCHAR(255),
  access_token TEXT,
  refresh_token TEXT,
  expires_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT,
  name VARCHAR(255),
  title TEXT,
  body MEDIUMTEXT,
  media_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT,
  account_id INT,      -- oauth_accounts.id
  subreddit VARCHAR(255),
  title TEXT,
  body MEDIUMTEXT,
  media_url TEXT,
  when_utc DATETIME,
  status ENUM('queued','posting','posted','failed') DEFAULT 'queued'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scheduled_id INT,
  run_at DATETIME,
  state ENUM('queued','running','done','error','retry') DEFAULT 'queued',
  attempts INT DEFAULT 0,
  last_error TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS post_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scheduled_id INT,
  reddit_id VARCHAR(255),
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  upvotes INT,
  comments INT,
  rank INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT,
  name VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS campaign_posts (
  campaign_id INT,
  scheduled_id INT,
  PRIMARY KEY (campaign_id, scheduled_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function main() {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
  });
  await conn.query(schema);
  await conn.end();
  console.log("✓ MySQL schema ensured.");
}
main().catch((e) => { console.error(e); process.exit(1); });
