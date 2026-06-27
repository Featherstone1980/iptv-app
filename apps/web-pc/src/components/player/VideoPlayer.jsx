import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Maximize, Minimize, Volume2, VolumeX, X, Loader2, PictureInPicture, SkipForward, Heart, Headphones, Info, Clock, RotateCcw, RotateCw, FastForward, Rewind, Grid, ChevronUp, ChevronDown, MoreHorizontal } from 'lucide-react';
import { getSeriesInfo, getLiveStreamUrl, getProxiedImageUrl } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import './VideoPlayer.css';
import SmartChannelLogo from '../epg/SmartChannelLogo';

const VideoPlayer = ({ url, title, item, epgData, onClose, onProgress, onPlayNext, autoPlay = true, isMiniPlayer, onToggleMiniPlayer, userData, onPlay, isBackgroundPlayer = false, muted = false }) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hideControlsTimeoutRef = useRef(null);
  const drawerAutoCloseRef = useRef(null); // Drawer's own independent 3s timer
  
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(muted);

  useEffect(() => {
    setIsMuted(muted);
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hlsError, setHlsError] = useState('');
  const [recDuration, setRecDuration] = useState(0);

  // Sleep Timer & Idle Timeout states
  const [isIdle, setIsIdle] = useState(false);
  const [sleepTimer, setSleepTimer] = useState(0); // minutes
  const idleTimeoutRef = useRef(null);
  const sleepTimerTimeoutRef = useRef(null);

  const activeRecordings = useAppStore(state => state.activeRecordings);
  const startRecording = useAppStore(state => state.startRecording);
  const stopRecording = useAppStore(state => state.stopRecording);

  const isRecording = activeRecordings.some(r => r.title === title);
  const currentRecording = activeRecordings.find(r => r.title === title);

  useEffect(() => {
    let interval;
    if (isRecording && currentRecording?.startTime) {
      interval = setInterval(() => {
        setRecDuration(Math.floor((Date.now() - currentRecording.startTime) / 1000));
      }, 1000);
      setRecDuration(Math.floor((Date.now() - currentRecording.startTime) / 1000));
    } else {
      setRecDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording, currentRecording?.startTime]);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const globalVolume = useAppStore(state => state.globalVolume);
  const setGlobalVolume = useAppStore(state => state.setGlobalVolume);
  const liveCategories = useAppStore(state => state.liveCategories);
  const addMultiViewPlayer = useAppStore(state => state.addMultiViewPlayer);
  const activePlayers = useAppStore(state => state.activePlayers);
  const favoritesCategory = React.useMemo(() => liveCategories?.find(c => c.id === 'favorites'), [liveCategories]);
  const idleTimeoutEnabled = useAppStore(state => state.idleTimeoutEnabled);
  const volume = globalVolume;
  const setVolume = setGlobalVolume;

  const [nextEpisodeItem, setNextEpisodeItem] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // EPG Data Parsing for Live Channels
  const now = new Date();
  const channelEpg = epgData && (item?.stream_id || item?.id) ? epgData[item.stream_id || item.id] || [] : [];
  const currentProgram = channelEpg.find(p => {
    const start = new Date(p.start);
    const end = new Date(p.end);
    return now >= start && now <= end;
  });

  const formatEpgTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  
  const [activeMenu, setActiveMenu] = useState('none'); // 'none', 'recent', 'info', 'audio'
  const [isOptionsDrawerOpen, setIsOptionsDrawerOpen] = useState(false);
  
  const [transcodeMode, setTranscodeMode] = useState(0); // 0 = off, 1 = audio only, 2 = audio+video
  const transcodeModeRef = useRef(transcodeMode);
  useEffect(() => { transcodeModeRef.current = transcodeMode; }, [transcodeMode]);
  const [audioDelayMs, setAudioDelayMs] = useState(0);
  const [fallbackUrl, setFallbackUrl] = useState(null);

  const [virtualHlsUrl, setVirtualHlsUrl] = useState(null);
  const [virtualHlsSessionId, setVirtualHlsSessionId] = useState(null);
  const virtualHlsSessionIdRef = useRef(null);
  // Keep ref in sync with state so useCallback closures can always access the current value
  useEffect(() => { virtualHlsSessionIdRef.current = virtualHlsSessionId; }, [virtualHlsSessionId]);

  const activeUrl = useMemo(() => {
    if (!url) return '';
    
    const isLive = item?.type === 'live' || (url && url.includes('.m3u8'));
    if (isLive && transcodeMode > 0) {
      return virtualHlsUrl || ''; // Wait for Virtual HLS to init
    } else if (transcodeMode > 0) {
      return `http://localhost:3001/proxy/transcode?url=${encodeURIComponent(url)}${transcodeMode === 2 ? '&full=true' : ''}`;
    }
    
    return fallbackUrl || url;
  }, [url, transcodeMode, fallbackUrl, item, virtualHlsUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = globalVolume;
    }
  }, [globalVolume, activeUrl]);

  const toggleRecording = (e) => {
    e.stopPropagation();
    if (isRecording) {
      stopRecording(currentRecording.id);
    } else {
      startRecording(activeUrl, title);
    }
  };

  // Clean up HLS session
  useEffect(() => {
    return () => {
      if (virtualHlsSessionId) {
        fetch(`http://localhost:3001/proxy/hls/stop/${virtualHlsSessionId}`).catch(e => console.error(e));
      }
    };
  }, [virtualHlsSessionId]);

  // Init Virtual HLS Transcoder
  useEffect(() => {
    const isLive = item?.type === 'live' || (url && url.includes('.m3u8'));
    console.log(`[Virtual HLS Check] isLive: ${isLive}, transcodeMode: ${transcodeMode}, url: ${url}, virtualHlsUrl: ${virtualHlsUrl}`);
    if (isLive && transcodeMode > 0 && !virtualHlsUrl && url) {
      let isSubscribed = true;
      const startHls = async () => {
        try {
          console.log('[Virtual HLS Check] Firing /proxy/hls/start request...');
          setIsBuffering(true);
          const full = transcodeMode === 2 ? '&full=true' : '';
          const { virtualRamSize } = useAppStore.getState();
          
          // CRITICAL: If the provider is Xtream and we are transcoding a Live channel, we MUST use the continuous MPEG-TS (.ts) 
          // URL instead of the HLS (.m3u8) playlist. If FFmpeg tries to poll a live Xtream .m3u8 playlist, the provider will 
          // frequently drop the connection or serve stale chunks, causing FFmpeg to stall and the client to loop at 7 seconds.
          let ffmpegUrl = url;
          if (item?.type === 'live' && ffmpegUrl.includes('.m3u8')) {
            ffmpegUrl = ffmpegUrl.replace('.m3u8', '.ts');
            ffmpegUrl = ffmpegUrl.replace('extension=m3u8', 'extension=ts');
          }
          
          const res = await fetch(`http://localhost:3001/proxy/hls/start?url=${encodeURIComponent(ffmpegUrl)}${full}&bufferSize=${virtualRamSize}&audioDelayMs=${audioDelayMs}`);
          if (!res.ok) throw new Error('HLS Start Failed');
          const data = await res.json();
          if (!isSubscribed) return;
          
          // Wait for FFmpeg to pre-fill ~1 segment (2 seconds) before hls.js connects.
          // Without this delay, hls.js races to the live edge before FFmpeg has written
          // enough segments, causing 404s and the initial 3 restart loop.
          console.log('[Virtual HLS Check] Waiting for FFmpeg pre-fill buffer...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          if (isSubscribed && data.playlistUrl) {
            console.log('[Virtual HLS Check] Received playlistUrl:', data.playlistUrl);
            setVirtualHlsSessionId(data.sessionId);
            setVirtualHlsUrl(data.playlistUrl);
          }
        } catch (e) {
          console.error('[Virtual HLS] Failed to start:', e);
          setHlsError('Transcoder failed to start.');
        }
      };
      startHls();
      return () => { isSubscribed = false; };
    }
  }, [url, transcodeMode, item, virtualHlsUrl, audioDelayMs]);

  const adjustAudioDelay = (deltaMs) => {
    setAudioDelayMs(prev => {
      const next = prev + deltaMs;
      if (next !== prev) {
        if (transcodeMode === 0) setTranscodeMode(1); // Force FFmpeg engine
        if (virtualHlsSessionId) {
          fetch(`http://localhost:3001/proxy/hls/stop/${virtualHlsSessionId}`).catch(()=>({}));
          setVirtualHlsSessionId(null);
        }
        setVirtualHlsUrl(null); // Triggers HLS start effect
      }
      return next;
    });
  };

  // Reset states if stream changes
  useEffect(() => {
    setTranscodeMode(0);
    setAudioDelayMs(0);
    setFallbackUrl(null);
    setVirtualHlsUrl(null);
    if (virtualHlsSessionId) {
      fetch(`http://localhost:3001/proxy/hls/stop/${virtualHlsSessionId}`).catch(()=>({}));
      setVirtualHlsSessionId(null);
    }
    hardReloadCountRef.current = 0;
  }, [url]);

  // Auto-Fix Codec (AC3/HEVC) via Background Probe
  useEffect(() => {
    // Only probe if we have a raw URL and transcoding isn't already active
    if (transcodeMode === 0 && url && !isBackgroundPlayer) {
      let isSubscribed = true;
      
      const probeStream = async () => {
        try {
          // Send the raw original URL to the backend to probe
          const res = await fetch(`http://localhost:3001/proxy/probe?url=${encodeURIComponent(url)}`);
          if (!res.ok) return;
          const data = await res.json();
          if (!isSubscribed) return;

          // Channel is offline / 404 at provider — stop immediately instead of looping
          console.log('[Auto-Fix Probe] Detected Codecs:', data);
          
          // Auto-enable transcoding if unsupported codecs or containers are detected
          // Chromium lacks native support for AC3/DTS audio, HEVC (H.265) video, and MKV/AVI containers
          const unsupportedAudio = data.audioCodecs?.some(codec => ['ac3', 'eac3', 'dts', 'truehd'].includes(codec));
          const unsupportedVideo = data.videoCodecs?.some(codec => ['hevc', 'h265'].includes(codec));
          const unsupportedContainer = url.toLowerCase().includes('extension=mkv') || url.toLowerCase().includes('.mkv') || url.toLowerCase().includes('extension=avi') || url.toLowerCase().includes('.avi') || url.toLowerCase().includes('extension=ts') || url.toLowerCase().includes('.ts');
          
          if (unsupportedVideo) {
            console.log('[Auto-Fix] HEVC video detected. Engaging full transcoder.');
            setTranscodeMode(2);
          } else if (unsupportedAudio || unsupportedContainer) {
            console.log('[Auto-Fix] AC3/DTS audio or unsupported container detected. Engaging audio/container transcoder.');
            setTranscodeMode(1);
          }
        } catch (err) {
          console.error('[Auto-Fix Probe] Failed to probe stream:', err);
        }
      };
      
      probeStream();
      return () => { isSubscribed = false; };
    }
  }, [url, transcodeMode, isBackgroundPlayer]);

  const triggerFallback = useCallback(() => {
    if (!item) return false;
    const { fallbackMap, backupProvider } = useAppStore.getState();
    const fallbackChannel = fallbackMap?.[item.id];
    if (fallbackChannel) {
      const fbUrl = getLiveStreamUrl(fallbackChannel.stream_id, 'm3u8', backupProvider);
      if (fbUrl === fallbackUrl) return false;
      console.log(`[Auto-Fallback] Triggering seamless hot-swap from ${item.name} to ${fallbackChannel.name}`);
      setFallbackUrl(fbUrl);
      return true;
    }
    return false;
  }, [fallbackUrl, item]);



  // Auto-play next episode logic
  useEffect(() => {
    if (item && item.type === 'series' && (item.series_id || item.id)) {
      const fetchNext = async () => {
        const data = await getSeriesInfo(item.series_id || item.id);
        if (data && data.episodes) {
          const currentSeasonStr = (item.season || item.info?.season || 1).toString();
          const currentEpStr = (item.episode_num || item.info?.episode_num || item.id).toString();
          
          let foundCurrent = false;
          let nextEp = null;
          let nextSeasonLabel = currentSeasonStr;

          const seasonKeys = Object.keys(data.episodes).sort((a, b) => parseInt(a) - parseInt(b));
          
          for (const s of seasonKeys) {
            const eps = data.episodes[s];
            for (let i = 0; i < eps.length; i++) {
              if (foundCurrent) {
                nextEp = eps[i];
                nextSeasonLabel = s;
                break;
              }
              if (eps[i].id === item.stream_id || eps[i].id === item.id) {
                foundCurrent = true;
              }
            }
            if (nextEp) break;
          }

          if (nextEp) {
            // Clean up the title just like in SeriesOverlay
            let cleanTitle = nextEp.title || '';
            const sName = data.info?.name || data.info?.title || '';
            if (sName && cleanTitle.toLowerCase().includes(sName.toLowerCase())) {
              const regex = new RegExp(sName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
              cleanTitle = cleanTitle.replace(regex, '');
            }
            cleanTitle = cleanTitle.replace(/S\d+\s*E\d+/gi, '').replace(/^[\s-]+|[\s-]+$/g, '').trim();

            setNextEpisodeItem({
              ...nextEp,
              series_id: data.info?.series_id || data.info?.id,
              title: data.info?.name || data.info?.title,
              episode_title: cleanTitle,
              episode_label: `S${nextSeasonLabel} E${nextEp.episode_num || nextEp.id}`,
              type: 'series',
              poster: data.info?.cover || data.info?.poster,
              stream_id: nextEp.id,
              url: null // URL will be fetched by handlePlay
            });
          }
        }
      };
      fetchNext();
    }
  }, [item]);

  // Trigger next episode
  useEffect(() => {
    if (duration > 0 && currentTime > 0 && duration !== Infinity) {
      const timeLeft = duration - currentTime;
      if (timeLeft < 0.5 && nextEpisodeItem && onPlayNext && userData?.autoPlayNextEpisode !== false) {
        onPlayNext(nextEpisodeItem);
      }
    }
  }, [currentTime, duration, nextEpisodeItem, onPlayNext, userData?.autoPlayNextEpisode]);

  // Auto-hide controls
  const resetIdleTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    
    // Only hide controls if the video is playing
    if (isPlaying) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2000);

      // "Are You Still Watching?" timeout (4 hours)
      if (idleTimeoutEnabled) {
        idleTimeoutRef.current = setTimeout(() => {
          setIsIdle(true);
          if (videoRef.current) videoRef.current.pause();
        }, 4 * 60 * 60 * 1000);
      }
    }
  }, [isPlaying, idleTimeoutEnabled]);

  const toggleSleepTimer = (e) => {
    if (e) e.stopPropagation();
    const nextVal = sleepTimer === 0 ? 30 : sleepTimer === 30 ? 60 : sleepTimer === 60 ? 90 : sleepTimer === 90 ? 120 : 0;
    setSleepTimer(nextVal);
    
    if (sleepTimerTimeoutRef.current) clearTimeout(sleepTimerTimeoutRef.current);
    
    if (nextVal > 0) {
      sleepTimerTimeoutRef.current = setTimeout(() => {
        if (onClose) onClose();
        else if (videoRef.current) videoRef.current.pause();
      }, nextVal * 60 * 1000);
    }
  };

  useEffect(() => {
    const handleMouseMove = () => resetIdleTimer();
    const handleKeyDown = (e) => {
      resetIdleTimer();
      // D-Pad / Keyboard support
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setShowControls(true);
        setIsOptionsDrawerOpen(true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setShowControls(true);
        setIsOptionsDrawerOpen(false);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // Channel surf if we are live and have recent channels
        if (item && item.type === 'live' && !item.isTimeshift && userData && userData.recentChannels && userData.recentChannels.length > 1) {
          e.preventDefault();
          const currentIndex = userData.recentChannels.findIndex(c => c.id === item.id);
          let newIndex = currentIndex;
          if (e.key === 'ArrowRight') {
            newIndex = currentIndex < userData.recentChannels.length - 1 ? currentIndex + 1 : 0;
          } else {
            newIndex = currentIndex > 0 ? currentIndex - 1 : userData.recentChannels.length - 1;
          }
          const nextChannel = userData.recentChannels[newIndex];
          if (onPlay && nextChannel.id !== item.id) {
             onPlay({...nextChannel, type: 'live'});
          }
        } else {
          // Seek 60s for VOD / Timeshift
          e.preventDefault();
          if (videoRef.current && videoRef.current.duration) {
            const current = videoRef.current.currentTime;
            const dur = videoRef.current.duration;
            const shift = e.key === 'ArrowRight' ? 60 : -60;
            videoRef.current.currentTime = Math.max(0, Math.min(dur, current + shift));
          }
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('keydown', handleKeyDown);
    
    // Initial timer
    resetIdleTimer();

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('keydown', handleKeyDown);
      if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
    };
  }, [resetIdleTimer]);

  const [reloadKey, setReloadKey] = useState(0);
  const pausedAtRef = useRef(0);
  const savedTimeRef = useRef(0);
  const isRecoveringRef = useRef(false);
  const networkErrorCountRef = useRef(0);
  const initialSeekDoneRef = useRef(false);
  const durationRef = useRef(0);
  const hardReloadCountRef = useRef(0);
  const bufferingTimerRef = useRef(null);

  const handleHardReload = useCallback(() => {
    console.log("Triggering stream reconnect...");
    const isTranscoding = transcodeModeRef.current > 0;
    hardReloadCountRef.current++;

    if (isTranscoding) {
      // Hard limit: if we've restarted the FFmpeg session too many times, give up.
      if (hardReloadCountRef.current > 3) {
        setHlsError('Stream offline or provider unavailable. Please try another channel.');
        return;
      }
      // Kill the existing FFmpeg session. Do NOT reset transcodeMode — that causes
      // the probe to re-run and creates an infinite "Connecting → Fixing AC3" cycle.
      // The HLS init effect will auto-restart when transcodeMode > 0 && virtualHlsUrl === null.
      console.log(`[Transcoder] Hard reload #${hardReloadCountRef.current}: restarting FFmpeg session...`);
      networkErrorCountRef.current = 0;
      isRecoveringRef.current = false;
      const sid = virtualHlsSessionIdRef.current;
      if (sid) {
        fetch(`http://localhost:3001/proxy/hls/stop/${sid}`).catch(() => {});
      }
      setVirtualHlsSessionId(null);
      setVirtualHlsUrl(null); // Triggers HLS init effect to restart FFmpeg session
      setHlsError('');
      setIsBuffering(true);
      return;
    }

    if (hardReloadCountRef.current > 3) {
      setHlsError('Stream offline or unavailable.');
      return;
    }
    isRecoveringRef.current = true;
    setHlsError('');
    setIsBuffering(true);
    setReloadKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    let hls;
    const isM3u8 = activeUrl.includes('.m3u8') || activeUrl.includes('extension=m3u8') || activeUrl.includes('/proxy/timeshift');
    
    const video = videoRef.current;
    if (!video) return;
    
    // Clear previous error when URL changes
    setHlsError('');

    // Reset initial seek if this is a fresh load (not a recovery)
    if (!isRecoveringRef.current) {
      initialSeekDoneRef.current = false;
    }

    const onPlay = () => {
      setIsPlaying(true);
      pausedAtRef.current = 0;
    };
    const onPause = () => {
      setIsPlaying(false);
      if (pausedAtRef.current === 0) pausedAtRef.current = Date.now();
    };
    const onWaiting = () => {
      // In transcoding mode, don't flash the skeleton for brief stalls (FFmpeg writing a segment).
      // Wait 1.5s — if the video resumes (onPlaying fires), the timer is cancelled.
      if (transcodeModeRef.current > 0) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = setTimeout(() => setIsBuffering(true), 1500);
      } else {
        setIsBuffering(true);
      }
    };
    const onPlaying = () => {
      clearTimeout(bufferingTimerRef.current); // Cancel any pending buffering flash
      setIsBuffering(false);
      isRecoveringRef.current = false;
      networkErrorCountRef.current = 0;
    };
    const onTimeUpdate = () => {
      if (video.currentTime > 0) {
        setCurrentTime(video.currentTime);
      }
      if (!isRecoveringRef.current && video.currentTime > 0) {
        savedTimeRef.current = video.currentTime;
      }
    };
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      durationRef.current = video.duration;
      const isLive = !video.duration || video.duration === Infinity || isNaN(video.duration);
      
      // If recovering, seek to saved time
      if (isRecoveringRef.current && savedTimeRef.current > 0 && !isLive) {
         video.currentTime = savedTimeRef.current;
      }
      // If initial play and we have progress saved
      else if (!initialSeekDoneRef.current && item && item.progress > 0 && !isLive) {
         video.currentTime = item.progress;
         initialSeekDoneRef.current = true;
      }
    };
    const onError = () => {
      console.log("Native video error encountered.");
      // If hls.js is active, let hls.js handle error recovery!
      if (isM3u8) return;
      
      if (networkErrorCountRef.current > 3) {
         setHlsError('Stream offline or unavailable.');
         return;
      }
      networkErrorCountRef.current++;
      setTimeout(() => handleHardReload(), 2000);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onError);

    if (isM3u8 && Hls.isSupported() && video) {
      const isTranscoding = transcodeMode > 0;
      hls = new Hls(item?.type === 'live' ? {
        // --- Live TV profile ---
        startFragPrefetch: true,
        // In transcoding mode: play further behind live edge (10s) to absorb FFmpeg write delays.
        // In direct mode: stay close to live edge (4s) for low latency.
        liveSyncDurationCount: isTranscoding ? 5 : 2,
        liveMaxLatencyDurationCount: isTranscoding ? 20 : 10,
        // maxBufferLength is in SECONDS. If a segment is 8s long (due to provider keyframes), 
        // a small buffer length forces hls.js to only download 1 segment and stall.
        maxBufferLength: isTranscoding ? 60 : 15,
        maxMaxBufferLength: isTranscoding ? 120 : 30,
        backBufferLength: isTranscoding ? 30 : 5,
        enableWorker: true,
        lowLatencyMode: !isTranscoding, // Disable low-latency in transcoding — we need buffer depth
        fragLoadingTimeOut: 30000,
        manifestLoadingTimeOut: 30000,
        levelLoadingTimeOut: 30000,
        nudgeMaxRetry: 6,
        nudgeOffset: 0.1,
      } : {
        // --- VOD profile ---
        startFragPrefetch: true,
        startPosition: (!isLive && item?.progress > 0 && !isRecoveringRef.current) ? item.progress : -1,
        maxBufferLength: isTranscoding ? 60 : 30, 
        maxMaxBufferLength: isTranscoding ? 120 : 60,
        backBufferLength: isTranscoding ? 60 : 30,
        enableWorker: true,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 10000,
      });

      hls.loadSource(activeUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsError('');
        if (autoPlay || isRecoveringRef.current) {
          video.play().catch(e => console.error('Play prevented', e));
        }
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          const isTranscoding = transcodeModeRef.current > 0;
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Network error encountered', data);
              networkErrorCountRef.current++;
              
              if (isTranscoding) {
                console.log(`[Transcoder] Network error ${networkErrorCountRef.current}, retrying...`);
                if (networkErrorCountRef.current > 4) {
                  // Too many retries — restart the FFmpeg session entirely
                  console.log('[Transcoder] Too many retries, restarting FFmpeg session...');
                  handleHardReload();
                } else {
                  setTimeout(() => { try { hls.startLoad(); } catch(e){} }, 1500);
                }
              } else {
                // Normal (non-transcoded) stream error handling
                if (networkErrorCountRef.current > 5) {
                  console.log('Too many network errors, checking fallback engine...');
                  const fellBack = triggerFallback();
                  if (!fellBack) {
                    setHlsError('Stream offline or unavailable.');
                    hls.destroy();
                  } else {
                    networkErrorCountRef.current = 0;
                  }
                } else if (networkErrorCountRef.current > 2) {
                  handleHardReload();
                } else {
                  hls.startLoad();
                }
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error encountered, recovering...');
              hls.recoverMediaError();
              
              if (!isTranscoding) {
                // Only count media errors toward transcoder engagement when NOT already transcoding.
                // Once the transcoder is active, media errors are normal HLS segment boundary hiccups.
                hardReloadCountRef.current++;
                if (hardReloadCountRef.current > 5) {
                  console.log('Too many media errors, engaging Virtual HLS Transcoder...');
                  setTranscodeMode(1);
                  hardReloadCountRef.current = 0;
                }
              }
              break;
            default:
              console.log('Unrecoverable HLS error, force reloading...');
              networkErrorCountRef.current++;
              if (isTranscoding) {
                // In transcoding mode, just retry — same as network errors.
                // handleHardReload() in transcoding mode has its own logic (kill + restart FFmpeg session).
                // Only do that after many retries.
                if (networkErrorCountRef.current > 8) {
                  handleHardReload();
                } else {
                  setTimeout(() => { try { hls.startLoad(); } catch(e){} }, 1500);
                }
              } else if (networkErrorCountRef.current > 5) {
                 const fellBack = triggerFallback();
                 if (!fellBack) {
                   setHlsError('Fatal playback error.');
                   hls.destroy();
                 } else {
                   networkErrorCountRef.current = 0;
                 }
              } else {
                 handleHardReload();
              }
              break;
          }
        }
      });
    } else if (video) {
      const isLive = item?.type === 'live';
      
      video.src = activeUrl;
      video.addEventListener('loadedmetadata', () => {
        if (autoPlay || isRecoveringRef.current) {
          video.play().catch(e => console.error('Play prevented', e));
        }
      });
    }

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
      
      if (hls) {
        hls.destroy();
      } else if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      
      // Use savedTimeRef because video.currentTime might be 0 immediately after detachMedia()
      if (onProgress && !isRecoveringRef.current && savedTimeRef.current > 0) {
        onProgress(savedTimeRef.current, durationRef.current);
      }
    };
  }, [activeUrl, autoPlay, reloadKey, handleHardReload, item?.type, item?.progress]);

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (isMiniPlayer && onToggleMiniPlayer) {
      onToggleMiniPlayer();
      return;
    }
    if (videoRef.current) {
      if (videoRef.current.paused) {
        // If paused for more than 3 minutes, the IPTV provider connection is likely dead.
        const timeSincePause = Date.now() - pausedAtRef.current;
        if (pausedAtRef.current > 0 && timeSincePause > 3 * 60 * 1000) {
          console.log("Paused for too long. Re-establishing connection...");
          handleHardReload();
          return;
        }
        videoRef.current.play().catch(e => console.log(e));
      } else {
        videoRef.current.pause();
      }
    }
  };

  const toggleMute = (e) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      const newMutedState = !isMuted;
      videoRef.current.muted = newMutedState;
      setIsMuted(newMutedState);
      if (!newMutedState && volume === 0) {
        setVolume(1);
        videoRef.current.volume = 1;
      }
    }
  };

  const toggleFullscreen = (e) => {
    if (e) e.stopPropagation();
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    if (!videoRef.current || !duration || duration === Infinity) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = pos * duration;
    setCurrentTime(pos * duration);
  };

  const isDraggingRef = useRef(false);
  const scrubberRef = useRef(null);

  const handlePointerDown = (e) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    setIsDragging(true);
    handleSeek(e); // jump to initial click pos
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!isDraggingRef.current || !scrubberRef.current || !duration || duration === Infinity) return;
      const rect = scrubberRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setCurrentTime(pos * duration);
      if (videoRef.current) videoRef.current.currentTime = pos * duration;
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [duration]);

  const seekRelative = (seconds) => {
    if (videoRef.current && duration) {
      const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (timeInSeconds) => {
    if (timeInSeconds === undefined || timeInSeconds === null || isNaN(timeInSeconds) || timeInSeconds === Infinity) return "LIVE";
    const h = Math.floor(timeInSeconds / 3600);
    const m = Math.floor((timeInSeconds % 3600) / 60);
    const s = Math.floor(timeInSeconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isLiveStream = !duration || duration === Infinity || isNaN(duration);
  const isLiveChannel = item && item.type === 'live';
  const showDvrButton = item?.type === 'live' || activeUrl?.includes('/live/');
  const progressPercent = isLiveStream ? 100 : (currentTime / duration) * 100;
  
  // For the Live HUD
  const isFavorite = isLiveChannel && userData && userData.favorites.some(f => f.id === item.id);
  
  const toggleFavorite = (e) => {
    e.stopPropagation();
    if (userData && item) {
      userData.toggleFavorite(item);
    }
  };

  return (
    <div 
      className={`video-player-container ${showControls && !isBackgroundPlayer ? '' : 'hide-cursor'} ${isMiniPlayer ? 'mini' : ''} ${isBackgroundPlayer ? 'background-mode' : ''}`} 
      ref={containerRef}
      onClick={isBackgroundPlayer ? undefined : togglePlay}
      title={isMiniPlayer ? "Click to expand" : ""}
      style={{ background: isBackgroundPlayer ? 'transparent' : 'black' }}
    >
      {!isPlaying && (item?.cover || item?.poster || item?.stream_icon) && !isBackgroundPlayer && (
        <div className="video-poster" style={{ backgroundImage: `url(${getProxiedImageUrl(item?.poster || item?.cover || item?.stream_icon)})`, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: 0.8 }} />
      )}
      <video 
        ref={videoRef} 
        className="video-element" 
        autoPlay={autoPlay}
        muted={isMuted}
        playsInline
      />
      
      {hlsError && !isBackgroundPlayer && (
        <div className="video-error-overlay" style={{position:'absolute', top:0, left:0, right:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.8)', color:'#ff4444', padding:'20px', textAlign:'center', zIndex: 100, flexDirection: 'column', gap: '10px'}}>
          <h3>Stream Failed to Load</h3>
          <p>{hlsError}</p>
          <button onClick={() => {
            // Full reset: clear error, kill existing FFmpeg session, reset all transcoder state.
            // This forces the Auto-Fix probe to re-run and start a fresh FFmpeg session.
            setHlsError('');
            hardReloadCountRef.current = 0;
            networkErrorCountRef.current = 0;
            isRecoveringRef.current = false;
            if (virtualHlsSessionId) {
              fetch(`http://localhost:3001/proxy/hls/stop/${virtualHlsSessionId}`).catch(() => {});
            }
            setVirtualHlsSessionId(null);
            setVirtualHlsUrl(null);
            setTranscodeMode(0);
            setIsBuffering(true);
            setReloadKey(prev => prev + 1);
          }} style={{padding: '8px 16px', background: '#e50914', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer'}}>Retry Stream</button>
        </div>
      )}

      {/* Buffering Indicator */}
      {isBuffering && !hlsError && (
        <div className="buffering-indicator" style={{ flexDirection: 'column', gap: '1rem' }}>
          <div className="animated-logo">StreamPro</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', fontWeight: '500', textAlign: 'center', letterSpacing: '0.5px' }}>
            {transcodeMode === 1 && networkErrorCountRef.current === 0 && "Converting AC3 audio for playback..."}
            {transcodeMode === 2 && networkErrorCountRef.current === 0 && "Converting HEVC video for playback..."}
            {transcodeMode > 0 && networkErrorCountRef.current > 0 && networkErrorCountRef.current <= 4 && `Buffering stream... (${networkErrorCountRef.current}/4)`}
            {transcodeMode > 0 && networkErrorCountRef.current > 4 && "Restarting stream session..."}
            {transcodeMode === 0 && networkErrorCountRef.current === 0 && "Connecting to provider..."}
            {transcodeMode === 0 && networkErrorCountRef.current > 0 && "Reconnecting..."}
          </div>
        </div>
      )}

      {/* Top Gradient Bar */}
      {!isBackgroundPlayer && (
        <div className={`video-overlay-top ${showControls ? '' : 'hidden'}`}>
          <h2 className="video-title">{title}</h2>
          {onClose && (
            <button 
              className="close-btn" 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (onProgress && videoRef.current) {
                  onProgress(videoRef.current.currentTime, videoRef.current.duration);
                }
                onClose(); 
              }}
            >
              <X size={32} />
            </button>
          )}
        </div>
      )}

      {/* Next Episode Slide-In Overlay */}
      {!isBackgroundPlayer && !isLiveStream && nextEpisodeItem && onPlayNext && (duration > 0 && currentTime > duration - 60) && (
        <div 
          className="next-episode-overlay animate-slide-in-right"
          onClick={(e) => { e.stopPropagation(); onPlayNext(nextEpisodeItem); }}
          style={{ position: 'absolute', bottom: '120px', right: '40px', background: 'rgba(20,20,25,0.9)', backdropFilter: 'blur(16px)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '16px', cursor: 'pointer', zIndex: 50, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(40,40,45,0.95)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(20,20,25,0.9)'}
        >
          {nextEpisodeItem.poster && (
            <img src={nextEpisodeItem.poster} alt="Next Episode" style={{ width: '120px', height: '68px', objectFit: 'cover', borderRadius: '8px' }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '4px' }}>Up Next</span>
            <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.1rem', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextEpisodeItem.episode_title || 'Next Episode'}</span>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>{nextEpisodeItem.episode_label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '16px' }}>
            <div style={{ background: 'var(--accent-primary, #db2777)', borderRadius: '50%', padding: '8px' }}>
              <Play size={24} fill="white" color="white" />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Gradient Control Bar */}
      {/* Premium HUD Overlay (Floating Console) */}
      {!isBackgroundPlayer && (
        <div 
          className={`floating-console-container ${showControls || activeMenu !== 'none' ? '' : 'hidden'}`}
          onClick={(e) => e.stopPropagation()}
        >
           {/* Multi-View Menu */}
           {isLiveChannel && activeMenu === 'multiview' && (
             <div className="tivimate-submenu animate-fade-in" style={{ marginBottom: '1.5rem', background: 'rgba(20, 20, 25, 0.95)', backdropFilter: 'blur(24px)', borderRadius: '24px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '600px', maxWidth: '90%', pointerEvents: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                 <h3 style={{ margin: 0, color: 'white', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   <Grid size={20} /> Add to Multi-View
                 </h3>
                 <button className="control-btn" onClick={(e) => { e.stopPropagation(); setActiveMenu('none'); }}><X size={20} /></button>
               </div>
               
               {favoritesCategory?.channels?.length > 0 ? (
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '1rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                   {favoritesCategory.channels.map(channel => {
                     const isAlreadyActive = activePlayers?.some(p => (p.item?.stream_id === channel.stream_id) || p.url?.includes(channel.stream_id));
                     return (
                     <button 
                       key={channel.stream_id}
                       onClick={(e) => {
                         e.stopPropagation();
                         if (isAlreadyActive) return;
                         const url = channel.url || `http://localhost:3001/live/${channel.stream_id}.m3u8`;
                         addMultiViewPlayer({ url, item: channel });
                         setActiveMenu('none');
                       }}
                       style={{ background: isAlreadyActive ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.05)', border: isAlreadyActive ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: isAlreadyActive ? 'default' : 'pointer', opacity: isAlreadyActive ? 0.5 : 1, transition: 'transform 0.2s, background 0.2s' }}
                     >
                       {channel.logo ? (
                         <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <img src={getProxiedImageUrl(channel.logo)} alt={channel.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />
                         </div>
                       ) : (
                         <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{channel.name.charAt(0)}</div>
                       )}
                       <span style={{ fontSize: '0.75rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>{channel.name}</span>
                     </button>
                   )})}
                 </div>
               ) : (
                 <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '2rem 0' }}>No favorite channels found.<br/>Add channels to your favorites in the TV Guide to easily launch them in multi-view.</p>
               )}
             </div>
           )}

           {/* Translucent History Cards (TiviMate Style - Zero Click) */}
           {isLiveChannel && !isOptionsDrawerOpen && (activeMenu === 'none' || activeMenu === 'recent') && (
             <div className="tivimate-submenu animate-fade-in" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', padding: '0 24px', maxWidth: '1400px', width: '100%', overflowX: 'auto', pointerEvents: 'auto' }}>
               {userData?.recentChannels?.map(channel => (
                 <button 
                   key={channel.id} 
                   className={`floating-channel-btn ${channel.id === item.id ? 'active' : ''}`}
                   title={channel.name}
                   onClick={(e) => {
                     e.stopPropagation();
                     setTranscodeMode(2); // Force Full Transcoding to inject instant keyframes
                     setHlsError(null);
                     if (onPlay && channel.id !== item.id) {
                       onPlay({...channel, type: 'live'});
                     }
                   }}
                 >
                   <span className="recent-channel-num">{channel.num}</span>
                   {channel.logo ? (
                     <SmartChannelLogo src={channel.logo} alt={channel.name} className="floating-channel-logo" style={{ width: '56px', height: '56px', borderRadius: '10px' }} onError={(e) => e.target.style.display='none'} />
                   ) : (
                     <span className="floating-channel-initial">{channel.name ? channel.name.charAt(0) : '?'}</span>
                   )}
                 </button>
               ))}
             </div>
           )}

           {/* Program Info Panel Overlay */}
           {isLiveChannel && activeMenu === 'info' && (
             <div className="tivimate-info-panel animate-fade-in" style={{ marginBottom: '1.5rem', background: 'rgba(20, 20, 25, 0.85)', backdropFilter: 'blur(24px)', borderRadius: '24px', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '2rem', alignItems: 'flex-start', width: '80%', maxWidth: '900px', boxShadow: '0 20px 50px rgba(0,0,0,0.8)', pointerEvents: 'auto' }}>
               {item?.logo && (
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                   <SmartChannelLogo src={item.logo} alt={title} className="player-overlay-channel-logo" style={{ width: '120px', height: '120px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} onError={(e) => e.target.style.display='none'} />
                 </div>
               )}
               <div style={{ flex: 1 }}>
                 <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', color: 'white' }}>
                   {currentProgram ? currentProgram.title : title}
                 </h1>
                 <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                   <span style={{ fontSize: '1.2rem', fontWeight: 'bold', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '6px' }}>CH {item?.num}</span>
                   <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{item?.name}</span>
                   {currentProgram && (
                     <span style={{ fontSize: '1.1rem', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '1rem' }}>
                       {formatEpgTime(currentProgram.start)} - {formatEpgTime(currentProgram.end)}
                     </span>
                   )}
                 </div>
                 {currentProgram?.description && (
                   <p style={{ fontSize: '1.1rem', lineHeight: '1.6', color: 'rgba(255,255,255,0.9)', margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                     {currentProgram.description}
                   </p>
                 )}
               </div>
             </div>
           )}

           {/* Audio Sync Panel */}
           {activeMenu === 'audio' && (
             <div className="tivimate-submenu animate-fade-in" style={{ marginBottom: '1.5rem', background: 'rgba(20, 20, 25, 0.9)', backdropFilter: 'blur(24px)', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '1rem', width: '320px', pointerEvents: 'auto' }}>
               <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <Volume2 size={18} /> Audio Sync
               </h3>
               <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                 If the audio is out of sync with the video, adjust the delay.
               </p>
               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '0.5rem' }}>
                 <button className="control-btn" onClick={(e) => { e.stopPropagation(); adjustAudioDelay(-100); }} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '4px' }}>-100ms</button>
                 <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: audioDelayMs === 0 ? 'white' : 'var(--accent-primary)', minWidth: '80px', textAlign: 'center' }}>
                   {audioDelayMs > 0 ? `+${audioDelayMs}` : audioDelayMs} ms
                 </span>
                 <button className="control-btn" onClick={(e) => { e.stopPropagation(); adjustAudioDelay(100); }} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '4px' }}>+100ms</button>
               </div>
               <button className="control-btn" onClick={(e) => { e.stopPropagation(); adjustAudioDelay(-audioDelayMs); }} style={{ background: 'var(--accent-primary)', color: 'white', padding: '0.5rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', marginTop: '0.5rem' }} disabled={audioDelayMs === 0}>
                 Reset Sync
               </button>
             </div>
           )}

          {/* The Floating Console */}
          <div className="floating-console" style={{ flexDirection: 'column', gap: (!isLiveChannel && !item?.isTimeshift) ? '12px' : '0' }}>
            
            {/* Built-in VOD / Timeshift Scrubber */}
            {(!isLiveChannel || item?.isTimeshift) && (!userData?.spoilerFreeMode) && (
              <div 
                ref={scrubberRef}
                className="progress-container" 
                onPointerDown={handlePointerDown} 
                style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none', width: '100%', marginBottom: '16px', height: '20px', display: 'flex', alignItems: 'center', cursor: 'pointer', pointerEvents: 'auto' }}
              >
                <div className="progress-track" style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', position: 'relative' }}>
                  <div className="progress-fill" style={{ width: `${progressPercent}%`, height: '100%', background: 'white', borderRadius: '2px', position: 'absolute', top: 0, left: 0 }}>
                    <div className="progress-thumb" style={{ position: 'absolute', right: '-8px', top: '50%', transform: `translateY(-50%) scale(${isDragging ? 1.5 : 1})`, width: '16px', height: '16px', background: 'white', borderRadius: '50%', boxShadow: '0 0 10px rgba(255,255,255,0.5)', transition: 'transform 0.1s' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Spoiler-Free Notice */}
            {(!isLiveChannel || item?.isTimeshift) && userData?.spoilerFreeMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '4px 0' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', letterSpacing: '2px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                  Spoiler-Free Mode Active
                </span>
              </div>
            )}

            <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Left: Channel Info & Time (Elite Info Pill) */}
              <div className="console-left" style={{ display: 'flex', flex: 1 }}>
                {(isLiveChannel || item?.isTimeshift) ? (
                  <div className="elite-info-pill animate-fade-in">
                    {item?.logo ? (
                      <SmartChannelLogo src={item.logo} alt={title} className="player-hud-channel-logo" style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'white', padding: '0px' }} onError={(e) => e.target.style.display='none'} />
                    ) : (
                      <div style={{ width: '64px', height: '64px', background: 'white', color: 'black', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {item?.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <div className="elite-info-content">
                      <span className="elite-channel-name">CH {item?.num} • {item?.name}</span>
                      
                      {currentProgram ? (
                        <>
                          <span className="elite-program-title">{currentProgram.title}</span>
                          <span className="elite-program-time">{formatEpgTime(currentProgram.start)} - {formatEpgTime(currentProgram.end)}</span>
                          
                          {(() => {
                            const progStart = new Date(currentProgram.start).getTime();
                            const progEnd = new Date(currentProgram.end).getTime();
                            const total = progEnd - progStart;
                            const elapsed = new Date().getTime() - progStart;
                            const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
                            
                            return (
                              <div className="broadcast-progress-container">
                                <div className="broadcast-progress-fill" style={{ width: `${progress}%` }}></div>
                              </div>
                            );
                          })()}
                        </>
                      ) : (
                        <span className="elite-program-title">Live Broadcast</span>
                      )}

                      {item?.isTimeshift && (
                        <span style={{ fontSize: '0.8rem', color: '#ff4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          <span className="live-dot pulse" style={{ width: '6px', height: '6px', background: '#ff4444', borderRadius: '50%' }}></span> Catchup / Timeshift
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '400px' }}>
                  </div>
                )}
              </div>

            {/* Center: Transport Controls (Hidden for pure Live TV) */}
            <div className="controls-center" style={{ display: 'flex', alignItems: 'center', gap: '32px', flex: 1, justifyContent: 'center' }}>
              {(!isLiveChannel || item?.isTimeshift) && (
                <>
                  <button className="control-btn" onClick={(e) => { e.stopPropagation(); seekRelative(-10); }} title="Rewind 10s" style={{ background: 'rgba(255,255,255,0.1)', padding: '12px' }}>
                    <RotateCcw size={28} />
                  </button>
                  
                  <button 
                    className="control-btn play-pause-btn" 
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    style={{ background: 'white', color: 'black', padding: '16px', borderRadius: '50%', transform: 'scale(1.2)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                  >
                    {isPlaying ? <Pause fill="black" size={28} /> : <Play fill="black" size={28} style={{ marginLeft: '4px' }} />}
                  </button>

                  <button className="control-btn" onClick={(e) => { e.stopPropagation(); seekRelative(10); }} title="Fast Forward 10s" style={{ background: 'rgba(255,255,255,0.1)', padding: '12px' }}>
                    <RotateCw size={28} />
                  </button>
                </>
              )}
            </div>

            {/* The Quick Options Drawer (Slides up from the bottom of the HUD) */}
            {isOptionsDrawerOpen && (
              <div className="quick-options-drawer animate-slide-up" style={{ 
                position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '16px',
                background: 'rgba(20, 20, 25, 0.95)', backdropFilter: 'blur(24px)', 
                borderRadius: '24px', padding: '16px 24px', border: '1px solid rgba(255,255,255,0.1)', 
                display: 'flex', gap: '16px', boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                pointerEvents: 'auto', alignItems: 'center', justifyContent: 'center', zIndex: 10
              }}>
                {(isLiveChannel && !item?.isTimeshift) && (
                  <>
                    {activePlayers?.length < 4 && (
                      <button className="control-btn drawer-btn" onClick={(e) => { e.stopPropagation(); setActiveMenu(prev => prev === 'multiview' ? 'none' : 'multiview'); setIsOptionsDrawerOpen(false); }} style={{ color: activeMenu === 'multiview' ? 'var(--accent-primary)' : 'white' }} title="Multi-View">
                        <Grid size={24} />
                      </button>
                    )}
                    <button className="control-btn drawer-btn" onClick={(e) => { e.stopPropagation(); setActiveMenu(prev => prev === 'audio' ? 'none' : 'audio'); setIsOptionsDrawerOpen(false); }} style={{ color: activeMenu === 'audio' ? 'var(--accent-primary)' : 'white' }} title="Audio Sync">
                      <Volume2 size={24} />
                    </button>
                  </>
                )}
                
                {showDvrButton && (
                  <button 
                    className="control-btn drawer-btn dvr-btn" 
                    onClick={(e) => { e.stopPropagation(); toggleRecording(e); }} 
                    style={{ color: isRecording ? '#ff4444' : 'white', display: 'flex', alignItems: 'center', gap: '6px' }} 
                    title={isRecording ? 'Stop Recording' : 'Start DVR Recording'}
                  >
                    <div className={isRecording ? 'pulse' : ''} style={{ width: '14px', height: '14px', borderRadius: '50%', background: isRecording ? '#ff4444' : 'rgba(255,255,255,0.5)', boxShadow: isRecording ? '0 0 10px #ff4444' : 'none' }}></div>
                    {isRecording && <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{formatTime(recDuration)}</span>}
                  </button>
                )}

                <button className="control-btn drawer-btn" onClick={(e) => { 
                  e.stopPropagation(); 
                  setTranscodeMode((prev) => (prev + 1) % 3); 
                  handleHardReload(); 
                }} style={{ color: transcodeMode > 0 ? 'var(--accent-primary)' : 'white', display: 'flex', alignItems: 'center', gap: '4px' }} title={transcodeMode === 1 ? 'Fix Audio: ON' : transcodeMode === 2 ? 'Fix Video & Audio: ON' : 'Transcoder (Click to cycle Audio/Video fixes)'}>
                  <Headphones size={24} />
                  {transcodeMode === 1 && <span style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px', color: 'var(--accent-primary)' }}>AC3</span>}
                  {transcodeMode === 2 && <span style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px', color: 'var(--accent-primary)' }}>HEVC</span>}
                </button>

                <button className="control-btn drawer-btn" onClick={(e) => { e.stopPropagation(); toggleSleepTimer(e); }} style={{ color: sleepTimer > 0 ? 'var(--accent-primary)' : 'white', display: 'flex', alignItems: 'center', gap: '4px' }} title={sleepTimer > 0 ? `Sleep Timer: ${sleepTimer}m` : 'Set Sleep Timer'}>
                  <Clock size={24} />
                  {sleepTimer > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px', color: 'var(--accent-primary)' }}>{sleepTimer}m</span>}
                </button>

                {onToggleMiniPlayer && (
                  <button className="control-btn drawer-btn" onClick={(e) => { e.stopPropagation(); if (document.fullscreenElement) { document.exitFullscreen(); } onToggleMiniPlayer(); }} title="Picture in Picture">
                    <PictureInPicture size={24} />
                  </button>
                )}
              </div>
            )}

            {/* Right: Actions & Volume */}
            <div className="console-right" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, justifyContent: 'flex-end' }}>
              {(!isLiveChannel || item?.isTimeshift) && (!userData?.spoilerFreeMode) && (
                <span style={{ fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums', marginRight: '0.5rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              )}

              <div className="volume-control" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button className="control-btn" onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <input 
                  type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} 
                  onChange={(e) => {
                    const newVol = parseFloat(e.target.value);
                    setVolume(newVol);
                    if (videoRef.current) {
                      videoRef.current.volume = newVol;
                      videoRef.current.muted = newVol === 0;
                      setIsMuted(newVol === 0);
                    }
                  }}
                  className="volume-slider" onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 0.5rem' }}></div>

              {(isLiveChannel && !item?.isTimeshift) && (
                <div className="elite-actions-pill">
                  <button className="elite-btn" onClick={(e) => { e.stopPropagation(); setActiveMenu(prev => prev === 'info' ? 'none' : 'info'); setIsOptionsDrawerOpen(false); }} style={{ color: activeMenu === 'info' ? 'var(--accent-primary)' : 'white' }} title="Info">
                    <Info size={20} />
                  </button>
                  <button className="elite-btn" onClick={(e) => { e.stopPropagation(); toggleFavorite(e); }} title="Favorite">
                    <Heart size={20} fill={isFavorite ? 'var(--accent-primary)' : 'none'} color={isFavorite ? 'var(--accent-primary)' : 'white'} />
                  </button>
                </div>
              )}

              {/* Quick Options Drawer Toggle */}
              <button 
                className="control-btn" 
                onClick={(e) => { e.stopPropagation(); setIsOptionsDrawerOpen(!isOptionsDrawerOpen); setActiveMenu('none'); }} 
                title="More Options"
                style={{ background: isOptionsDrawerOpen ? 'rgba(255,255,255,0.1)' : 'transparent', borderRadius: '8px', padding: '6px' }}
              >
                {isOptionsDrawerOpen ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
              </button>
              <button className="control-btn" onClick={toggleFullscreen} title="Fullscreen">
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* "Are You Still Watching?" Overlay */}
      {isIdle && !isBackgroundPlayer && (
        <div className="idle-overlay animate-fade-in" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
          <h2 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '2.5rem', fontWeight: 'bold', textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>Are you still watching?</h2>
          <button 
            className="primary-button" 
            onClick={(e) => { 
              e.stopPropagation(); 
              setIsIdle(false); 
              resetIdleTimer(); 
              if (videoRef.current) videoRef.current.play().catch(() => {}); 
            }}
            style={{ fontSize: '1.2rem', padding: '16px 32px', borderRadius: '50px', background: 'white', color: 'black', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Play fill="black" size={24} /> Yes, keep playing
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
