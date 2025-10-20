const express = require("express");
const router = express.Router();

// Landing Page
router.get("/", (req, res) => {
  res.render("index", { title: "Redup — Post Smarter. Rank Higher." });
});

module.exports = router;
