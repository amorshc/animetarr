import express, { type Request, type Response, Router } from "express";

import { Season, Format, type AnichartMedia, GetTitle, SeriesData } from "../models";
import { GetSeasonMedia } from "../services/anichart";
import { matchSeriesTitle as matchSeriesByTitle, tvdbConfigured } from "../services/tvdb";
import { resolveExternalIds } from "../services/animeMapping";

export const schedule: Router = express.Router();

// Build a SeriesData straight from AniList data once we already know the tvdbId.
// AniList supplies the title, art, description and genres, so no TVDB call is
// needed for display -- TVDB is only a fallback for resolving the id itself.
function buildFromAniList(
  show: AnichartMedia,
  year: number,
  season: Season,
  tvdbId: number
): SeriesData {
  const title = GetTitle(show);
  let airdate: Date | undefined;
  const start = show.startDate;
  if (start?.year) {
    airdate = new Date(start.year, (start.month ?? 1) - 1, start.day ?? 1);
  }
  return new SeriesData({
    tvdbId,
    title,
    queryYear: year,
    originalTitle: show.title?.romaji ?? title,
    matchedQuery: title,
    status: show.status,
    season,
    description: (show.description ?? "").replace(/<[^>]+>/gm, ""),
    imageUrl: show.bannerImage ?? show.coverImage?.extraLarge ?? "",
    posterUrl: show.coverImage?.extraLarge ?? "",
    airdate,
    aliases: show.synonyms ?? [],
    tags: show.genres ?? [],
    data: show,
  });
}

// Resolve a single AniList show to SeriesData, or undefined if unresolvable.
// Order: free ID mapping (Fribb + ARM) -> TheTVDB title match (if configured).
async function resolveShow(
  show: AnichartMedia,
  year: number,
  season: Season
): Promise<SeriesData | undefined> {
  try {
    const ids = await resolveExternalIds(show.id);
    if (ids?.tvdbId) {
      const series = buildFromAniList(show, year, season, ids.tvdbId);
      if (!series.description) {
        series.description = "No description available on AniList, yet...";
      }
      return series;
    }

    // Fallback: TheTVDB title matching (only if a key is configured).
    if (tvdbConfigured) {
      const matched = await matchSeriesByTitle(
        GetTitle(show),
        undefined,
        year,
        season,
        show
      );
      if (matched) {
        matched.tags = show.genres;
        if (matched.description == undefined) {
          matched.description = show.description
            ? show.description.replace(/<[^>]+>/gm, "")
            : "No description available on theTVDB or AniList, yet...";
        }
        return matched;
      }
    }

    console.warn(
      "No tvdbId found (Fribb/ARM/TVDB all missed):",
      GetTitle(show),
      season,
      year
    );
    return undefined;
  } catch (err: any) {
    console.error(err.message);
    return undefined;
  }
}

schedule.get(
  "/:year/:season",
  async (req: Request<{ year: string; season: string }>, res: Response): Promise<void> => {
    const year = Number(req.params.year);
    const season = req.params.season.toUpperCase() as Season;

    if (!year || !season) {
      res.status(400).json({ error: "A valid year and season are required." });
      return;
    }

    try {
      // Get both TV and ONA formats from AniList.
      const tv = await GetSeasonMedia(year, season, Format.TV);
      const ona = await GetSeasonMedia(year, season, Format.ONA);
      const shows = [...tv, ...ona];

      const resolved = await Promise.all(
        shows.map((show) => resolveShow(show, year, season))
      );

      // De-dupe by tvdbId so multiple AniList entries (seasons/ONA) that map to
      // the same Sonarr series collapse into a single card. Prefer the entry
      // whose AniList season matches the season being viewed.
      const byTvdbId = new Map<number, SeriesData>();
      resolved.forEach((series, index) => {
        if (!series) return;
        const existing = byTvdbId.get(series.tvdbId);
        if (!existing) {
          byTvdbId.set(series.tvdbId, series);
          return;
        }
        const showSeason = (shows[index]?.season ?? "").toUpperCase();
        if (showSeason === season) {
          byTvdbId.set(series.tvdbId, series);
        }
      });

      res.json(Array.from(byTvdbId.values()));
    } catch (err) {
      console.error("Schedule lookup failed (AniList/TheTVDB):", err);
      res.status(502).json({ error: "Upstream schedule source is unreachable." });
    }
  }
);
