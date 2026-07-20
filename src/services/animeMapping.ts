import fetch from "node-fetch";
import bottleneck from "bottleneck";

/**
 * Free, ID-based mapping from an AniList id to external ids (primarily the
 * TheTVDB id that Sonarr needs). Two free sources are used together:
 *
 *   1. Fribb/anime-lists  - a large offline JSON (github raw). Loaded once and
 *      cached in memory. Fast, no rate limit, but lags on brand-new shows.
 *   2. ARM API (arm.haglund.dev) - a live lookup used only to fill gaps that
 *      the cached Fribb list misses. Throttled and cached per-id.
 *
 * TheTVDB (title matching) remains a separate, final fallback handled by the
 * schedule controller when this resolver returns no tvdbId.
 */

const FRIBB_URL =
  "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json";
const ARM_URL = "https://arm.haglund.dev/api/v2/ids";
const FRIBB_TTL_MS = 24 * 60 * 60 * 1000; // refresh the offline list daily

export interface ExternalIds {
  tvdbId?: number;
  tmdbId?: number;
  malId?: number;
}

let fribbMap: Map<number, ExternalIds> | null = null;
let fribbLoadedAt = 0;
let fribbLoading: Promise<Map<number, ExternalIds>> | null = null;

// Be polite to the public ARM service: at most ~5 req/sec.
const armLimiter = new bottleneck({ minTime: 200, maxConcurrent: 2 });
const armCache = new Map<number, ExternalIds | null>();

function normalizeTmdb(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "object") {
    const obj = value as { tv?: number; movie?: number };
    return obj.tv ?? obj.movie ?? undefined;
  }
  return undefined;
}

async function loadFribb(): Promise<Map<number, ExternalIds>> {
  if (fribbMap && Date.now() - fribbLoadedAt < FRIBB_TTL_MS) {
    return fribbMap;
  }
  if (fribbLoading) {
    return fribbLoading;
  }
  fribbLoading = (async () => {
    try {
      const res = await fetch(FRIBB_URL);
      const list = (await res.json()) as Array<Record<string, unknown>>;
      const map = new Map<number, ExternalIds>();
      for (const entry of list) {
        const anilistId = entry["anilist_id"] as number | undefined;
        if (!anilistId) continue;
        map.set(anilistId, {
          tvdbId: (entry["tvdb_id"] as number) || undefined,
          tmdbId: normalizeTmdb(entry["themoviedb_id"]),
          malId: (entry["mal_id"] as number) || undefined,
        });
      }
      fribbMap = map;
      fribbLoadedAt = Date.now();
      console.log(`Anime mapping: loaded ${map.size} AniList entries from Fribb.`);
      return map;
    } catch (err) {
      console.error("Anime mapping: failed to load Fribb list:", err);
      // Keep any previously loaded (stale) map rather than losing coverage.
      return fribbMap ?? new Map<number, ExternalIds>();
    } finally {
      fribbLoading = null;
    }
  })();
  return fribbLoading;
}

async function armLookup(anilistId: number): Promise<ExternalIds | null> {
  if (armCache.has(anilistId)) {
    return armCache.get(anilistId) ?? null;
  }
  try {
    const res = await armLimiter.schedule(() =>
      fetch(`${ARM_URL}?source=anilist&id=${anilistId}`)
    );
    if (!res.ok) {
      armCache.set(anilistId, null);
      return null;
    }
    const json = (await res.json()) as Record<string, unknown> | null;
    const ids: ExternalIds | null = json
      ? {
          tvdbId: (json["thetvdb"] as number) || undefined,
          tmdbId: (json["themoviedb"] as number) || undefined,
          malId: (json["myanimelist"] as number) || undefined,
        }
      : null;
    armCache.set(anilistId, ids);
    return ids;
  } catch (err) {
    console.error(`Anime mapping: ARM lookup failed for anilist ${anilistId}:`, err);
    armCache.set(anilistId, null);
    return null;
  }
}

/**
 * Resolve external ids for an AniList id. Fribb (offline) is tried first; if it
 * has no tvdbId, ARM (live) fills the gap. Returns whatever was found, or null.
 */
export async function resolveExternalIds(
  anilistId: number
): Promise<ExternalIds | null> {
  const map = await loadFribb();
  const fromFribb = map.get(anilistId);
  if (fromFribb?.tvdbId) {
    return fromFribb;
  }
  const fromArm = await armLookup(anilistId);
  if (fromArm?.tvdbId) {
    return fromArm;
  }
  // No tvdbId from either source; return any partial data (or null).
  return fromFribb ?? fromArm ?? null;
}
