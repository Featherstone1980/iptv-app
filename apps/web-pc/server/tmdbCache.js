const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CACHE_FILE = path.join(__dirname, 'tmdb_cache.json');
const TMDB_API_KEY = '8eaaebd40c1c19c77e5394722e3a9503';
const BASE_URL = 'https://api.themoviedb.org/3';
const RATE_LIMIT_MS = 1000; // 1 request per second

let cacheData = {};
let isProcessing = false;
let saveTimeout = null;

// The queue acts as a Set by keeping keys, and processing unique ones.
let fetchQueue = [];

// Load cache
try {
  if (fs.existsSync(CACHE_FILE)) {
    cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  }
} catch (e) {
  console.error('Failed to load TMDB cache:', e);
  cacheData = {};
}

// Throttle saves to disk
const triggerSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData), 'utf8');
  }, 5000);
};

// Clean title from IPTV tags
const cleanTitle = (rawTitle) => {
  if (!rawTitle) return '';
  let title = rawTitle.replace(/\[.*?\]|\(.*?\)/g, '');
  title = title.replace(/(4K|HD|FHD|1080p|720p|HEVC|H265|VOD)/gi, '');
  title = title.replace(/\b((?:19|20)\d{2})\s*$/, '');
  return title.trim().replace(/\s{2,}/g, ' ');
};

const extractYear = (rawTitle) => {
  if (!rawTitle) return null;
  const parenYearMatch = rawTitle.match(/\((\d{4})\)/);
  if (parenYearMatch) return parenYearMatch[1];
  const endYearMatch = rawTitle.match(/\b((?:19|20)\d{2})\s*$/);
  if (endYearMatch) return endYearMatch[1];
  return null;
};

// Processing Loop
const processQueue = async () => {
  if (isProcessing) return;
  if (fetchQueue.length === 0) return;
  
  isProcessing = true;
  
  const item = fetchQueue.shift();
  const cacheKey = item.id;
  
  // If we already fetched it recently, skip
  if (cacheData[cacheKey] && cacheData[cacheKey].timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000) {
    isProcessing = false;
    setTimeout(processQueue, 100);
    return;
  }

  try {
    let url = '';
    const cleanT = cleanTitle(item.title);
    const yr = item.year || extractYear(item.title);

    if (item.imdb_id) {
       url = `${BASE_URL}/find/${item.imdb_id}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    } else if (item.type === 'movie') {
       url = `${BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanT)}`;
       if (yr) url += `&primary_release_year=${yr}`;
    } else {
       url = `${BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanT)}`;
       if (yr) url += `&first_air_date_year=${yr}`;
    }

    const response = await axios.get(url, { timeout: 10000 });
    let result = null;

    if (item.imdb_id && response.data) {
       if (response.data.movie_results?.length > 0) result = response.data.movie_results[0];
       else if (response.data.tv_results?.length > 0) result = response.data.tv_results[0];
    } else if (response.data?.results?.length > 0) {
       result = response.data.results[0];
    }

    if (result && result.vote_average) {
       cacheData[cacheKey] = {
           rating: result.vote_average,
           poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
           timestamp: Date.now()
       };
       triggerSave();
    } else {
       // Mark as not found to avoid retrying immediately
       cacheData[cacheKey] = {
           rating: -1, 
           timestamp: Date.now()
       };
       triggerSave();
    }
  } catch (err) {
      console.error("TMDB Sync Error for", item.title, err.message);
  }

  isProcessing = false;
  setTimeout(processQueue, RATE_LIMIT_MS);
};

// Injection method called by server.js
const injectTmdbRatings = (items, type = 'movie') => {
  if (!Array.isArray(items)) return items;

  // Queue items that need fetching, inject existing
  items.forEach(item => {
    const id = item.stream_id || item.series_id || item.id;
    if (!id) return;

    if (cacheData[id]) {
      // It's in cache!
      if (cacheData[id].rating > 0) {
        item.rating = cacheData[id].rating;
        item.is_tmdb_rating = true; // Mark it as true 10-point scale!
        if (cacheData[id].poster) {
           item.stream_icon = cacheData[id].poster;
           item.cover = cacheData[id].poster;
        }
      }
    } else {
      // Not in cache, queue it
      if (!fetchQueue.some(q => q.id === id)) {
         fetchQueue.push({
           id,
           title: item.name || item.title || '',
           year: item.year || item.released || '',
           type: type,
           imdb_id: item.imdb_id || item.tmdb_id || ''
         });
      }
    }
  });

  // Start processing if not already running
  if (!isProcessing && fetchQueue.length > 0) {
     processQueue();
  }

  return items;
};

module.exports = {
  injectTmdbRatings
};
