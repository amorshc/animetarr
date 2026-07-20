import express from "express";

import { GetAllSeries, GetAllSeriesId, PostSeries } from "../services/sonarr";

export const series = express.Router();

// GET /series/ids
series.get("/ids", async (req, res) => {
  try {
    res.json(await GetAllSeriesId());
  } catch (err) {
    console.error("Sonarr unreachable:", err);
    res.status(502).json({ error: "Sonarr is unreachable." });
  }
});

// GET /series
series.get("/", async (req, res) => {
  try {
    res.json(await GetAllSeries());
  } catch (err) {
    console.error("Sonarr unreachable:", err);
    res.status(502).json({ error: "Sonarr is unreachable." });
  }
});

// POST /series
series.post("/", async (req, res) => {
  const newSeriesId = req.body.tvdbId;
  if (!newSeriesId) {
    res.status(400).json({ error: "A tvdbId is required." });
    return;
  }
  const newSeries = await PostSeries(newSeriesId);
  // PostSeries returns an empty object on failure; surface that to the client.
  if (!newSeries || Object.keys(newSeries).length === 0) {
    res.status(422).json({ error: "Unable to add series to Sonarr." });
    return;
  }
  res.json(newSeries);
});
