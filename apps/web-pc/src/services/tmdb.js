const TMDB_API_KEY = '8eaaebd40c1c19c77e5394722e3a9503';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Persistent cache to prevent spamming TMDB
let cache = new Map();
try {
  const savedCache = localStorage.getItem('tmdb_cache');
  if (savedCache) {
    cache = new Map(JSON.parse(savedCache));
  }
} catch (e) {
  console.error("Failed to load TMDB cache from localStorage");
}

const saveCache = () => {
  try {
    const entries = Array.from(cache.entries());
    // Keep cache from growing infinitely (limit to 1000 entries)
    if (entries.length > 1000) {
      cache = new Map(entries.slice(entries.length - 1000));
    }
    localStorage.setItem('tmdb_cache', JSON.stringify(Array.from(cache.entries())));
  } catch (e) {
    // Ignore quota errors
  }
};

const fetchTmdb = async (endpoint, params = {}, customApiKey = null) => {
  const apiKeyToUse = customApiKey || TMDB_API_KEY;
  const queryParams = new URLSearchParams({
    api_key: apiKeyToUse,
    ...params
  });
  const url = `${BASE_URL}${endpoint}?${queryParams.toString()}`;
  
  if (cache.has(url)) return cache.get(url);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB error: ${response.status}`);
    const data = await response.json();
    cache.set(url, data);
    saveCache();
    return data;
  } catch (error) {
    console.error("TMDB Fetch Error:", error);
    return null;
  }
};

/**
 * Clean a title from common IPTV junk tags like [4K], (2020), HEVC, etc.
 */
export const cleanTitle = (rawTitle) => {
  if (!rawTitle) return '';
  let title = rawTitle.replace(/\[.*?\]|\(.*?\)/g, ''); // Remove anything in brackets or parentheses
  title = title.replace(/(4K|HD|FHD|1080p|720p|HEVC|H265|VOD)/gi, '');
  
  // Strip trailing years like " 2014" or " 1950" that aren't in parentheses
  title = title.replace(/\s(19|20)\d{2}\s*$/, '');
  
  return title.trim();
};

/**
 * Get enriched metadata and trailer for a Movie
 */
export const getTmdbMovieInfo = async (title, year, imdbId) => {
  let tmdbId = null;
  let movieData = null;

  // 1. Try IMDB ID first if provided
  if (typeof imdbId === 'string' && imdbId.startsWith('tt')) {
    const findData = await fetchTmdb(`/find/${imdbId}`, { external_source: 'imdb_id' });
    if (findData && findData.movie_results && findData.movie_results.length > 0) {
      movieData = findData.movie_results[0];
      tmdbId = movieData.id;
    }
  }

  // 2. Fallback to searching by title
  if (!tmdbId && title) {
    const clean = cleanTitle(title);
    const searchParams = { query: clean };
    if (year) searchParams.year = year;
    const searchData = await fetchTmdb('/search/movie', searchParams);
    
    if (searchData && searchData.results && searchData.results.length > 0) {
      movieData = searchData.results[0];
      tmdbId = movieData.id;
    } else if (year) {
      // Fallback: If search with year fails (e.g., bad metadata), try without the year
      const fallbackData = await fetchTmdb('/search/movie', { query: clean });
      if (fallbackData && fallbackData.results && fallbackData.results.length > 0) {
        movieData = fallbackData.results[0];
        tmdbId = movieData.id;
      }
    }
  }

  if (!tmdbId) return null;

  // 3. Fetch specific details + videos + credits + similar
  const details = await fetchTmdb(`/movie/${tmdbId}`, { append_to_response: 'videos,credits,similar' });
  if (!details) return null;

  // Find a YouTube trailer
  const videos = details.videos?.results || [];
  const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer');

  // Extract Top 5 Cast
  const cast = details.credits?.cast?.slice(0, 5).map(c => ({
    id: c.id,
    name: c.name,
    character: c.character,
    profile: c.profile_path ? `${IMAGE_BASE_URL}${c.profile_path}` : null
  })) || [];

  // Extract Top 5 Similar
  const similar = details.similar?.results?.slice(0, 8).map(s => ({
    id: s.id,
    title: s.title,
    poster: s.poster_path ? `${IMAGE_BASE_URL}${s.poster_path}` : null,
    rating: s.vote_average ? s.vote_average.toFixed(1) : null,
    year: s.release_date ? s.release_date.substring(0, 4) : null,
    type: 'movie'
  })) || [];

  return {
    plot: details.overview,
    poster: details.poster_path ? `${IMAGE_BASE_URL}${details.poster_path}` : null,
    backdrop: details.backdrop_path ? `${IMAGE_BASE_URL}${details.backdrop_path}` : null,
    trailerId: trailer ? trailer.key : null,
    rating: details.vote_average ? details.vote_average.toFixed(1) : null,
    cast: cast,
    similar: similar
  };
};

/**
 * Get enriched metadata and trailer for a TV Series
 */
export const getTmdbSeriesInfo = async (title, imdbId) => {
  let tmdbId = null;
  let seriesData = null;

  if (typeof imdbId === 'string' && imdbId.startsWith('tt')) {
    const findData = await fetchTmdb(`/find/${imdbId}`, { external_source: 'imdb_id' });
    if (findData && findData.tv_results && findData.tv_results.length > 0) {
      seriesData = findData.tv_results[0];
      tmdbId = seriesData.id;
    }
  }

  if (!tmdbId && title) {
    const clean = cleanTitle(title);
    const searchData = await fetchTmdb('/search/tv', { query: clean });
    
    if (searchData && searchData.results && searchData.results.length > 0) {
      seriesData = searchData.results[0];
      tmdbId = seriesData.id;
    }
  }

  if (!tmdbId) return null;

  const details = await fetchTmdb(`/tv/${tmdbId}`, { append_to_response: 'videos,credits,similar' });
  if (!details) return null;

  const videos = details.videos?.results || [];
  const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer');

  // Extract Top 5 Cast
  const cast = details.credits?.cast?.slice(0, 5).map(c => ({
    id: c.id,
    name: c.name,
    character: c.character,
    profile: c.profile_path ? `${IMAGE_BASE_URL}${c.profile_path}` : null
  })) || [];

  // Extract Top 5 Similar
  const similar = details.similar?.results?.slice(0, 8).map(s => ({
    id: s.id,
    title: s.name,
    poster: s.poster_path ? `${IMAGE_BASE_URL}${s.poster_path}` : null,
    rating: s.vote_average ? s.vote_average.toFixed(1) : null,
    year: s.first_air_date ? s.first_air_date.substring(0, 4) : null,
    type: 'series'
  })) || [];

  return {
    id: tmdbId,
    plot: details.overview,
    poster: details.poster_path ? `${IMAGE_BASE_URL}${details.poster_path}` : null,
    backdrop: details.backdrop_path ? `${IMAGE_BASE_URL}${details.backdrop_path}` : null,
    trailerId: trailer ? trailer.key : null,
    rating: details.vote_average ? details.vote_average.toFixed(1) : null,
    cast: cast,
    similar: similar
  };
};

/**
 * Get similar movies or series
 */
export const getSimilarTmdb = async (title, type, customApiKey = null) => {
  if (!title) return [];
  
  let tmdbId = null;
  const clean = cleanTitle(title);
  const searchType = type === 'series' ? 'tv' : 'movie';
  
  const searchData = await fetchTmdb(`/search/${searchType}`, { query: clean }, customApiKey);
  
  if (searchData && searchData.results && searchData.results.length > 0) {
    tmdbId = searchData.results[0].id;
  }
  
  if (!tmdbId) return [];

  const similarData = await fetchTmdb(`/${searchType}/${tmdbId}/similar`, {}, customApiKey);
  if (similarData && similarData.results) {
    return similarData.results.map(item => item.title || item.name);
  }
  return [];
};

export const getTmdbSeasonInfo = async (tmdbId, seasonNumber) => {
  if (!tmdbId || !seasonNumber) return null;
  try {
    const data = await fetchTmdb(`/tv/${tmdbId}/season/${seasonNumber}`);
    if (data && data.episodes) {
      const episodeImages = {};
      data.episodes.forEach(ep => {
        if (ep.still_path) {
          episodeImages[ep.episode_number] = `${IMAGE_BASE_URL}${ep.still_path}`;
        }
      });
      return episodeImages;
    }
  } catch (err) {
    console.error('TMDB Season Fetch Error:', err);
  }
  return null;
};
