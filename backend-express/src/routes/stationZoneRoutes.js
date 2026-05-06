const express = require("express");
const router = express.Router();

const {
  rebuildZones,
  getLatestZones,
} = require("../controllers/stationZoneController");

router.post("/rebuild", rebuildZones);
router.get("/latest", getLatestZones);

module.exports = router;