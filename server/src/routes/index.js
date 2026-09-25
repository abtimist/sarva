const express = require("express");
const healthRoutes = require("./health");
const notesRoutes = require("./notes");
const sessionsRoutes = require("./sessions");
const { router: audioRoutes } = require("./audio");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/api/notes", notesRoutes);
router.get("/api/notes-all", (req, res, next) => {
  req.url = "/";
  notesRoutes(req, res, next);
});
router.use("/sessions", sessionsRoutes);
router.use("/audio-chunk", audioRoutes);

module.exports = router;
