import { create } from 'zustand';
import { 
  getLiveCategories, 
  getVodCategories, 
  getSeriesCategories, 
  getLiveStreams, 
  getVodStreams, 
  getLiveStreamUrl, 
  getVodStreamUrl, 
  getSeriesStreamUrl, 
  getEpg, 
  getCustomEpg 
} from '../services/api';

let globalEpgAbortController = null;

export const useAppStore = create((set, get) => ({
  // ----------------------------------------------------
  // UI & NAVIGATION STATE
  // ----------------------------------------------------
  activeTab: 'home',
  showSplash: true,
  isMiniPlayer: false,
  isHomeDataLoaded: false,
  isSearchOpen: false,
  isSettingsOpen: false,
  isSessionUnlocked: false,
  pinPromptCallback: null,
  sortOrder: 'default',
  isLoading: true,
  connectionError: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setShowSplash: (show) => set({ showSplash: show }),
  setIsMiniPlayer: (isMini) => set({ isMiniPlayer: isMini }),
  setIsHomeDataLoaded: (isLoaded) => set({ isHomeDataLoaded: isLoaded }),
  setIsSearchOpen: (isOpen) => set({ isSearchOpen: isOpen }),
  setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  setIsSessionUnlocked: (isUnlocked) => set({ isSessionUnlocked: isUnlocked }),
  setPinPromptCallback: (callback) => set({ pinPromptCallback: callback }),
  setSortOrder: (order) => set({ sortOrder: order }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  // ----------------------------------------------------
  // PLAYER STATE
  // ----------------------------------------------------
  activePlayers: [], // Array of player objects (max 4)
  primaryAudioPlayerId: null, // The stream_id of the unmuted player
  backgroundPlayer: null,
  activeSeries: null,
  activeMovie: null,
  globalVolume: parseFloat(localStorage.getItem('streampro_volume') ?? '1'),

  setGlobalVolume: (vol) => {
    localStorage.setItem('streampro_volume', vol.toString());
    set({ globalVolume: vol });
  },

  setActivePlayer: (player) => set({ 
    activePlayers: player ? [player] : [], 
    primaryAudioPlayerId: player ? (player.item?.stream_id || player.url) : null 
  }),
  
  addMultiViewPlayer: (player) => set((state) => {
    if (state.activePlayers.length >= 4) return state; // Max 4 screens
    if (state.activePlayers.some(p => p.url === player.url)) return state; // Prevent duplicates
    const isFirst = state.activePlayers.length === 0;
    return { 
      activePlayers: [...state.activePlayers, player],
      isMiniPlayer: true, // Auto-minimize so they can keep picking more channels!
      primaryAudioPlayerId: isFirst ? (player.item?.stream_id || player.url) : state.primaryAudioPlayerId
    };
  }),

  removeMultiViewPlayer: (url) => set((state) => {
    const newPlayers = state.activePlayers.filter(p => p.url !== url);
    let newPrimaryAudio = state.primaryAudioPlayerId;
    if (state.primaryAudioPlayerId === url) {
      newPrimaryAudio = newPlayers.length > 0 ? (newPlayers[0].item?.stream_id || newPlayers[0].url) : null;
    }
    return { activePlayers: newPlayers, primaryAudioPlayerId: newPrimaryAudio, isMiniPlayer: newPlayers.length > 0 ? state.isMiniPlayer : false };
  }),

  setPrimaryAudioPlayerId: (id) => set({ primaryAudioPlayerId: id }),
  setBackgroundPlayer: (player) => set({ backgroundPlayer: player }),
  setActiveSeries: (series) => set({ activeSeries: series }),
  setActiveMovie: (movie) => set({ activeMovie: movie }),
  closePlayer: () => set({ activePlayers: [], primaryAudioPlayerId: null, isMiniPlayer: false }),

  // ----------------------------------------------------
  // CONTEXT MENU & UI STATE
  // ----------------------------------------------------
  contextMenu: { isOpen: false, x: 0, y: 0, item: null, type: null },
  openContextMenu: (x, y, item, type) => set({ contextMenu: { isOpen: true, x, y, item, type } }),
  closeContextMenu: () => set(state => ({ contextMenu: { ...state.contextMenu, isOpen: false } })),

  // ----------------------------------------------------
  // MULTI-VIEW SELECT MODE
  // ----------------------------------------------------
  isMultiViewSelectMode: false,
  multiViewSelectionQueue: [],
  setMultiViewSelectMode: (isSelectMode) => set({ isMultiViewSelectMode: isSelectMode, multiViewSelectionQueue: [] }),
  toggleMultiViewSelection: (channel) => set((state) => {
    const channelId = channel.id || channel.stream_id;
    const isSelected = state.multiViewSelectionQueue.some(c => (c.id || c.stream_id) === channelId);
    if (isSelected) {
      return { multiViewSelectionQueue: state.multiViewSelectionQueue.filter(c => (c.id || c.stream_id) !== channelId) };
    } else {
      if (state.multiViewSelectionQueue.length >= 4) return state;
      return { multiViewSelectionQueue: [...state.multiViewSelectionQueue, channel] };
    }
  }),
  launchMultiViewGrid: () => set((state) => {
    const players = state.multiViewSelectionQueue.map(channel => ({
      url: channel.url || `http://localhost:3001/live/${channel.id || channel.stream_id}.m3u8`,
      item: channel
    }));
    return {
      activePlayers: players,
      isMiniPlayer: false,
      primaryAudioPlayerId: players.length > 0 ? (players[0].item.stream_id || players[0].item.id) : null,
      isMultiViewSelectMode: false,
      multiViewSelectionQueue: []
    };
  }),

  // ----------------------------------------------------
  // DATA & CATEGORY STATE
  // ----------------------------------------------------
  liveCategories: [],
  vodCategories: [],
  seriesCategories: [],
  activeLiveCategoryId: null,
  activeVodCategoryId: null,
  activeSeriesCategoryId: null,
  
  movies: [],
  series: [],
  liveChannels: [],
  autoPlay: true,
  startupTab: 'live', // live, vod, series
  timeFormat: '12h', // 12h, 24h
  bufferSize: 'medium', // small, medium, large
  virtualRamSize: 20, // chunks (5 = 10s = ~12MB, 20 = 40s = ~50MB, 75 = 5m = ~187MB)
  showEpgNowLine: true,
  showEpgProgressFill: true,
  activeRecordings: [],
  dvrSchedules: [],
  reminders: JSON.parse(localStorage.getItem('streampro_reminders') || '[]'),
  epgData: {},
  globalSeriesCatalog: null,
  globalChannelMap: new Map(),
  fallbackMap: {},
  backupProvider: null,
  
  autoStartOnBoot: JSON.parse(localStorage.getItem('streampro_auto_start') ?? 'true'),
  idleTimeoutEnabled: JSON.parse(localStorage.getItem('streampro_idle_timeout') ?? 'true'),
  epgUpdateFrequency: parseInt(localStorage.getItem('streampro_epg_freq') ?? '12', 10),

  setActiveLiveCategoryId: (id) => set({ activeLiveCategoryId: id }),
  setActiveVodCategoryId: (id) => set({ activeVodCategoryId: id }),
  setActiveSeriesCategoryId: (id) => set({ activeSeriesCategoryId: id }),
  setGlobalSeriesCatalog: (catalog) => set({ globalSeriesCatalog: catalog }),
  setGlobalChannelMap: (map) => set({ globalChannelMap: map }),
  setShowEpgNowLine: (show) => set({ showEpgNowLine: show }),
  setShowEpgProgressFill: (show) => set({ showEpgProgressFill: show }),

  setEpgUpdateFrequency: (freq) => {
    localStorage.setItem('streampro_epg_freq', freq.toString());
    set({ epgUpdateFrequency: freq });
    fetch('http://localhost:3001/api/custom-epg/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: freq })
    }).catch(e => console.error(e));
  },

  forceEpgUpdate: async () => {
    try {
      await fetch('http://localhost:3001/api/custom-epg/clear-cache', { method: 'POST' });
      alert('EPG Cache Cleared. The app will reload to rebuild the guide.');
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('Failed to clear EPG cache.');
    }
  },

  setAutoStartOnBoot: (enabled) => {
    localStorage.setItem('streampro_auto_start', JSON.stringify(enabled));
    set({ autoStartOnBoot: enabled });
    if (window.electronAPI && window.electronAPI.setAutoStart) {
      window.electronAPI.setAutoStart(enabled);
    }
  },
  setIdleTimeoutEnabled: (enabled) => {
    localStorage.setItem('streampro_idle_timeout', JSON.stringify(enabled));
    set({ idleTimeoutEnabled: enabled });
  },

  // ----------------------------------------------------
  // RECORDING / DVR STATE
  // ----------------------------------------------------
  activeRecordings: [],
  
  startRecording: async (url, title, duration) => {
    try {
      const res = await fetch('http://localhost:3001/api/record/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, duration })
      });
      if (res.ok) {
        get().pollRecordings();
      }
    } catch(err) {
      console.error('Failed to start recording', err);
    }
  },

  stopRecording: async (id) => {
    try {
      const res = await fetch('http://localhost:3001/api/record/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        get().pollRecordings();
      }
    } catch(err) {
      console.error('Failed to stop recording', err);
    }
  },

  pollRecordings: async () => {
    try {
      const res = await fetch('http://localhost:3001/api/record/status');
      if (res.ok) {
        const data = await res.json();
        set({ activeRecordings: data.recordings || [] });
      }
    } catch(err) {
      console.error('Failed to poll recordings', err);
    }
  },

  fetchDvrSchedules: async () => {
    try {
      const res = await fetch('http://localhost:3001/proxy/dvr/schedules');
      if (res.ok) {
        const schedules = await res.json();
        set({ dvrSchedules: schedules || [] });
      }
    } catch(err) {
      console.error('Failed to fetch DVR schedules', err);
    }
  },

  addDvrSchedule: async (schedule) => {
    try {
      const res = await fetch('http://localhost:3001/proxy/dvr/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
      });
      if (res.ok) {
        get().fetchDvrSchedules();
      }
    } catch(err) {
      console.error('Failed to add DVR schedule', err);
    }
  },

  updateDvrSchedule: async (schedule) => {
    try {
      const res = await fetch('http://localhost:3001/proxy/dvr/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
      });
      if (res.ok) {
        get().fetchDvrSchedules();
      }
    } catch(err) {
      console.error('Failed to update DVR schedule', err);
    }
  },

  removeDvrSchedule: async (id) => {
    try {
      const res = await fetch(`http://localhost:3001/proxy/dvr/schedules/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        get().fetchDvrSchedules();
      }
    } catch(err) {
      console.error('Failed to remove DVR schedule', err);
    }
  },

  addReminder: (reminder) => {
    const newReminders = [...get().reminders, { ...reminder, id: Date.now().toString() }];
    localStorage.setItem('streampro_reminders', JSON.stringify(newReminders));
    set({ reminders: newReminders });
  },

  removeReminder: (id) => {
    const newReminders = get().reminders.filter(r => r.id !== id);
    localStorage.setItem('streampro_reminders', JSON.stringify(newReminders));
    set({ reminders: newReminders });
  },

  // ----------------------------------------------------
  // ASYNC FETCH ACTIONS
  // ----------------------------------------------------
  fetchInitialCategories: async () => {
    set({ isLoading: true });
    try {
      const [vodCats, seriesCats, liveCats, allLiveChannels] = await Promise.all([
        getVodCategories(),
        getSeriesCategories(),
        getLiveCategories(),
        getLiveStreams(0)
      ]);

      const updates = {};

      const isVodCatsValid = Array.isArray(vodCats) && vodCats.length > 0;
      const isSeriesCatsValid = Array.isArray(seriesCats) && seriesCats.length > 0;
      const isLiveCatsValid = Array.isArray(liveCats) && liveCats.length > 0;
      const isLiveChannelsValid = Array.isArray(allLiveChannels) && allLiveChannels.length > 0;

      if (isLiveChannelsValid) {
        const map = new Map();
        allLiveChannels.forEach((c, index) => map.set(c.stream_id, index + 1));
        updates.globalChannelMap = map;
      }

      if (isVodCatsValid) {
        updates.vodCategories = [{ category_id: '0', category_name: 'All Movies' }, ...vodCats];
        updates.activeVodCategoryId = '0';
      }

      if (isSeriesCatsValid) {
        updates.seriesCategories = [{ category_id: '0', category_name: 'All Series' }, ...seriesCats];
        updates.activeSeriesCategoryId = '0';
      }

      if (isLiveCatsValid) {
        updates.liveCategories = [{ category_id: '0', category_name: 'All Channels' }, ...liveCats];
        updates.activeLiveCategoryId = '0';
      }

      if (!isLiveCatsValid && !isVodCatsValid) {
        updates.connectionError = "Cannot connect to your primary IPTV provider. Please check your network connection or provider status in Settings.";
      } else {
        updates.connectionError = null;
      }

      set(updates);

      // --- AUTO-FALLBACK BACKGROUND ENGINE ---
      try {
        const userDataStr = window.localStorage.getItem('streampro_user_data');
        if (userDataStr) {
          const parsed = JSON.parse(userDataStr);
          const providers = parsed.providers || [];
          const backups = providers.filter(p => !p.isPrimary);
          
          if (backups.length > 0 && allLiveChannels && allLiveChannels.length > 0) {
             const backupProvider = backups[0];
             // Fire off the backup mapping completely silently
             setTimeout(async () => {
               try {
                  const { getLiveStreams } = await import('../services/api');
                  const backupChannels = await getLiveStreams(0, backupProvider);
                  const { generateFallbackMap } = await import('../utils/fuzzyMatcher');
                  const fallbackMap = generateFallbackMap(allLiveChannels, backupChannels);
                  set({ fallbackMap, backupProvider });
               } catch(err) {
                  console.warn('[FuzzyMatcher] Background process failed', err);
               }
             }, 3000);
          }
        }
      } catch (e) {
        // ignore storage errors
      }
      
    } catch (error) {
      console.error("Failed to load initial categories", error);
    } finally {
      set({ isLoading: false });
      // Lazy import to prefetch search data
      import('../services/api').then(({ prefetchSearchData }) => prefetchSearchData());
    }
  },

  fetchVodStreams: async (categoryId) => {
    if (!categoryId) return;
    const vodList = await getVodStreams(categoryId);
    const movies = (vodList || []).map(v => ({
      id: v.stream_id,
      title: v.name,
      type: 'movie',
      poster: v.stream_icon,
      year: v.year || '',
      added: parseInt(v.added, 10) || 0,
      rating: parseFloat(v.rating_5based || v.rating) || 0,
      category_id: v.category_id,
      url: getVodStreamUrl(v.stream_id)
    }));
    set({ movies });
  },

  fetchSeriesStreams: async (categoryId) => {
    if (!categoryId) return;
    const { getSeries } = await import('../services/api');
    const seriesList = await getSeries(categoryId);
    const series = (seriesList || []).map(s => ({
      id: s.series_id,
      title: s.name,
      type: 'series',
      poster: s.cover,
      year: s.year || '',
      added: parseInt(s.last_modified, 10) || 0,
      rating: parseFloat(s.rating_5based || s.rating) || 0,
      category_id: s.category_id,
      url: getSeriesStreamUrl(s.series_id) 
    }));
    set({ series });
  },

  fetchLiveStreams: async (categoryId, enableCatchup = true) => {
    if (!categoryId) return;
    const { globalChannelMap } = get();
    const liveList = await getLiveStreams(categoryId);
    const channels = (liveList || []).map(c => ({
      id: c.stream_id,
      stream_id: c.stream_id,  // keep stream_id for VideoPlayer audio tracking
      category_id: c.category_id,
      num: globalChannelMap.get(c.stream_id) || c.num || c.stream_id,
      name: c.name,
      logo: c.stream_icon,
      epg_channel_id: c.epg_channel_id,
      tv_archive: c.tv_archive === 1 || c.tv_archive === "1",
      tv_archive_duration: parseInt(c.tv_archive_duration) || 0,
      type: 'live',
      url: getLiveStreamUrl(c.stream_id)
    }));
    
    set({ liveChannels: channels });

    // Progressively load EPG in background without blocking
    const fetchLimit = enableCatchup ? 25 : 10;
    
    if (globalEpgAbortController) {
      globalEpgAbortController.abort();
    }
    globalEpgAbortController = new AbortController();
    const abortSignal = globalEpgAbortController.signal;
    
    const decodeBase64 = (str) => {
      try {
        if (!str) return '';
        if (str.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(str)) {
           return decodeURIComponent(Array.prototype.map.call(atob(str), function(c) {
               return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
           }).join(''));
        }
        return str;
      } catch (e) { return str; }
    };

    const processEpgBackground = async () => {
      const userStr = window.localStorage.getItem('streampro_user_data');
      let epgOffsetMs = 0;
      try {
        if (userStr) {
          const p = JSON.parse(userStr);
          const activeProfile = p.profiles?.find(pr => pr.id === p.activeProfileId);
          if (activeProfile && activeProfile.epgOffset) {
            epgOffsetMs = activeProfile.epgOffset * 3600000;
          }
        }
      } catch (e) {}

      // 1. Check local disk cache via IPC
      let ipcRenderer = null;
      if (typeof window !== 'undefined' && window.require) {
        try { ipcRenderer = window.require('electron').ipcRenderer; } catch(e) {}
      }

      if (ipcRenderer && Object.keys(get().epgData).length === 0) {
        const rawCache = await ipcRenderer.invoke('read-epg-cache').catch(() => null);
        if (rawCache) {
          try {
            const parsed = JSON.parse(rawCache);
            if (parsed && Object.keys(parsed).length > 0) {
              // Convert iso strings back to Date objects
              const hydrated = {};
              for (const [chId, progs] of Object.entries(parsed)) {
                hydrated[chId] = progs.map(p => ({
                  ...p,
                  start: new Date(p.start),
                  end: new Date(p.end)
                }));
              }
              set({ epgData: hydrated });
            }
          } catch(e) {}
        }
      }

      let remainingChannels = channels.filter(c => {
        const cId = c.stream_id || c.id;
        return !get().epgData[cId] || get().epgData[cId].length === 0;
      });
      
      if (remainingChannels.length === 0) {
        set({ epgLoadingProgress: 100 });
        return;
      }

      // 2. Fetch Bulk Custom EPG to resolve 95% of channels
      const { getCustomEpgBulk } = await import('../services/api');
      const { epgDb } = await import('../db/epgDatabase');
      const foundIds = new Set();
      
      const USE_LOCAL = import.meta.env.VITE_USE_LOCAL_EPG === 'true';
      // Reduce local chunk size from 500 to 100 to prevent locking the UI thread during JSON parsing & IndexedDB bulkPut
      const batchSize = USE_LOCAL ? 100 : 25; 
      
      for (let i = 0; i < remainingChannels.length; i += batchSize) {
        if (abortSignal.aborted) break;
        const chunk = remainingChannels.slice(i, i + batchSize);
        
        let bulkRes = await getCustomEpgBulk(chunk);
        
        let retryCount = 0;
        // ONLY wait if the backend hasn't even emitted the first batch yet.
        // Once the first batch arrives, bulkRes.epg_listings will be populated, and we can proceed!
        while (bulkRes && bulkRes.status === 'downloading_in_background' && (!bulkRes.epg_listings || Object.keys(bulkRes.epg_listings).length === 0) && retryCount < 12) {
          console.log("[EPG] Waiting for first batch of custom EPG...");
          set({ epgLoadingProgress: -1 }); // Signal UI that we are waiting for backend
          await new Promise(r => setTimeout(r, 2000));
          bulkRes = await getCustomEpgBulk(chunk);
          retryCount++;
        }
        
        let programsToSave = [];
        if (bulkRes && bulkRes.epg_listings && Object.keys(bulkRes.epg_listings).length > 0) {
          for (const [chId, progs] of Object.entries(bulkRes.epg_listings)) {
            if (progs && progs.length > 0) {
              progs.forEach((prog, pIndex) => {
                const rawStart = parseInt(prog.start_timestamp || prog.start_ts, 10);
                const rawStop = parseInt(prog.stop_timestamp || prog.stop_ts, 10);
                const startTs = rawStart ? (rawStart > 1e11 ? rawStart : rawStart * 1000) : new Date(prog.start || prog.start_str || 0).getTime();
                const stopTs = rawStop ? (rawStop > 1e11 ? rawStop : rawStop * 1000) : new Date(prog.end || prog.stop_str || 0).getTime();
                
                let decodedTitle = prog.title || '';
                let decodedDesc = prog.description || '';
                
                programsToSave.push({
                   id: prog.id || `prog_${startTs}_${pIndex}`,
                   channel_id: String(chId),
                   title: decodedTitle,
                   description: decodedDesc,
                   start_timestamp: startTs + epgOffsetMs,
                   stop_timestamp: stopTs + epgOffsetMs
                });
              });
              foundIds.add(String(chId));
            }
          }
          
          if (programsToSave.length > 0) {
             await epgDb.programs.bulkPut(programsToSave).catch(e => console.error("Dexie bulkPut error:", e));
          }
        }
        
        set({ epgLoadingProgress: Math.round(((i + chunk.length) / remainingChannels.length) * 50) });
        
        // ALWAYS yield to the main thread! Even if local, we need to let the browser paint the UI so it stays smooth.
        if (!USE_LOCAL && i + batchSize < remainingChannels.length) {
          await new Promise(r => setTimeout(r, 200)); // GitHub Pages DDoS protection delay
        } else {
          await new Promise(r => requestAnimationFrame(r)); // Yield to UI thread to prevent stuttering
        }
      }
      
      if (foundIds.size > 0) {
        remainingChannels = remainingChannels.filter(c => {
          const cId = c.stream_id || c.id;
          return !foundIds.has(String(cId));
        });
      }

      // 3. Process remaining channels (the slow 5%) concurrently in chunks via provider
      // Chunking by 5 to improve speed while not overloading the provider
      let batchedEpgData = [];
      let batchCount = 0;

      for (let i = 0; i < remainingChannels.length; i += 5) {
        if (abortSignal.aborted) break;
        const chunk = remainingChannels.slice(i, i + 5);
        
        // Process chunks concurrently using Promise.all
        const processChunk = async (currentChunk) => {
          const chunkResults = await Promise.all(
            currentChunk.map(c => getEpg(c.stream_id || c.id, fetchLimit).catch(() => null))
          );
          
          if (abortSignal.aborted) return;

          currentChunk.forEach((c, index) => {
            let epgRes = chunkResults[index];
            
            if (epgRes && epgRes.epg_listings && epgRes.epg_listings.length > 0) {
              const cId = String(c.stream_id || c.id);
              const progs = epgRes.epg_listings.map((prog, pIndex) => {
                const rawStart = parseInt(prog.start_timestamp || prog.start_ts, 10);
                const rawStop = parseInt(prog.stop_timestamp || prog.stop_ts, 10);
                const startTs = rawStart ? (rawStart > 1e11 ? rawStart : rawStart * 1000) : new Date(prog.start || prog.start_str || 0).getTime();
                const stopTs = rawStop ? (rawStop > 1e11 ? rawStop : rawStop * 1000) : new Date(prog.end || prog.stop_str || 0).getTime();
                
                let decodedTitle = prog.title || '';
                let decodedDesc = prog.description || '';
                try {
                  if (typeof decodedTitle === 'string' && decodedTitle.match(/^[A-Za-z0-9+/]+={0,2}$/)) decodedTitle = atob(decodedTitle);
                  if (typeof decodedDesc === 'string' && decodedDesc.match(/^[A-Za-z0-9+/]+={0,2}$/)) decodedDesc = atob(decodedDesc);
                } catch(e) {}
                
                return {
                  id: prog.id || `prog_${startTs}_${pIndex}`,
                  channel_id: cId,
                  title: decodedTitle,
                  description: decodedDesc,
                  start_timestamp: startTs + epgOffsetMs,
                  stop_timestamp: stopTs + epgOffsetMs
                };
              });
              batchedEpgData.push(...progs);
            } else {
              const PRESERVE_REGEX = /(24\/7|24-7|24x7|24hr|24\/hr|adult|xxx|18\+|playboy|ppv|box office|live event|event|ticket|pass|ncaa|ufc|wwe|sports|mlb|nhl|nfl|nba|marathon|binge|movie|cinema|actor|director|classic|music|radio|audio)/i;
              const nameAndCat = ((c.name || '') + " " + (c.category_name || ''));
              
              if (PRESERVE_REGEX.test(nameAndCat)) {
                const cId = String(c.stream_id || c.id);
                const now = new Date();
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
                
                for (let h = 0; h < 72; h += 4) {
                   const blockStart = new Date(startOfDay.getTime() + (h * 3600000));
                   const blockEnd = new Date(startOfDay.getTime() + ((h + 4) * 3600000));
                   batchedEpgData.push({
                      id: "gen_" + blockStart.getTime(),
                      channel_id: cId,
                      title: c.name || "Live TV",
                      description: "Continuous broadcast",
                      start_timestamp: blockStart.getTime(),
                      stop_timestamp: blockEnd.getTime()
                   });
                }
              }
            }
          });
          
          batchCount += currentChunk.length;
          
          if (batchCount >= 50 || i + 5 >= remainingChannels.length) {
             if (batchedEpgData.length > 0) {
               const { epgDb } = await import('../db/epgDatabase');
               await epgDb.programs.bulkPut(batchedEpgData).catch(()=>null);
             }
             batchedEpgData = [];
             batchCount = 0;
          }
        };

        await processChunk(chunk); // AWAIT this so we don't DOS the connection pool!
        if (abortSignal.aborted) break;
        set({ epgLoadingProgress: Math.round(((i + chunk.length) / remainingChannels.length) * 100) });
        await new Promise(r => setTimeout(r, 200)); // Stagger requests by 200ms between chunks
      }

      // 4. Clean up old EPG programs
      const { purgeStaleEpgPrograms } = await import('../db/epgDatabase');
      await purgeStaleEpgPrograms();
      set({ epgLoadingProgress: 100 });
    };

    processEpgBackground();
  },

  // ----------------------------------------------------
  // PLAYBACK HANDLERS
  // ----------------------------------------------------
  handlePlay: (item) => {
    const state = get();
    if (item && item.type === 'series') {
      if (item.stream_id) {
        state.setActivePlayer({ 
          url: item.url || getSeriesStreamUrl(item.stream_id, item.container_extension), 
          title: item.title || item.name || 'Series Episode', 
          item 
        });
      } else {
        state.setActiveSeries(item);
      }
    } else if (item && (item.type === 'movie' || item.stream_type === 'movie')) {
      state.setActiveMovie(item);
    } else if (item && (item.url || item.stream_id)) {
      const liveUrl = item.url || getLiveStreamUrl(item.stream_id);
      state.setActivePlayer({ url: liveUrl, title: item.title || item.name || 'Live TV', item });
    }
  },

  playEpisodeHandler: (ep, seriesInfo, seasonNum, episodesMap) => {
    const state = get();
    const url = getSeriesStreamUrl(ep.id, ep.container_extension);
    const actualSeason = seasonNum || ep.season || ep?.info?.season || 1;
    const actualEp = ep.episode_num || ep?.info?.episode_num || ep.id;
    
    let cleanEpTitle = ep.title || '';
    const sName = seriesInfo.name || seriesInfo.title || '';
    if (sName && cleanEpTitle.toLowerCase().includes(sName.toLowerCase())) {
      const regex = new RegExp(sName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      cleanEpTitle = cleanEpTitle.replace(regex, '');
    }
    cleanEpTitle = cleanEpTitle.replace(/S\d+\s*E\d+/gi, '');
    cleanEpTitle = cleanEpTitle.replace(/^[\s-]+|[\s-]+$/g, '').trim();

    const epLabel = cleanEpTitle ? `S${actualSeason} E${actualEp} - ${cleanEpTitle}` : `S${actualSeason} E${actualEp}`;

    let nextEpItem = null;
    if (episodesMap) {
      const currentSeasonEps = episodesMap[actualSeason] || [];
      const currentIndex = currentSeasonEps.findIndex(e => e.id === ep.id);
      if (currentIndex !== -1 && currentIndex < currentSeasonEps.length - 1) {
        nextEpItem = currentSeasonEps[currentIndex + 1];
        nextEpItem._season = actualSeason;
      } else {
        const nextSeasonNum = Object.keys(episodesMap).map(Number).sort((a,b)=>a-b).find(s => s > parseInt(actualSeason));
        if (nextSeasonNum && episodesMap[nextSeasonNum] && episodesMap[nextSeasonNum].length > 0) {
          nextEpItem = episodesMap[nextSeasonNum][0];
          nextEpItem._season = nextSeasonNum;
        }
      }
    }

    state.setActivePlayer({ 
      url, 
      title: `${sName} - ${epLabel}`, 
      item: { 
        ...seriesInfo, 
        url, // OVERWRITE the leaked series url with the actual episode url
        container_extension: ep.container_extension, // SAVE extension for future resumes
        poster: seriesInfo.cover, 
        type: 'series', 
        stream_id: ep.id,
        episode_label: epLabel
      },
      nextEpisodeItem: nextEpItem ? { ep: nextEpItem, seriesInfo, seasonNum: nextEpItem._season, episodesMap } : null
    });
  },

  launchMovie: (item) => {
    const state = get();
    state.setActivePlayer({ 
      url: item.url || getVodStreamUrl(item.stream_id || item.id, item.container_extension), 
      title: item.title || item.name || 'Movie', 
      item 
    });
    state.setActiveMovie(null);
  }
}));

// Setup SSE for EPG Hot-Reload — Progressive Population
if (typeof window !== 'undefined') {
  const epgSource = new EventSource('http://localhost:3001/api/epg/stream');

  /**
   * Fetch EPG for the current category and write to Dexie WITHOUT clearing first.
   * bulkPut is idempotent — existing records update, new ones insert.
   * This is called on every 'epg_updated' SSE event (fires once per batch from worker).
   */
  const fetchEpgAdditive = async () => {
    const state = useAppStore.getState();
    const channels = state.liveChannels;
    if (!channels || channels.length === 0) return;

    const { getCustomEpgBulk } = await import('../services/api');
    const bulkRes = await getCustomEpgBulk(channels).catch(() => null);
    if (!bulkRes || !bulkRes.epg_listings) return;

    const programsToSave = [];
    for (const [chId, progs] of Object.entries(bulkRes.epg_listings)) {
      if (!progs || progs.length === 0) continue;
      progs.forEach((prog, pIndex) => {
        const rawStart = parseInt(prog.start_timestamp || prog.start_ts, 10);
        const rawStop = parseInt(prog.stop_timestamp || prog.stop_ts, 10);
        const startTs = rawStart ? (rawStart > 1e11 ? rawStart : rawStart * 1000) : new Date(prog.start || prog.start_str || 0).getTime();
        const stopTs = rawStop ? (rawStop > 1e11 ? rawStop : rawStop * 1000) : new Date(prog.end || prog.stop_str || 0).getTime();

        let decodedTitle = prog.title || '';
        let decodedDesc = prog.description || '';
        
        programsToSave.push({
           id: prog.id || `prog_${startTs}_${pIndex}`,
           channel_id: chId,
           title: decodedTitle,
           description: decodedDesc,
           start: startTs,
           end: stopTs
        });
      });
    }

    if (programsToSave.length > 0) {
       // Assuming epgDb is initialized in a global context or accessible
       await epgDb.epg.bulkPut(programsToSave);
       // Optional: Notify UI if needed, or trigger re-fetch of current view
    }
  };

  epgSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.event === 'epg_updated') {
        console.log('[EPG Hot-Reload] Backend parsed new EPG data! Wiping local state and fetching...');
        useAppStore.setState({ epgData: {}, epgLoadingProgress: 0 });

        if (typeof window !== 'undefined' && window.require) {
          const { ipcRenderer } = window.require('electron');
          ipcRenderer.invoke('clear-epg-cache').catch(()=>null);
        }

        const state = useAppStore.getState();
        if (state.activeLiveCategoryId) {
          state.fetchLiveStreams(state.activeLiveCategoryId);
        }
      }
    } catch (e) {
      console.error('EPG SSE error:', e);
    }
  };
}
