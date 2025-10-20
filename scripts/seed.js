import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
});

await conn.query(
  `INSERT INTO templates (workspace_id, name, title, body, media_url)
   VALUES (1,'Launch Post','We just shipped Redup!','Check it out','');`
);

await conn.query(
  `INSERT INTO scheduled_posts (workspace_id, subreddit, title, body, when_utc, status)
   VALUES
   (1,'r/startups','Show HN: Redup Demo','Feedback welcome', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY),'queued'),
   (1,'r/Design','Case Study: Scheduler UI','Screens + UX notes', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY),'queued');`
);

await conn.query(
  `INSERT INTO post_metrics (scheduled_id, reddit_id, upvotes, comments, rank)
   VALUES
   (1,'t3_demo1',120,34,4),
   (1,'t3_demo2',180,40,3),
   (2,'t3_demo3',95,22,9);`
);

await conn.end();
console.log("✓ Seeded a few rows.");
