const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const path = require("path");

const app = express();
const PORT = 8001;

// --- View Engine Setup ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

// --- Middleware ---
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// --- ROUTES ---

// Home (Landing Page)
app.get("/", (req, res) => {
  res.render("index", { title: "Redup — Post Smarter. Rank Higher." });
});

// Analyzer Page
app.get("/analyzer", (req, res) => {
  res.render("analyzer", { title: "Analyzer — Redup" });
});

// Scheduler Page
app.get("/scheduler", (req, res) => {
  res.render("scheduler", { title: "Scheduler — Redup" });
});

// Analytics Page
app.get("/analytics", (req, res) => {
  res.render("analytics", { title: "Analytics — Redup" });
});

// Pricing Page
app.get("/pricing", (req, res) => {
  res.render("pricing", { title: "Pricing — Redup" });
});

// Dashboard Page (Standalone, no layout)
app.get("/dashboard", (req, res) => {
  // --- Mock demo data for templates ---
  const templates = [
    { id: 1, title: "Morning Motivation", subreddit: "r/GetDisciplined" },
    { id: 2, title: "Weekly Progress Update", subreddit: "r/Entrepreneur" },
    { id: 3, title: "Weekend Vibes", subreddit: "r/Funny" },
    { id: 4, title: "Product Launch Teaser", subreddit: "r/SideProject" }
  ];

  // --- Mock demo data for scheduled posts ---
  const demoPosts = [
    { id: 1, title: "Scaling Update", subreddit: "r/SideProject", day: "Mon", time: "10:00 AM" },
    { id: 2, title: "New Product Mockup", subreddit: "r/Design", day: "Wed", time: "2:00 PM" },
    { id: 3, title: "AMA with Founders", subreddit: "r/Entrepreneur", day: "Fri", time: "12:00 PM" },
    { id: 4, title: "Sunday Recap Thread", subreddit: "r/Productivity", day: "Sun", time: "8:00 PM" }
  ];

  res.render("dashboard", {
    title: "Dashboard — Redup",
    layout: false, // disable global layout for full-screen UI
    templates,
    demoPosts
  });
});

// --- TODO: Future Integrations ---
// TODO: Discord OAuth integration here
// TODO: Reddit API integration placeholder

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Redup running beautifully on http://localhost:${PORT}`);
});
