const express = require("express");
const { getStudentCount } = require("../socket");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    ok: true,
    students: getStudentCount(),
    uptime: process.uptime(),
  });
});

module.exports = router;
