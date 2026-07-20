import express from "express";

import {
  GetAllSeries,
  GetAllSeriesId,
  GetQualityProfiles,
  GetRootFolders,
  PostSeries,
} from "../services/sonarr";

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

// GET /series/profiles -> Sonarr quality profiles (for setup dropdown).
series.get("/profiles", async (req, res) => {
  try {
    res.json(await GetQualityProfiles());
  } catch (err) {
    console.error("Sonarr unreachable:", err);
    res.status(502).json({ error: "Sonarr is unreachable." });
  }
});

// GET /series/rootfolders -> Sonarr root folders (for setup dropdown).
series.get("/rootfolders", async (req, res) => {
  try {
    res.json(await GetRootFolders());
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
  const qualityProfileId =
    req.body.qualityProfileId != null ? Number(req.body.qualityProfileId) : undefined;
  const rootFolderPath = req.body.rootFolderPath || undefined;
  const newSeries = await PostSeries(newSeriesId, { qualityProfileId, rootFolderPath });
  // PostSeries returns an empty object on failure; surface that to the client.
  if (!newSeries || Object.keys(newSeries).length === 0) {
    res.status(422).json({ error: "Unable to add series to Sonarr." });
    return;
  }
  res.json(newSeries);
});
