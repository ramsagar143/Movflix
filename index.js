// MovFlix Backend v3 — Integrated with ScreenScape Streaming Server
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB = "https://api.themoviedb.org/3";
const TOKEN = process.env.TMDB_TOKEN || "PASTE_YOUR_TMDB_TOKEN_HERE";
const REGION = "IN";

const STREAM_BASE_URL = "https://nxsha.screenscape.me/embed";

app.get("/detail/:type/:id", handle(async (req) => {
  const { type, id } = req.params;
  const data = await cached(`detail:${type}:${id}`, () =>
    tmdb.get(`/${type}/${id}`, {
      params: { append_to_response: "credits,similar,watch/providers" },
    }).then((r) => r.data), 30);

  // ScreenScape Stream URL Inject karna
  const streamUrl = type === "movie" 
    ? `${STREAM_BASE_URL}?tmdb=${id}&type=movie`
    : `${STREAM_BASE_URL}?tmdb=${id}&type=tv&s=1&e=1`;

  return { ...data, stream_url: streamUrl };
}));


const cache = new Map();
async function cached(key, fetcher, ttlMin = 10) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const data = await fetcher();
  cache.set(key, { exp: Date.now() + ttlMin * 60 * 1000, data });
  return data;
}

const handle = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { res.status(500).json({ error: "TMDB error", message: e.message }); }
};

const pageOf = (req) => Math.max(1, parseInt(req.query.page) || 1);

app.get("/", (req, res) => res.send("MovFlix API v3 running OK"));

app.get("/trending", handle((req) => {
  const p = pageOf(req);
  return cached("trending:" + p, () =>
    tmdb.get("/trending/all/week", { params: { page: p } }).then((r) => r.data), 5);
}));

const discover = (path, genreParam) => handle((req) => {
  const p = pageOf(req);
  const genre = parseInt(req.query.genre) || 0;
  let sort = req.query.sort || "popularity.desc";
  if (path.includes("/tv") && sort.startsWith("primary_release_date")) sort = "first_air_date.desc";
  const params = { page: p, sort_by: sort, language: "en-US" };
  if (genre > 0) params[genreParam] = genre;
  return cached(`${path}:${p}:${genre}:${sort}`, () =>
    tmdb.get(path, { params }).then((r) => r.data), 5);
});

app.get("/discover/movie", discover("/discover/movie", "with_genres"));
app.get("/discover/tv", discover("/discover/tv", "with_genres"));

app.get("/anime", handle((req) => {
  const p = pageOf(req);
  return cached("anime:" + p, () =>
    tmdb.get("/discover/tv", {
      params: { page: p, with_genres: 16, with_origin_country: "JP", sort_by: "popularity.desc", language: "en-US" },
    }).then((r) => r.data), 5);
}));

app.get("/providers", handle(() =>
  cached("providers", () =>
    tmdb.get("/watch/providers/movie", { params: { language: "en-US", watch_region: REGION } })
      .then((r) => r.data), 60)
));

app.get("/discover/provider", handle((req) => {
  const id = req.query.id;
  const p = pageOf(req);
  if (!id) throw new Error("id required");
  return cached(`provider:${id}:${p}`, () =>
    tmdb.get("/discover/movie", {
      params: { page: p, with_watch_providers: id, watch_region: REGION, sort_by: "popularity.desc", language: "en-US" },
    }).then((r) => r.data), 5);
}));

app.get("/genres/movie", handle(() =>
  cached("genres:movie", () => tmdb.get("/genre/movie/list", { params: { language: "en-US" } }).then((r) => r.data), 1440)
));
app.get("/genres/tv", handle(() =>
  cached("genres:tv", () => tmdb.get("/genre/tv/list", { params: { language: "en-US" } }).then((r) => r.data), 1440)
));

app.get("/search", handle((req) =>
  cached("search:" + (req.query.q || "") + ":" + pageOf(req), async () => {
    const r = await tmdb.get("/search/multi", {
      params: { query: req.query.q, include_adult: "false", page: pageOf(req) },
    });
    r.data.results = (r.data.results || []).filter((x) => x.media_type !== "person");
    return r.data;
  }, 2)
));

// -------------------------------------------------------------
// DETAIL ENDPOINT (ScreenScape Streaming URL Attached)
// -------------------------------------------------------------
app.get("/detail/:type/:id", handle(async (req) => {
  const { type, id } = req.params;
  const data = await cached(`detail:${type}:${id}`, () =>
    tmdb.get(`/${type}/${id}`, {
      params: { append_to_response: "credits,similar,watch/providers" },
    }).then((r) => r.data), 30);

  // ScreenScape URL logic
  const streamUrl = type === "movie" 
    ? `${STREAM_BASE_URL}?tmdb=${id}&type=movie`
    : `${STREAM_BASE_URL}?tmdb=${id}&type=tv&s=1&e=1`; // Season 1, Episode 1 by default

  return {
    ...data,
    stream_url: streamUrl
  };
}));

// -------------------------------------------------------------
// STREAM ENDPOINT (Episodes aur Seasons specify karne ke liye)
// Example Movies: /stream/movie/10195
// Example TV Show: /stream/tv/84958/1/1
// -------------------------------------------------------------
app.get("/stream/:type/:id/:season?/:episode?", (req, res) => {
  const { type, id, season, episode } = req.params;

  let streamUrl = "";
  if (type === "movie") {
    streamUrl = `${STREAM_BASE_URL}?tmdb=${id}&type=movie`;
  } else if (type === "tv") {
    const s = season || 1;
    const e = episode || 1;
    streamUrl = `${STREAM_BASE_URL}?tmdb=${id}&type=tv&s=${s}&e=${e}`;
  } else {
    return res.status(400).json({ error: "Invalid media type. Use 'movie' or 'tv'." });
  }

  res.json({
    id,
    type,
    season: season || null,
    episode: episode || null,
    stream_url: streamUrl
  });
});

app.listen(PORT, () => console.log(`MovFlix server v3 running on port ${PORT}`));
