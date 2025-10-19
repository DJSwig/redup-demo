const express = require("express");
const router = express.Router();

// TODO: replace mock data with DB later
router.get("/", (req, res) => {
  const demoPosts = [
    { id: 1, subreddit: "r/Entrepreneur", title: "Scaling update", time: "9:00 AM", day: "Mon" },
    { id: 2, subreddit: "r/SideProject", title: "New AI feature", time: "2:00 PM", day: "Tue" },
    { id: 3, subreddit: "r/Marketing", title: "Growth hacks", time: "10:30 AM", day: "Wed" },
  ];

  const templates = [
    { id: 4, subreddit: "r/Startup", title: "Launch recap" },
    { id: 5, subreddit: "r/SmallBusiness", title: "Tips for founders" },
    { id: 6, subreddit: "r/Productivity", title: "Weekly wins" },
  ];

  res.render("dashboard", { title: "Dashboard — Redup", demoPosts, templates });
});

module.exports = router;
