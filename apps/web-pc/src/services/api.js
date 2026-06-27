const API_BASE = 'http://localhost:3001/api/xtream';
const STREAM_BASE = 'http://localhost:3001/proxy/stream';

// Detect if we are running natively inside the Electron environment
const isElectron = navigator.userAgent.toLowerCase().includes('electron');

let cachedCreds = null;
let lastCredsFetch = 0;

// Helper to read current credentials from localStorage
const getCredentials = () => {
  const now = Date.now();
  if (cachedCreds && now - lastCredsFetch < 5000) {
    return cachedCreds;
  }

  try {
    const item = window.localStorage.getItem('streampro_user_data');
    if (item) {
      const data = JSON.parse(item);
      const activeProfile = data.profiles?.find(p => p.id === data.activeProfileId);
      
      // Try new schema first
      let primary = (data.providers || []).find(p => p.isPrimary) || (data.providers && data.providers[0]);
      
      // Fallback to old schema if useUserData hasn't written the migration yet
      if (!primary && data.credentials) {
         primary = {
            url: data.credentials.url,
            username: data.credentials.username,
            password: data.credentials.password
         };
      }

      if (primary) {
        cachedCreds = {
          x_url: primary.url,
          x_user: primary.username,
          x_pass: primary.password,
          userAgent: (activeProfile && activeProfile.customUserAgent) ? activeProfile.customUserAgent : 'VLC/3.0.16 LibVLC/3.0.16'
        };
        lastCredsFetch = now;
        return cachedCreds;
      }
    }
  } catch (e) {
    console.error("Failed to read credentials from localStorage", e);
  }
  
  cachedCreds = { userAgent: 'VLC/3.0.16 LibVLC/3.0.16' };
  lastCredsFetch = now;
  return cachedCreds;
};

const fetchXtream = async (action, params = {}, customProvider = null) => {
  try {
    const creds = customProvider ? {
      x_url: customProvider.url,
      x_user: customProvider.username,
      x_pass: customProvider.password,
      userAgent: getCredentials().userAgent || ''
    } : getCredentials();
    const queryParams = new URLSearchParams({ action, ...params, ...creds }).toString();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(`${API_BASE}?${queryParams}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    return data;
  } catch (error) {
    console.error(`Error fetching Xtream action: ${action}`, error);
    return null;
  }
};

export const getLiveCategories = (customProvider = null) => fetchXtream('get_live_categories', {}, customProvider);
export const getVodCategories = (customProvider = null) => fetchXtream('get_vod_categories', {}, customProvider);
export const getSeriesCategories = (customProvider = null) => fetchXtream('get_series_categories', {}, customProvider);

// Global Caches for Search & Fast Loading
let globalLiveCache = { data: null, timestamp: 0 };
let globalVodCache = { data: null, timestamp: 0 };
let globalSeriesCache = { data: null, timestamp: 0 };

let isFetchingLive = false;
let isFetchingVod = false;
let isFetchingSeries = false;

const CACHE_LIFETIME = 6 * 60 * 60 * 1000; // 6 hours

export const getLiveStreams = async (categoryId, customProvider = null) => {
  if (customProvider) {
    // Bypass cache completely for backup providers during fuzzy match fetching
    return fetchXtream('get_live_streams', { category_id: categoryId }, customProvider);
  }

  const isStale = Date.now() - globalLiveCache.timestamp > CACHE_LIFETIME;

  if (String(categoryId) === '0' || !categoryId) {
    if (globalLiveCache.data && !isStale) return globalLiveCache.data;
    
    if (isFetchingLive) {
      while(isFetchingLive) await new Promise(r => setTimeout(r, 200));
      return globalLiveCache.data;
    }
    isFetchingLive = true;
    const data = await fetchXtream('get_live_streams', { category_id: categoryId });
    globalLiveCache = { data, timestamp: Date.now() };
    isFetchingLive = false;
    return data;
  }

  // FAST CATEGORY SWITCHING: If we already have the full catalog cached,
  // simply filter it in-memory instead of making a blocking network request.
  if (globalLiveCache.data && !isStale) {
    return globalLiveCache.data.filter(c => String(c.category_id) === String(categoryId));
  }

  return fetchXtream('get_live_streams', { category_id: categoryId });
};

export const getVodStreams = async (categoryId) => {
  const isStale = Date.now() - globalVodCache.timestamp > CACHE_LIFETIME;

  if (String(categoryId) === '0' || !categoryId) {
    if (globalVodCache.data && !isStale) return globalVodCache.data;
    
    if (isFetchingVod) {
      while(isFetchingVod) await new Promise(r => setTimeout(r, 200));
      return globalVodCache.data;
    }
    isFetchingVod = true;
    const data = await fetchXtream('get_vod_streams', { category_id: categoryId });
    globalVodCache = { data, timestamp: Date.now() };
    isFetchingVod = false;
    return data;
  }

  // FAST CATEGORY SWITCHING
  if (globalVodCache.data && !isStale) {
    return globalVodCache.data.filter(c => String(c.category_id) === String(categoryId));
  }

  return fetchXtream('get_vod_streams', { category_id: categoryId });
};

export const getSeries = async (categoryId) => {
  const isStale = Date.now() - globalSeriesCache.timestamp > CACHE_LIFETIME;

  if (String(categoryId) === '0' || !categoryId) {
    if (globalSeriesCache.data && !isStale) return globalSeriesCache.data;
    
    if (isFetchingSeries) {
      while(isFetchingSeries) await new Promise(r => setTimeout(r, 200));
      return globalSeriesCache.data;
    }
    isFetchingSeries = true;
    const data = await fetchXtream('get_series', { category_id: categoryId });
    globalSeriesCache = { data, timestamp: Date.now() };
    isFetchingSeries = false;
    return data;
  }

  // FAST CATEGORY SWITCHING
  if (globalSeriesCache.data && !isStale) {
    return globalSeriesCache.data.filter(c => String(c.category_id) === String(categoryId));
  }

  return fetchXtream('get_series', { category_id: categoryId });
};

export const prefetchSearchData = () => {
  // Fire off background fetches for the full catalogs silently
  getVodStreams(0).catch(() => {});
  getSeries(0).catch(() => {});
  getLiveStreams(0).catch(() => {});
};
export const getSeriesInfo = (seriesId) => fetchXtream('get_series_info', { series_id: seriesId });
export const getVodInfo = (vodId) => fetchXtream('get_vod_info', { vod_id: vodId });

export const getEpg = (streamId, limit = 25) => fetchXtream('get_short_epg', { stream_id: streamId, limit });

// Custom EPG Engine Fallback
export const getCustomEpg = async (channelName, epgId) => {
  try {
    const encodedName = encodeURIComponent(channelName);
    const encodedId = encodeURIComponent(epgId || '');
    const response = await fetch(`http://localhost:3001/api/custom-epg?name=${encodedName}&id=${encodedId}`);
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Failed to fetch custom EPG', err);
    return null;
  }
};

export const getCustomEpgBulk = async (channels) => {
    // If you are using GitHub Pages, put your URL here, e.g. "https://YOUR_USERNAME.github.io/YOUR_REPO"
    // Leave it blank to use the local node server
    const GITHUB_PAGES_URL = "https://Featherstone1980.github.io/iptv-app"; 

    if (GITHUB_PAGES_URL) {
      try {
        const epg_listings = {};
        const batchSize = 25; // Fetch 25 channels at a time
        
        for (let i = 0; i < channels.length; i += batchSize) {
          const batch = channels.slice(i, i + batchSize);
          await Promise.all(batch.map(async (ch) => {
            const chId = ch.stream_id || ch.id;
            try {
              const res = await fetch(`${GITHUB_PAGES_URL}/${chId}.json`);
              if (res.ok) {
                const data = await res.json();
                // Data from our script has start_ts, stop_ts. We map it back to what the frontend expects
                epg_listings[chId] = data.map(p => ({
                   ...p,
                   start_timestamp: p.start_ts / 1000,
                   stop_timestamp: p.stop_ts / 1000,
                   start: new Date(p.start_ts).toISOString(),
                   end: new Date(p.stop_ts).toISOString()
                }));
              } else {
                epg_listings[chId] = [];
              }
            } catch(e) {
              epg_listings[chId] = [];
            }
          }));
        }
        return { status: 'success', epg_listings };
      } catch (err) {
        console.error('Failed to fetch from GitHub pages', err);
        return null;
      }
    } else {
      // Legacy local server
      try {
        const response = await fetch(`http://localhost:3001/api/custom-epg/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channels })
        });
        const data = await response.json();
        return data;
      } catch (err) {
        console.error('Failed to fetch bulk custom EPG', err);
        return null;
      }
    }
  };

// Stream URLs
export const getLiveStreamUrl = (streamId, extension = 'm3u8', customProvider = null) => {
  const creds = customProvider ? {
    x_url: customProvider.url,
    x_user: customProvider.username,
    x_pass: customProvider.password,
    userAgent: getCredentials().userAgent || 'VLC/3.0.16 LibVLC/3.0.16'
  } : getCredentials();
  
  const params = new URLSearchParams(creds).toString();
  return `${STREAM_BASE}/live/${streamId}?extension=${extension}${params ? '&' + params : ''}`;
};

export const getVodStreamUrl = (streamId, extension = 'mp4') => {
  const creds = getCredentials();
  const params = new URLSearchParams(creds).toString();
  return `${STREAM_BASE}/movie/${streamId}?extension=${extension}${params ? '&' + params : ''}`;
};

export const getSeriesStreamUrl = (streamId, extension = 'mp4') => {
  const creds = getCredentials();
  const params = new URLSearchParams(creds).toString();
  return `${STREAM_BASE}/series/${streamId}?extension=${extension}${params ? '&' + params : ''}`;
};

export const getTimeshiftStreamUrl = (streamId, start, duration) => {
  const creds = getCredentials();
  const params = new URLSearchParams({
    stream_id: streamId,
    start: start,
    duration: duration,
    ...creds
  }).toString();
  return `http://localhost:3001/proxy/timeshift?${params}`;
};

export const getProxiedImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1') || url.startsWith('https://image.tmdb.org')) return url;
  if (url.startsWith('/')) return url; // local assets
  
  const creds = getCredentials();
  
  let targetUrl = url;
  try {
    const urlObj = new URL(url);
    const providerObj = creds.x_url ? new URL(creds.x_url) : null;
    
    // Intelligent Credential Injection:
    // Many IPTV providers serve images from load-balanced IP addresses instead of their primary domain,
    // making hostname matching unreliable. Normal web servers safely ignore unknown query parameters,
    // but strict CDNs (like TMDB) will throw 400 Bad Request if unexpected params are present.
    // Therefore, we append credentials to ALL images EXCEPT those from known strict CDNs.
    const strictCDNs = ['tmdb.org', 'themoviedb.org', 'ilcdn.fi', 'plex.tv', 'rovi.com', 'gracenote.com', 'fanart.tv', 'epg.best'];
    const isStrictCDN = strictCDNs.some(cdn => urlObj.hostname.includes(cdn));

    if (!isStrictCDN) {
      if (creds.x_user) urlObj.searchParams.set('username', creds.x_user);
      if (creds.x_pass) urlObj.searchParams.set('password', creds.x_pass);
      targetUrl = urlObj.toString();
    }
  } catch (e) {
    // Ignore invalid URLs
  }

  const params = new URLSearchParams({
    url: targetUrl,
    userAgent: creds.userAgent || 'VLC/3.0.16 LibVLC/3.0.16'
  }).toString();
  
  // Use 127.0.0.1 instead of localhost for images. 
  // Browsers strictly limit concurrent connections per origin (usually 6).
  // By using the IP alias, the browser treats it as a separate origin,
  // granting a dedicated connection pool for images and preventing 
  // hundreds of channel logos from blocking critical API requests.
  return `http://127.0.0.1:3001/proxy/image?${params}`;
};
