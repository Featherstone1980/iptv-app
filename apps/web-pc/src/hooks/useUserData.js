import { useState, useEffect } from 'react';
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: { invoke: async () => ({}), send: () => {}, on: () => {} } };

const STORAGE_KEY = 'streampro_user_data';

/**
 * Strips heavy TMDB metadata fields before writing to localStorage.
 *
 * WHY: localStorage has a hard 5MB limit per origin. Storing full TMDB-enriched
 * objects (which include cast arrays, long plot summaries, backdrop URLs, genre
 * arrays, etc.) caused QuotaExceededError after a few dozen favorites/watched
 * items. Only the fields actually rendered on list cards (poster, title, rating,
 * progress, episode label) need to persist. Full TMDB data is re-fetched on
 * demand when the user opens a Movie/Series overlay — so nothing visible is lost.
 *
 * Future: Migrate to IndexedDB (Dexie.js) when building shared-core to remove
 * the size limit entirely and match how TiviMate/Stremio handle persistence.
 */
const slimItem = (item) => {
  if (!item) return item;
  return {
    // Identity
    id:                  item.id || item.stream_id || item.series_id,
    type:                item.type,
    stream_id:           item.stream_id,
    series_id:           item.series_id,
    // Display fields used by card UI
    title:               item.title,
    name:                item.name,
    poster:              item.poster,
    stream_icon:         item.stream_icon,
    logo:                item.logo,
    year:                item.year,
    rating:              item.rating,
    num:                 item.num,
    // Playback / progress
    url:                 item.url,
    container_extension: item.container_extension,
    progress:            item.progress,
    duration:            item.duration,
    lastWatched:         item.lastWatched,
    addedAt:             item.addedAt,
    // Episode tracking
    season:              item.season,
    episode_num:         item.episode_num,
    episode_label:       item.episode_label,
    // Short plot only (used on hover cards) — capped at 200 chars
    plot: item.plot ? item.plot.slice(0, 200) : undefined,
    description: item.description ? item.description.slice(0, 200) : undefined,
  };
};

const initialData = {
  providers: [], // Array of { id, name, url, username, password, isPrimary }
  profiles: [], // Array of { id, name, avatar, themeColor, favorites, continueWatching, watched, pinCode, lockedCategories }
  activeProfileId: null,
};

const createNewProfile = (id, name, avatar) => ({
  id,
  name,
  avatar,
  themeColor: '#6366f1', // Default Indigo
  favorites: [],
  continueWatching: [],
  watched: [],
  enableCatchup: true,
  spoilerFreeMode: false,
  tmdbApiKey: '',
  pinCode: null,
  lockedCategories: [],
  hiddenCategories: [],
  autoHiddenAdultCategories: [],
  startupTab: 'home',
  timeFormat: '12h',
  bufferSize: 'medium',
  virtualRamSize: 20,
  customUserAgent: '',
  uiZoom: 1.0,
  epgOffset: 0,
  autoPlayNextEpisode: true,
  hasSeenDragDropHint: false,
  enableMultiView: true,
  showEpgNowLine: true,
  showEpgProgressFill: true,
  epgProgressFillColor: '#ffffff',
  showEpgLiveDot: true,
  epgNowLineColor: '', // defaults to theme color
  hideEmptyEpgChannels: false,
  homeOptions: {
    showContinueWatching: true,
    showLiveInContinueWatching: false,
    showNewEpisodes: true,
    showBecauseYouWatched: true,
    showTrendingAction: true,
    showComedies: true,
    showBingeSeries: true
  }
});

export const AVATARS = [
  '/avatars/avatar_crystal.png',
  '/avatars/avatar_robot.png',
  '/avatars/avatar_fox.png',
  '/avatars/avatar_spheres.png',
  '/avatars/avatar_tiger.png',
  '/avatars/avatar_gold.png'
];

const DEFAULT_ARRAY = [];
const DEFAULT_HOME_OPTIONS = {
  showContinueWatching: true,
  showLiveInContinueWatching: false,
  showNewEpisodes: true,
  showBecauseYouWatched: true,
  showTrendingAction: true,
  showComedies: true,
  showBingeSeries: true
};

export const useUserData = () => {
  const [hwAccelDisabled, setHwAccelDisabled] = useState(() => {
    try {
      return ipcRenderer.sendSync('get-hw-accel');
    } catch (e) {
      return false;
    }
  });

  const [userData, setUserData] = useState(() => {
    try {
      const item = window.localStorage.getItem(STORAGE_KEY);
      if (item) {
        const parsed = JSON.parse(item);
        // Migration from old schema if needed
        if (parsed.profileName && !parsed.profiles) {
          const defaultProfile = createNewProfile('1', parsed.profileName, '👽');
          defaultProfile.favorites = parsed.favorites || [];
          defaultProfile.continueWatching = parsed.continueWatching || [];
          defaultProfile.watched = parsed.watched || [];
          defaultProfile.themeColor = parsed.themeColor || '#6366f1';
          return {
            providers: parsed.credentials ? [{ id: 'primary', name: 'Primary', url: parsed.credentials.url, username: parsed.credentials.username, password: parsed.credentials.password, isPrimary: true }] : [],
            profiles: [defaultProfile],
            activeProfileId: '1',
            autoLoginProfileId: null
          };
        }
        
        // Migrate single credentials to providers array
        if (parsed.credentials && !parsed.providers) {
          parsed.providers = [{
             id: 'primary',
             name: 'Primary',
             url: parsed.credentials.url,
             username: parsed.credentials.username,
             password: parsed.credentials.password,
             isPrimary: true
          }];
          delete parsed.credentials;
        }
        
        // Migrate back from gradient to emoji if necessary
        if (parsed.profiles) {
          parsed.profiles = parsed.profiles.map(p => {
            if (p.avatar && p.avatar.includes('gradient')) {
              return { ...p, avatar: '👽' };
            }
            return p;
          });
        }
        
        // Handle "Remember Me" for Provider
        if (parsed.providers && parsed.providers.length > 0) {
          // If the primary provider was saved without "Remember Me", clear it on next launch
          if (parsed.providers[0].remember === false) {
            parsed.providers = [];
            parsed.activeProfileId = null; // Force login again
            parsed.autoLoginProfileId = null;
          }
        }

        // Handle Auto Login for Profile
        if (parsed.autoLoginProfileId) {
          parsed.activeProfileId = parsed.autoLoginProfileId;
        } else if (parsed.profiles && parsed.profiles.length === 1) {
          parsed.activeProfileId = parsed.profiles[0].id;
        }
        // If neither is true, parsed.activeProfileId retains its saved value from last session.
        // If they explicitly logged out (Switch Profile), it will be null.

        return parsed;
      }
    } catch (error) {
      console.warn('Error reading localStorage', error);
    }
    return initialData;
  });

  useEffect(() => {
    try {
      const data = JSON.stringify(userData);
      window.localStorage.setItem(STORAGE_KEY, data);
      console.log(`[useUserData] Successfully saved to localStorage (${data.length} bytes). profiles:`, userData.profiles?.length);
    } catch (error) {
      console.error('[useUserData] Error saving to localStorage', error);
    }
  }, [userData]);

  const activeProfile = userData.profiles?.find(p => p.id === userData.activeProfileId);

  // --- Auth & Providers ---

  const login = (url, username, password, remember = true) => {
    setUserData(prev => ({
      ...prev,
      providers: [{ id: 'primary', name: 'Primary', url, username, password, isPrimary: true, remember }],
    }));
  };

  const addProvider = (name, url, username, password) => {
    setUserData(prev => ({
      ...prev,
      providers: [...(prev.providers || []), { id: Date.now().toString(), name, url, username, password, isPrimary: false }]
    }));
  };

  const removeProvider = (id) => {
    setUserData(prev => ({
      ...prev,
      providers: (prev.providers || []).filter(p => p.id !== id)
    }));
  };

  const setPrimaryProvider = (id) => {
    setUserData(prev => ({
      ...prev,
      providers: (prev.providers || []).map(p => ({
        ...p,
        isPrimary: p.id === id
      }))
    }));
  };

  const logout = () => {
    setUserData(initialData); // Wipes everything
  };

  const addProfile = (name, avatar) => {
    const newId = Date.now().toString();
    setUserData(prev => ({
      ...prev,
      profiles: [...(prev.profiles || []), createNewProfile(newId, name, avatar)]
    }));
  };

  const deleteProfile = (id) => {
    setUserData(prev => ({
      ...prev,
      profiles: prev.profiles.filter(p => p.id !== id),
      activeProfileId: prev.activeProfileId === id ? null : prev.activeProfileId,
      autoLoginProfileId: prev.autoLoginProfileId === id ? null : prev.autoLoginProfileId
    }));
  };

  const switchProfile = (profileId, autoLogin = false) => {
    setUserData(prev => ({
      ...prev,
      activeProfileId: profileId,
      autoLoginProfileId: autoLogin ? profileId : null
    }));
  };

  const logoutProfile = () => {
    setUserData(prev => ({
      ...prev,
      activeProfileId: null,
      autoLoginProfileId: null
    }));
  };

  const toggleAutoLogin = (enabled) => {
    setUserData(prev => ({
      ...prev,
      autoLoginProfileId: enabled ? prev.activeProfileId : null
    }));
  };

  // --- Profile Data Mutators (Only act on activeProfile) ---

  const updateActiveProfile = (updater) => {
    if (!userData.activeProfileId) return;
    setUserData(prev => {
      const currentProfile = prev.profiles.find(p => p.id === prev.activeProfileId);
      if (!currentProfile) return prev;
      
      const updatedProfile = updater(currentProfile);
      if (updatedProfile === currentProfile) return prev;

      return {
        ...prev,
        profiles: prev.profiles.map(p => 
          p.id === prev.activeProfileId ? updatedProfile : p
        )
      };
    });
  };

  const setEpgOffset = (offset) => {
    updateActiveProfile(profile => ({ ...profile, epgOffset: parseFloat(offset) }));
  };

  const toggleAutoPlayNextEpisode = () => {
    updateActiveProfile(profile => ({ ...profile, autoPlayNextEpisode: profile.autoPlayNextEpisode === false ? true : false }));
  };

  const toggleFavorite = (item) => {
    updateActiveProfile(profile => {
      const targetId = item.id || item.stream_id || item.series_id;
      const exists = profile.favorites.find(f => f.id === targetId || f.stream_id === targetId || f.series_id === targetId);
      if (exists) {
        return { ...profile, favorites: profile.favorites.filter(f => f.id !== targetId && f.stream_id !== targetId && f.series_id !== targetId) };
      }
      return { ...profile, favorites: [slimItem({ ...item, addedAt: Date.now() }), ...profile.favorites] };
    });
  };

  const reorderFavorites = (newFavoritesArray) => {
    updateActiveProfile(profile => ({
      ...profile,
      favorites: newFavoritesArray
    }));
  };

  const isFavorite = (id) => {
    return activeProfile?.favorites.some(f => f.id === id || f.stream_id === id || f.series_id === id) || false;
  };

  const updateContinueWatching = (item, progress, duration) => {
    updateActiveProfile(profile => {
      const targetId = item.id || item.stream_id || item.series_id;
      const filtered = profile.continueWatching.filter(w => w.id !== targetId && w.stream_id !== targetId && w.series_id !== targetId);
      
      // If watched more than 95%, mark as watched and remove from continue watching
      if (duration > 0 && (progress / duration) > 0.95) {
        return {
          ...profile,
          continueWatching: filtered,
          watched: [...new Set([...(profile.watched || []).map(String), String(item.id)])]
        };
      }
      
      return {
        ...profile,
        continueWatching: [
          slimItem({ ...item, progress, duration, lastWatched: Date.now() }),
          ...filtered
        ].slice(0, 20) // Keep last 20
      };
    });
  };

  const removeContinueWatching = (id) => {
    updateActiveProfile(profile => ({
      ...profile,
      continueWatching: profile.continueWatching.filter(w => w.id !== id && w.stream_id !== id && w.series_id !== id)
    }));
  };

  const addRecentChannel = (channel) => {
    updateActiveProfile(profile => {
      const targetId = channel.id || channel.stream_id;
      const filtered = (profile.recentChannels || []).filter(c => c.id !== targetId && c.stream_id !== targetId);
      return {
        ...profile,
        recentChannels: [slimItem(channel), ...filtered].slice(0, 10) // Keep last 10 channels
      };
    });
  };

  const markSeriesAsViewed = (seriesId) => {
    updateActiveProfile(profile => ({
      ...profile,
      watched: [...new Set([...(profile.watched || []).map(String), String(seriesId)])]
    }));
  };

  const markMultipleAsWatched = (ids) => {
    updateActiveProfile(profile => {
      const existing = (profile.watched || []).map(String);
      const newIds = ids.map(String);
      return {
        ...profile,
        watched: [...new Set([...existing, ...newIds])]
      };
    });
  };

  const unmarkMultipleAsWatched = (ids) => {
    updateActiveProfile(profile => {
      const existing = (profile.watched || []).map(String);
      const idsToRemove = new Set(ids.map(String));
      return {
        ...profile,
        watched: existing.filter(id => !idsToRemove.has(id))
      };
    });
  };

  const getProgress = (id) => {
    return activeProfile?.continueWatching.find(w => w.id === id || w.stream_id === id || w.series_id === id);
  };

  const isWatched = (id) => {
    return activeProfile?.watched?.some(w => String(w) === String(id)) || false;
  };

  const toggleWatched = (id) => {
    updateActiveProfile(profile => {
      const isAlreadyWatched = profile.watched?.some(w => String(w) === String(id));
      return {
        ...profile,
        watched: isAlreadyWatched 
          ? profile.watched.filter(wId => String(wId) !== String(id))
          : [...new Set([...(profile.watched || []).map(String), String(id)])]
      };
    });
  };

  const setThemeColor = (color) => {
    updateActiveProfile(profile => ({
      ...profile,
      themeColor: color
    }));
  };

  const editProfile = (name, avatar) => {
    updateActiveProfile(profile => ({
      ...profile,
      name,
      avatar
    }));
  };

  const updateProfileFields = (fields) => {
    updateActiveProfile(profile => ({
      ...profile,
      ...fields
    }));
  };

  const setEnableCatchup = (enabled) => {
    updateActiveProfile(profile => ({
      ...profile,
      enableCatchup: enabled
    }));
  };

  const setSpoilerFreeMode = (enabled) => {
    updateActiveProfile(profile => ({
      ...profile,
      spoilerFreeMode: enabled
    }));
  };

  const dismissDragDropHint = () => {
    updateActiveProfile(profile => ({
      ...profile,
      hasSeenDragDropHint: true
    }));
  };

  const resetDragDropHint = () => {
    updateActiveProfile(profile => ({
      ...profile,
      hasSeenDragDropHint: false
    }));
  };

  const setTmdbApiKey = (key) => {
    updateActiveProfile(profile => ({
      ...profile,
      tmdbApiKey: key
    }));
  };

  const setPinCode = (pin) => {
    updateActiveProfile(profile => ({
      ...profile,
      pinCode: pin
    }));
  };

  const toggleLockedCategory = (categoryId) => {
    updateActiveProfile(profile => {
      const locked = profile.lockedCategories || [];
      return {
        ...profile,
        lockedCategories: locked.includes(categoryId)
          ? locked.filter(id => id !== categoryId)
          : [...locked, categoryId]
      };
    });
  };

  const toggleHiddenCategory = (categoryId) => {
    updateActiveProfile(profile => {
      const hidden = profile.hiddenCategories || [];
      return {
        ...profile,
        hiddenCategories: hidden.includes(categoryId)
          ? hidden.filter(id => id !== categoryId)
          : [...hidden, categoryId]
      };
    });
  };

  const updateHomeOptions = (options) => {
    updateActiveProfile(profile => ({
      ...profile,
      homeOptions: {
        ...(profile.homeOptions || {
          showContinueWatching: true,
          showLiveInContinueWatching: false,
          showNewEpisodes: true,
          showBecauseYouWatched: true,
          showTrendingAction: true,
          showComedies: true,
          showBingeSeries: true
        }),
        ...options
      }
    }));
  };

  const setCategoriesState = (categoryIds, stateToApply) => {
    updateActiveProfile(profile => {
      let hidden = [...(profile.hiddenCategories || [])];
      let locked = [...(profile.lockedCategories || [])];

      categoryIds.forEach(id => {
        if (stateToApply.isHidden !== undefined) {
          if (stateToApply.isHidden && !hidden.includes(id)) hidden.push(id);
          else if (!stateToApply.isHidden) hidden = hidden.filter(h => h !== id);
        }
        if (stateToApply.isLocked !== undefined) {
          if (stateToApply.isLocked && !locked.includes(id)) locked.push(id);
          else if (!stateToApply.isLocked) locked = locked.filter(l => l !== id);
        }
      });

      return {
        ...profile,
        hiddenCategories: hidden,
        lockedCategories: locked
      };
    });
  };

  const processNewCategories = (categories = []) => {
    updateActiveProfile(profile => {
      const autoHidden = profile.autoHiddenAdultCategories || [];
      const hidden = profile.hiddenCategories || [];
      const JUNK_REGEX = /(xxx|adult|x-rated|18\+)/i;
      
      let changed = false;
      let newAutoHidden = [...autoHidden];
      let newHidden = [...hidden];

      categories.forEach(cat => {
        if (!autoHidden.includes(cat.category_id)) {
          if (JUNK_REGEX.test(cat.category_name)) {
            newAutoHidden.push(cat.category_id);
            if (!newHidden.includes(cat.category_id)) {
              newHidden.push(cat.category_id);
            }
            changed = true;
          }
        }
      });

      if (changed) {
        return {
          ...profile,
          autoHiddenAdultCategories: newAutoHidden,
          hiddenCategories: newHidden
        };
      }
      return profile;
    });
  };

  const setStartupTab = (tab) => {
    updateActiveProfile(profile => ({ ...profile, startupTab: tab }));
  };

  const setTimeFormat = (format) => {
    updateActiveProfile(profile => ({ ...profile, timeFormat: format }));
  };

  const setBufferSize = (size) => {
    updateActiveProfile(profile => ({ ...profile, bufferSize: size }));
  };

  const setVirtualRamSize = (size) => {
    updateActiveProfile(profile => ({ ...profile, virtualRamSize: size }));
  };

  const setCustomUserAgent = (ua) => {
    updateActiveProfile(profile => ({ ...profile, customUserAgent: ua }));
  };

  const setUiZoom = (zoom) => {
    updateActiveProfile(profile => ({ ...profile, uiZoom: zoom }));
  };

  const clearHistory = () => {
    updateActiveProfile(profile => ({
      ...profile,
      continueWatching: [],
      watched: [],
      recentChannels: []
    }));
  };

  const toggleMultiView = () => {
    updateActiveProfile(profile => ({
      ...profile,
      enableMultiView: profile.enableMultiView === undefined ? false : !profile.enableMultiView
    }));
  };

  const setHideEmptyEpgChannels = (hide) => {
    updateActiveProfile(profile => ({
      ...profile,
      hideEmptyEpgChannels: hide
    }));
  };

  const toggleEpgNowLine = () => {
    updateActiveProfile(profile => ({
      ...profile,
      showEpgNowLine: profile.showEpgNowLine === false ? true : false
    }));
  };

  const toggleEpgProgressFill = () => {
    updateActiveProfile(profile => ({
      ...profile,
      showEpgProgressFill: profile.showEpgProgressFill === false ? true : false
    }));
  };

  const toggleEpgLiveDot = () => {
    updateActiveProfile(profile => ({
      ...profile,
      showEpgLiveDot: profile.showEpgLiveDot === false ? true : false
    }));
  };

  const setEpgProgressFillColor = (color) => {
    updateActiveProfile(profile => ({
      ...profile,
      epgProgressFillColor: color
    }));
  };

  const setEpgNowLineColor = (color) => {
    updateActiveProfile(profile => ({
      ...profile,
      epgNowLineColor: color
    }));
  };

  const clearLocalCache = () => {
    if (window.confirm("Are you sure you want to clear the local cache? The app will restart.")) {
      window.localStorage.clear();
      window.sessionStorage.clear();
      try {
        if (ipcRenderer) {
          ipcRenderer.invoke('save-epg-cache', '');
        }
      } catch (e) {}
      window.location.reload();
    }
  };

  const toggleHardwareAcceleration = (disable) => {
    try {
      ipcRenderer.send('set-hw-accel', disable);
      setHwAccelDisabled(disable);
    } catch (e) {
      console.error(e);
    }
  };

  return {
    // Global Auth
    providers: userData.providers || [],
    credentials: (userData.providers || []).find(p => p.isPrimary) || (userData.providers && userData.providers[0]),
    profiles: userData.profiles || [],
    login,
    addProvider,
    removeProvider,
    setPrimaryProvider,
    logout,
    
    // Profiles
    activeProfileId: userData.activeProfileId,
    autoLoginProfileId: userData.autoLoginProfileId,
    activeProfile,
    addProfile,
    deleteProfile,
    switchProfile,
    logoutProfile,
    toggleAutoLogin,
    editProfile,
    
    // Active Profile Accessors
    favorites: activeProfile?.favorites || DEFAULT_ARRAY,
    continueWatching: activeProfile?.continueWatching || DEFAULT_ARRAY,
    recentChannels: activeProfile?.recentChannels || DEFAULT_ARRAY,
    watched: activeProfile?.watched || DEFAULT_ARRAY,
    themeColor: activeProfile?.themeColor || '#6366f1',
    spoilerFreeMode: activeProfile?.spoilerFreeMode || false,
    tmdbApiKey: activeProfile?.tmdbApiKey || '',
    pinCode: activeProfile?.pinCode || null,
    homeOptions: activeProfile?.homeOptions || DEFAULT_HOME_OPTIONS,
    lockedCategories: activeProfile?.lockedCategories || DEFAULT_ARRAY,
    hiddenCategories: activeProfile?.hiddenCategories || DEFAULT_ARRAY,
    startupTab: activeProfile?.startupTab || 'home',
    timeFormat: activeProfile?.timeFormat || '12h',
    bufferSize: activeProfile?.bufferSize || 'medium',
    virtualRamSize: activeProfile?.virtualRamSize || 20,
    customUserAgent: activeProfile?.customUserAgent || '',
    uiZoom: activeProfile?.uiZoom || 1.0,
    epgOffset: activeProfile?.epgOffset || 0,
    autoPlayNextEpisode: activeProfile?.autoPlayNextEpisode !== false,
    hideEmptyEpgChannels: activeProfile?.hideEmptyEpgChannels || false,
    enableMultiView: activeProfile?.enableMultiView !== false,
    showEpgNowLine: activeProfile?.showEpgNowLine !== false,
    epgNowLineColor: activeProfile?.epgNowLineColor || '',
    showEpgProgressFill: activeProfile?.showEpgProgressFill !== false,
    epgProgressFillColor: activeProfile?.epgProgressFillColor || '#ffffff',
    showEpgLiveDot: activeProfile?.showEpgLiveDot !== false,
    
    // Active Profile Mutators
    toggleFavorite,
    reorderFavorites,
    isFavorite,
    updateHomeOptions,
    updateContinueWatching,
    removeContinueWatching,
    addRecentChannel,
    markSeriesAsViewed,
    markMultipleAsWatched,
    unmarkMultipleAsWatched,
    getProgress,
    isWatched,
    toggleWatched,
    setThemeColor,
    setHideEmptyEpgChannels,
    toggleAutoPlayNextEpisode,
    toggleMultiView,
    toggleEpgNowLine,
    setEpgNowLineColor,
    toggleEpgProgressFill,
    setEpgProgressFillColor,
    toggleEpgLiveDot,
    enableCatchup: activeProfile?.enableCatchup !== false, // Default to true
    setEnableCatchup,
    setSpoilerFreeMode,
    dismissDragDropHint,
    resetDragDropHint,
    setTmdbApiKey,
    setPinCode,
    toggleLockedCategory,
    toggleHiddenCategory,
    setCategoriesState,
    processNewCategories,
    clearHistory,
    setStartupTab,
    setTimeFormat,
    setBufferSize,
    setVirtualRamSize,
    setCustomUserAgent,
    setUiZoom,
    setEpgOffset,
    
    // Global Settings
    clearLocalCache,
    hwAccelDisabled,
    toggleHardwareAcceleration,
  };
};
