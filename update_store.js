const fs = require('fs');
let code = fs.readFileSync('apps/web-pc/src/store/useAppStore.js', 'utf8');

// 1. Add imports
code = code.replace(/import \{ create \} from 'zustand';/, `import { create } from 'zustand';
import { saveProgramsToDb, clearEpgDb } from '../db/epgDatabase';`);

// 2. Add _allLiveChannels
code = code.replace(/liveChannels: \[\],/, `_allLiveChannels: [],
  liveChannels: [],`);

// 3. Remove epgData: {},
code = code.replace(/epgData: \{\},/, '');

// 4. Add loadMoreLiveChannels
code = code.replace(/setActiveSeriesCategoryId: \(id\) => set\(\{ activeSeriesCategoryId: id \}\),/, `setActiveSeriesCategoryId: (id) => set({ activeSeriesCategoryId: id }),
  loadMoreLiveChannels: () => set((state) => {
    const currentLen = state.liveChannels.length;
    const nextChunk = state._allLiveChannels.slice(currentLen, currentLen + 50);
    if (nextChunk.length === 0) return state;
    return { liveChannels: [...state.liveChannels, ...nextChunk] };
  }),`);

// 5. Replace fetchLiveStreams entirely
const startIndex = code.indexOf('fetchLiveStreams: async (categoryId, enableCatchup = true) => {');
const endIndex = code.indexOf('handlePlay: (item) => {');
if (startIndex !== -1 && endIndex !== -1) {
  const newFetchLiveStreams = `fetchLiveStreams: async (categoryId, enableCatchup = true) => {
    if (!categoryId) return;
    const { globalChannelMap } = get();
    const liveList = await getLiveStreams(categoryId);
    const channels = (liveList || []).map(c => ({
      id: c.stream_id,
      stream_id: c.stream_id,
      num: globalChannelMap.get(c.stream_id) || c.num || c.stream_id,
      name: c.name,
      logo: c.stream_icon,
      epg_channel_id: c.epg_channel_id,
      tv_archive: c.tv_archive === 1 || c.tv_archive === "1",
      tv_archive_duration: parseInt(c.tv_archive_duration) || 0,
      type: 'live',
      url: getLiveStreamUrl(c.stream_id)
    }));
    
    // Chunking: load 50 instantly to unfreeze UI, save rest to _allLiveChannels
    set({ _allLiveChannels: channels, liveChannels: channels.slice(0, 50) });

    // Progressively load EPG in background without blocking and write directly to Dexie
    if (globalEpgAbortController) {
      globalEpgAbortController.abort();
    }
    globalEpgAbortController = new AbortController();
    
    const processEpgBackground = async () => {
      let ipcRenderer = null;
      if (typeof window !== 'undefined' && window.require) {
        try { ipcRenderer = window.require('electron').ipcRenderer; } catch(e) {}
      }

      const foundIds = new Set();
      
      if (ipcRenderer) {
        const rawCache = await ipcRenderer.invoke('read-epg-cache').catch(() => null);
        if (rawCache) {
          try {
            const parsed = JSON.parse(rawCache);
            const cacheProgs = parsed.programsByChannel || parsed;
            
            if (cacheProgs && Object.keys(cacheProgs).length > 0) {
              const programsToSave = [];
              for (const [chId, progs] of Object.entries(cacheProgs)) {
                foundIds.add(String(chId));
                if (Array.isArray(progs)) {
                  progs.forEach((p, idx) => {
                    programsToSave.push({
                      id: \`epg_\${chId}_\${p.start_ts || new Date(p.start).getTime()}_\${idx}\`, 
                      channel_id: String(chId),
                      start_timestamp: p.start_ts ? parseInt(p.start_ts) : new Date(p.start).getTime(),
                      stop_timestamp: p.stop_ts ? parseInt(p.stop_ts) : new Date(p.end).getTime(),
                      title: p.title || p.name || '',
                      desc: p.desc || p.description || '',
                      start_str: p.start_str || p.start || '',
                      stop_str: p.stop_str || p.end || ''
                    });
                  });
                }
              }
              if (programsToSave.length > 0) {
                await saveProgramsToDb(programsToSave);
              }
            }
          } catch(e) { console.error('Failed to parse epg cache or save to Dexie', e); }
        }
      }
      
      let remainingChannels = channels.filter(c => {
        const cId = c.stream_id || c.id;
        return !foundIds.has(String(cId));
      });
      
      if (remainingChannels.length === 0) {
        set({ epgLoadingProgress: 100 });
        return;
      }

      const { getCustomEpgBulk } = await import('../services/api');
      let bulkRes = await getCustomEpgBulk(remainingChannels);
      
      let retryCount = 0;
      while (bulkRes && bulkRes.status === 'downloading_in_background' && retryCount < 12) {
        await new Promise(r => setTimeout(r, 5000));
        bulkRes = await getCustomEpgBulk(remainingChannels);
        retryCount++;
      }
      
      if (bulkRes && bulkRes.epg_listings && Object.keys(bulkRes.epg_listings).length > 0) {
        const programsToSave = [];
        for (const [chId, progs] of Object.entries(bulkRes.epg_listings)) {
          if (progs && progs.length > 0) {
            progs.forEach((prog, pIndex) => {
              const startTs = prog.start_timestamp ? prog.start_timestamp * 1000 : new Date(prog.start).getTime();
              const stopTs = prog.stop_timestamp ? prog.stop_timestamp * 1000 : new Date(prog.end).getTime();
              
              let decodedTitle = prog.title || '';
              let decodedDesc = prog.description || '';
              try {
                if (typeof decodedTitle === 'string' && decodedTitle.match(/^[A-Za-z0-9+/]+={0,2}$/)) {
                  decodedTitle = atob(decodedTitle);
                }
                if (typeof decodedDesc === 'string' && decodedDesc.match(/^[A-Za-z0-9+/]+={0,2}$/)) {
                  decodedDesc = atob(decodedDesc);
                }
              } catch(e) {}

              programsToSave.push({
                id: prog.id || \`prog_\${startTs}_\${pIndex}\`,
                channel_id: String(chId),
                start_timestamp: startTs,
                stop_timestamp: stopTs,
                title: decodedTitle,
                desc: decodedDesc,
                start_str: prog.start || '',
                stop_str: prog.end || ''
              });
            });
          }
        }
        if (programsToSave.length > 0) {
           await saveProgramsToDb(programsToSave);
        }
      }
      
      set({ epgLoadingProgress: 100 });
    };

    processEpgBackground();
  },

  // ----------------------------------------------------
  // PLAYBACK HANDLERS
  // ----------------------------------------------------
  `;
  code = code.substring(0, startIndex) + newFetchLiveStreams + code.substring(endIndex + 33);
}

// 6. Fix SSE wiping epgData
code = code.replace(/useAppStore\.setState\(\{ epgData: \{\}, epgLoadingProgress: 0 \}\);/, `useAppStore.setState({ epgLoadingProgress: 0 });
          clearEpgDb();`);

fs.writeFileSync('apps/web-pc/src/store/useAppStore.js', code);
console.log('Successfully updated useAppStore.js');
