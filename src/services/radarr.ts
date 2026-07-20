import fetch, { Headers } from "node-fetch";

/**
 * Radarr integration.
 *
 * Radarr (like Sonarr) owns the download-client relationship. Adding a movie
 * with monitored + minimumAvailability "released" + addOptions.searchForMovie
 * makes Radarr search its indexers immediately and, if a release is already out,
 * hand the grab to whatever download client is configured (SABnzbd / NZBGet /
 * torrent). Animetarr does not talk to those clients directly.
 *
 * Radarr is optional: if the env vars are unset the app runs Sonarr-only.
 */

const baseUrl = process.env.RADARR_API_BASE_URL;
const apiKey = process.env.RADARR_API_KEY;

export const radarrConfigured = Boolean(baseUrl && apiKey);

function assertConfigured(): void {
  if (!baseUrl || !apiKey) {
    throw new Error("Radarr is not configured (RADARR_API_BASE_URL / RADARR_API_KEY).");
  }
}

const headers = new Headers([
  ["X-API-Key", apiKey ?? ""],
  ["Content-Type", "application/json"],
  ["Accept", "application/json"],
]);

const qualityProfileId = Number(process.env.RADARR_QUALITY_PROFILE_ID ?? 1);
const rootFolderPath = process.env.RADARR_BASE_PATH ?? "/movies/anime/";
const minimumAvailability = process.env.RADARR_MINIMUM_AVAILABILITY ?? "released";

interface RadarrMovie {
  title: string;
  tmdbId: number;
  titleSlug: string;
  year: number;
  images: unknown[];
  errorMessage?: string;
  [key: string]: unknown;
}

/**
 * Get all currently tracked movies in Radarr.
 */
export async function GetAllMovies(): Promise<RadarrMovie[]> {
  assertConfigured();
  const res = await fetch(`${baseUrl}/movie`, { headers });
  return (await res.json()) as RadarrMovie[];
}

/**
 * Get all TMDB IDs for currently tracked movies (used to disable the add button).
 */
export async function GetAllMovieIds(): Promise<number[]> {
  const movies = await GetAllMovies();
  return movies.map((m) => m.tmdbId);
}

/**
 * Add a movie to Radarr and trigger an immediate search.
 *
 * @param opts Provide either a numeric `tmdbId` (exact) or a `term` (title).
 * @returns The added movie, or an object carrying an `errorMessage`.
 */
export async function PostMovie(opts: {
  tmdbId?: number;
  term?: string;
}): Promise<RadarrMovie> {
  assertConfigured();

  // Resolve the movie via Radarr's own lookup so we send the fields it expects.
  const lookupTerm =
    opts.tmdbId != null
      ? `tmdb:${opts.tmdbId}`
      : encodeURIComponent(opts.term ?? "");
  const lookupRes = await fetch(`${baseUrl}/movie/lookup?term=${lookupTerm}`, {
    headers,
  });
  const lookup = (await lookupRes.json()) as RadarrMovie | RadarrMovie[];
  const movie = Array.isArray(lookup) ? lookup[0] : lookup;
  if (!movie || !movie.tmdbId) {
    return { errorMessage: "No matching movie found in Radarr lookup." } as RadarrMovie;
  }

  const body = JSON.stringify({
    tmdbId: movie.tmdbId,
    title: movie.title,
    titleSlug: movie.titleSlug,
    year: movie.year,
    images: movie.images,
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    minimumAvailability,
    addOptions: {
      // If the movie is already released this begins grabbing immediately.
      searchForMovie: true,
    },
  });

  const res = await fetch(`${baseUrl}/movie`, { headers, method: "POST", body });
  try {
    const result = (await res.json()) as RadarrMovie | RadarrMovie[];
    const added = Array.isArray(result) ? result[0] : result;
    if (added?.errorMessage) {
      console.error("Radarr add error:", added.errorMessage);
    }
    return added;
  } catch (err) {
    console.error("Unable to add movie to Radarr:", err);
    return { errorMessage: "Unable to add movie to Radarr." } as RadarrMovie;
  }
}
