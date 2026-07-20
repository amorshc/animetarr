import express, { type Request, type Response, Router } from "express";

import { Season, Format, type AnichartMedia, GetTitle } from "../models";
import { GetSeasonMedia } from "../services/anichart";
import { GetAllMovieIds, PostMovie, radarrConfigured } from "../services/radarr";

export const movies: Router = express.Router();

// GET /movies/configured -> lets the UI decide whether to show Radarr controls.
movies.get("/configured", (_req, res) => {
  res.json({ configured: radarrConfigured });
});

// GET /movies/ids -> TMDB ids already tracked in Radarr.
movies.get("/ids", async (_req, res) => {
  try {
    res.json(await GetAllMovieIds());
  } catch (err) {
    console.error(err); // Non-fatal: Radarr may simply be unconfigured.
    res.json([]);
  }
});

// GET /movies/schedule/:year/:season -> anime MOVIE releases for a season.
// Movies are matched at add-time via Radarr (TMDB), so this does not use the
// TVDB series matcher that the /schedule route relies on.
movies.get(
  "/schedule/:year/:season",
  async (req: Request<{ year: string; season: string }>, res: Response): Promise<void> => {
    const year = Number(req.params.year);
    const season = req.params.season.toUpperCase() as Season;
    if (!year || !season) {
      res.status(400).json({ error: "A valid year and season are required." });
      return;
    }

    const films = await GetSeasonMedia(year, season, Format.MOVIE);
    const cleaned = films.map((show: AnichartMedia) => ({
      anilistId: show.id,
      title: GetTitle(show),
      originalTitle: show.title?.romaji ?? GetTitle(show),
      description: (show.description ?? "").replace(/<[^>]+>/gm, ""),
      posterUrl: show.coverImage?.extraLarge ?? "",
      status: show.status,
      queryYear: year,
      tags: show.genres ?? [],
    }));
    res.json(cleaned);
  }
);

// POST /movies -> add a movie to Radarr (and search). Body: { tmdbId?, title? }
movies.post("/", async (req, res) => {
  const rawTmdbId = req.body?.tmdbId;
  const title = req.body?.title;
  // Coerce tmdbId to a number so it can never inject into the lookup URL.
  const tmdbId = rawTmdbId != null ? Number(rawTmdbId) : undefined;

  if ((tmdbId == null || Number.isNaN(tmdbId)) && !title) {
    res.status(400).json({ error: "Provide a numeric tmdbId or a title." });
    return;
  }
  try {
    const added = await PostMovie({ tmdbId, term: title });
    if ((added as { errorMessage?: string }).errorMessage) {
      res.status(422).json(added);
      return;
    }
    res.json(added);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add movie to Radarr." });
  }
});
