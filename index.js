// MovFlix Backend — TMDB ka proxy server
// Ye server TMDB Read Access Token ko chhupata hai (APK me token nahi hota)
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB = "https://api.themoviedb.org/3";
// Render pe Environment Variable ke naam se set karo: TMDB_TOKEN
const TOKEN = process.env.TMDB_TOKEN || "PASTE_YOUR_TMDB_TOKEN_HERE";

const tmdb = axios.create({
  baseURL: TMDB,
  headers: { Authorization: `Bearer ${TOKEN}` },
  timeout: 15000,
});

// ---- Simple in-memory cache (10 min) ----
const cache = new Map();
async function cached(key, fetcher) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const data = await fetcher();
  cache.set(key, { exp: Date.now() + 10 * 60 * 1000, data });
  return data;
}

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(500).json({ error: "TMDB error", message: e.message });
  }
};

app.get("/", (req, res) => res.send("MovFlix API running OK"));

// Trending (movies + shows mixed) — Home banner ke liye
app.get("/trending", handle(() =>
  cached("trending", () => tmdb.get("/trending/all/week").then((r) => r.data))
));

// Popular Movies
app.get("/discover/movie", handle(() =>
  cached("movies", () => tmdb.get("/movie/popular").then((r) => r.data))
));

// Popular TV Shows
app.get("/discover/tv", handle(() =>
  cached("tv", () => tmdb.get("/tv/popular").then((r) => r.data))
));

// Anime — Japanese Animation TV shows
app.get("/anime", handle(() =>
  cached("anime", () =>
    tmdb.get("/discover/tv", {
      params: {
        with_genres: 16,
        with_origin_country: "JP",
        sort_by: "popularity.desc",
        language: "en-US",
      },
    }).then((r) => r.data)
  )
));

// Search (movies + shows + anime sab)
app.get("/search", handle((req) =>
  cached("search:" + (req.query.q || ""), async () => {
    const r = await tmdb.get("/search/multi", {
      params: { query: req.query.q, include_adult: "false" },
    });
    r.data.results = (r.data.results || []).filter((x) => x.media_type !== "person");
    return r.data;
  })
));

// Detail with videos (trailers)
app.get("/detail/:type/:id", handle((req) =>
  cached(`detail:${req.params.type}:${req.params.id}`, () =>
    tmdb.get(`/${req.params.type}/${req.params.id}`, {
      params: { append_to_response: "videos" },
    }).then((r) => r.data)
  )
));

app.listen(PORT, () => console.log(`MovFlix server running on port ${PORT}`));
