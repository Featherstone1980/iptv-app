import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { format, addMinutes, isBefore, isAfter, differenceInMinutes, differenceInSeconds } from 'date-fns';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Play, RotateCcw, Grid } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { epgDb } from '../../db/epgDatabase';
import SmartChannelLogo from './SmartChannelLogo';
import './EPGGrid.css';

const ProgramCell = React.memo(({ program, renderStart, renderEnd, timelineStart, calculateWidth, calculateLeft, onPlay, channel, onFocus, isLive, isCatchup, currentTime, timeFormat, showEpgProgressFill, showEpgLiveDot, epgProgressFillColor }) => {
  const { ref, focused } = useFocusable({
    onEnterPress: () => onPlay(channel, program),
    onFocus: () => onFocus(channel, program)
  });

  const timeFmt = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';

  const durationMins = (renderEnd.getTime() - renderStart.getTime()) / 60000;
  const isSmallBlock = durationMins <= 15;

  let liveProgressStyle = { width: '0%', opacity: 0.15 };
  if (isLive && currentTime) {
    let fillEnd = currentTime.getTime() > renderEnd.getTime() ? renderEnd : currentTime;
    liveProgressStyle = { width: `calc(${calculateWidth(renderStart, fillEnd)} - 4px)`, opacity: 0.15 };
    if (epgProgressFillColor) {
      liveProgressStyle.background = epgProgressFillColor;
    }
  }

  return (
    <div
      ref={ref}
      className={`program-cell ${focused ? 'focused' : ''} ${isLive ? 'is-live' : ''} ${isCatchup ? 'is-catchup' : ''} ${isSmallBlock ? 'is-small' : ''}`}
      style={{
        width: calculateWidth(renderStart, renderEnd),
        left: calculateLeft(renderStart, timelineStart)
      }}
      title={`${program.title}\n${format(program.start, timeFmt)} - ${format(program.end, timeFmt)}`}
      onClick={() => onPlay(channel, program)}
      onMouseEnter={() => onFocus(channel, program)}
    >
      <div className="program-content">
        {isLive && showEpgProgressFill && (
          <div className="program-progress-fill" style={liveProgressStyle}></div>
        )}
        <div className="program-text-wrapper">
          <h5 className="program-title">
            {isCatchup && <RotateCcw size={12} className="catchup-icon" style={{ marginRight: '4px', display: 'inline-block', opacity: 0.7 }} />}
            {program.title}
          </h5>
          <span className="program-time">
            {format(program.start, timeFmt)} - {format(program.end, timeFmt)}
          </span>
        </div>
        {isLive && showEpgLiveDot && <div className="live-indicator-dot"></div>}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.isLive && nextProps.isLive && prevProps.currentTime !== nextProps.currentTime) {
    return false;
  }
  return (
    prevProps.program.id === nextProps.program.id &&
    prevProps.isLive === nextProps.isLive &&
    prevProps.renderStart.getTime() === nextProps.renderStart.getTime() &&
    prevProps.renderEnd.getTime() === nextProps.renderEnd.getTime() &&
    prevProps.showEpgProgressFill === nextProps.showEpgProgressFill &&
    prevProps.showEpgLiveDot === nextProps.showEpgLiveDot &&
    prevProps.epgProgressFillColor === nextProps.epgProgressFillColor
  );
});

const EPGGrid = ({ channels, epgData = {}, onPlay, categorySelector, onHoverChannel, enableCatchup = true, timeFormat = '12h', isFavoritesCategory, onReorderFavorites, enableMultiView = true, showEpgNowLine = true, showEpgProgressFill = true, showEpgLiveDot = true, epgNowLineColor = '', epgProgressFillColor = '' }) => {
  const loadMoreLiveChannels = useAppStore(state => state.loadMoreLiveChannels);
  const gridRef = useRef(null);
  const channelColRef = useRef(null);
  const nowLineRef = useRef(null);

  const openContextMenu = useAppStore(state => state.openContextMenu);
  const isMultiViewSelectMode = useAppStore(state => state.isMultiViewSelectMode);
  const multiViewSelectionQueue = useAppStore(state => state.multiViewSelectionQueue);
  const toggleMultiViewSelection = useAppStore(state => state.toggleMultiViewSelection);
  const launchMultiViewGrid = useAppStore(state => state.launchMultiViewGrid);
  const setMultiViewSelectMode = useAppStore(state => state.setMultiViewSelectMode);

  const timeFmt = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';

  const [timeline, setTimeline] = useState([]);
  const [focusedItem, setFocusedItem] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  
  const ROW_HEIGHT = 80;
  const VIEWPORT_HEIGHT = typeof window !== 'undefined' ? (window.innerHeight || 1500) : 1500;
  const BUFFER_ROWS = 15; 
  
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const endIndex = Math.min(Math.max(0, channels.length - 1), Math.floor((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + BUFFER_ROWS);
  const visibleChannels = channels.slice(startIndex, endIndex + 1);

  // Debounce the visible channels so we don't spam IndexedDB during fast scrolls
  const [debouncedVisibleChannels, setDebouncedVisibleChannels] = useState(visibleChannels);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedVisibleChannels(visibleChannels);
    }, 30);
    return () => clearTimeout(timer);
  }, [startIndex, endIndex, channels]); // Re-run when visible window or channels change

  // SINGLE Dexie subscription for VISIBLE channels (prevents OOM and DB crashes).
  // Build a keyed Map<channelId, program[]> once and pass it down to rows as a prop.
  // We query by BOTH stream_id AND epg_channel_id so we catch programs stored under either key.
  const channelQueryIds = useMemo(() => {
    const ids = new Set();
    debouncedVisibleChannels.forEach(c => {
      if (c.stream_id) ids.add(String(c.stream_id));
      if (c.id) ids.add(String(c.id));
      if (c.epg_channel_id) ids.add(String(c.epg_channel_id));
    });
    return Array.from(ids);
  }, [debouncedVisibleChannels]);

  // Use the joined string as the stable dep key — re-queries whenever channel IDs actually change.
  // We use a ref to do content-equality so a new channels array reference (from a parent re-render)
  // doesn't trigger a full Dexie query if the actual IDs are unchanged.
  const prevIdsKeyRef = useRef('');
  const channelIdsKey = useMemo(() => {
    const next = channelQueryIds.join(',');
    if (next === prevIdsKeyRef.current) return prevIdsKeyRef.current; // stable reference
    prevIdsKeyRef.current = next;
    return next;
  }, [channelQueryIds]);

  const epgCacheRef = useRef(new Map());
  const [cacheVersion, setCacheVersion] = useState(0);

  // Continually clear empty cache entries for visible channels as background sync progresses
  const epgLoadingProgress = useAppStore(state => state.epgLoadingProgress);
  useEffect(() => {
    if (epgLoadingProgress > 0) {
      if (epgLoadingProgress === 100) {
        epgCacheRef.current.clear();
        setCacheVersion(v => v + 1);
      } else {
        // While syncing, check if any currently visible channels have an empty cache.
        // If they do, delete them from the cache so the fetch effect will re-query Dexie!
        const ids = channelIdsKey.split(',').filter(Boolean);
        let changed = false;
        for (const id of ids) {
          if (epgCacheRef.current.has(id) && epgCacheRef.current.get(id).length === 0) {
            epgCacheRef.current.delete(id);
            changed = true;
          }
        }
        if (changed) setCacheVersion(v => v + 1);
      }
    }
  }, [epgLoadingProgress, channelIdsKey]);

  useEffect(() => {
    let isMounted = true;
    const ids = channelIdsKey.split(',').filter(Boolean);
    
    // Only query Dexie for channels we haven't loaded into memory yet
    const missingIds = ids.filter(id => !epgCacheRef.current.has(id));
    if (missingIds.length === 0) return;

    epgDb.programs.where('channel_id').anyOf(missingIds).toArray().then(data => {
      if (!isMounted) return;
      
      const newMap = new Map();
      for (const p of data) {
        const key = p.channel_id;
        if (!newMap.has(key)) newMap.set(key, []);
        newMap.get(key).push({
          ...p,
          start: new Date(p.start_timestamp),
          end: new Date(p.stop_timestamp)
        });
      }
      
      let changed = false;
      for (const id of missingIds) {
        if (newMap.has(id)) {
          const progs = newMap.get(id);
          progs.sort((a, b) => a.start_timestamp - b.start_timestamp);
          epgCacheRef.current.set(id, progs);
        } else {
          epgCacheRef.current.set(id, []);
        }
        changed = true;
      }
      
      if (changed) {
        setCacheVersion(v => v + 1);
      }
    }).catch(err => {
      console.error('Failed to load EPG from Dexie', err);
    });

    return () => { isMounted = false; };
  }, [channelIdsKey, cacheVersion]);
  
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const handleDragStart = useCallback((idx) => {
    setDraggedIdx(idx);
  }, []);

  const handleDragEnter = useCallback((idx) => {
    setDragOverIdx(idx);
  }, []);

  const handleDragEnd = useCallback((e) => {
    if (e) e.preventDefault();
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, []);

  const handleDrop = useCallback((dropIdx) => {
    if (draggedIdx === null || draggedIdx === dropIdx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    const newChannels = [...channels];
    const draggedItem = newChannels[draggedIdx];
    newChannels.splice(draggedIdx, 1);
    newChannels.splice(dropIdx, 0, draggedItem);
    
    if (onReorderFavorites) {
      onReorderFavorites(newChannels);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, [draggedIdx, channels, onReorderFavorites]);
  
  const hoverTimeoutRef = useRef(null);
  const hasSetInitialFocus = useRef(false);

  const handleFocus = useCallback((ch, prog) => {
    setFocusedItem({ channel: ch, program: prog });
    
    if (onHoverChannel) {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        onHoverChannel(ch);
      }, 1500); // 1.5 seconds delay before tuning background video
    }
  }, [onHoverChannel]);

  // Generate timeline
  useEffect(() => {
    const now = new Date();
    // Start timeline 72 hours back if Catchup is enabled, otherwise 2 hours back
    const startOffsetHours = enableCatchup ? 72 : 2;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - startOffsetHours, 0, 0);
    const times = [];
    // 96 hours total if catchup (192 slots), otherwise 26 hours total (52 slots)
    const slots = enableCatchup ? 192 : 52;
    for (let i = 0; i < slots; i++) {
      times.push(addMinutes(start, i * 30));
    }
    setTimeline(prev => {
      if (prev.length === times.length && prev[0]?.getTime() === times[0]?.getTime()) {
        return prev;
      }
      return times;
    });
    
    // Set initial focus to the first channel's currently airing program — only once
    if (channels.length > 0 && !hasSetInitialFocus.current) {
      hasSetInitialFocus.current = true;
      const firstChannel = channels[0];
      const channelEpg = epgCacheRef.current.get(String(firstChannel.stream_id || firstChannel.id)) || [];
      const currentProgram = channelEpg.find(p => isBefore(p.start, now) && isAfter(p.end, now));
      setFocusedItem({ channel: firstChannel, program: currentProgram || null });
    }
  }, [channels, enableCatchup, epgCacheRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update current time every minute for the Now line
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // update every minute
    return () => clearInterval(interval);
  }, []);

  // Reset scroll position when switching categories (first channel changes)
  const prevFirstChannelRef = useRef(channels[0]?.id);
  useEffect(() => {
    if (channels[0]?.id !== prevFirstChannelRef.current) {
      prevFirstChannelRef.current = channels[0]?.id;
      if (gridRef.current) gridRef.current.scrollTop = 0;
      if (gridRef.current) gridRef.current.scrollLeft = 0;
      if (channelColRef.current) channelColRef.current.scrollTop = 0;
      setScrollTop(0);
      setScrollLeftState(0);
    }
  }, [channels]);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (timeline.length > 0 && gridRef.current) {
      const offsetMs = currentTime.getTime() - timeline[0].getTime();
      const offsetMins = offsetMs / (1000 * 60);
      const pixelsPerMin = 200 / 30;
      const leftPos = offsetMins * pixelsPerMin;
      
      // Center the line slightly by subtracting half the viewport width
      const centerOffset = leftPos - 300; 
      if (centerOffset > 0) {
        gridRef.current.scrollLeft = centerOffset;
      }
    }
  }, [timeline]);

  const scrollRafRef = useRef(null);
  const handleScroll = useCallback((e) => {
    if (!e || !e.target) return;
    if (scrollRafRef.current) return;
    
    // Read layout properties BEFORE rAF to avoid layout thrashing
    const newScrollTop = e.target.scrollTop;
    const scrollLeft = e.target.scrollLeft;
    const scrollHeight = e.target.scrollHeight;
    const clientHeight = e.target.clientHeight;
    
    scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        setScrollTop(newScrollTop);
        
        if (scrollHeight - newScrollTop - clientHeight < 1000) {
           if (typeof loadMoreLiveChannels === 'function') loadMoreLiveChannels();
        }
      setScrollLeftState(prev => {
        if (Math.abs(scrollLeft - prev) > 5) return scrollLeft;
        return prev;
      });
    });
  }, [loadMoreLiveChannels]);

  // visibleChannels calculation moved to the top of the component for the debounced query

  const calculateWidth = useCallback((start, end) => {
    const durationMins = (end.getTime() - start.getTime()) / 60000;
    return (durationMins * (200 / 30)) + 'px';
  }, []);

  const calculateLeft = useCallback((start, timelineStart) => {
    if (!timelineStart) return '0px';
    const offsetMins = (start.getTime() - timelineStart.getTime()) / 60000;
    return (offsetMins * (200 / 30)) + 'px';
  }, []);

  const jumpToTime = (hoursOffset) => {
    if (timeline.length > 0 && gridRef.current) {
      const targetTime = new Date();
      targetTime.setHours(targetTime.getHours() + hoursOffset);
      const offsetMs = targetTime.getTime() - timeline[0].getTime();
      const offsetMins = offsetMs / (1000 * 60);
      const pixelsPerMin = 200 / 30;
      const leftPos = offsetMins * pixelsPerMin;
      const centerOffset = Math.max(0, leftPos - 300);
      gridRef.current.scrollTo({ left: centerOffset, behavior: 'smooth' });
    }
  };

  const getNowLineLeft = () => {
    if (timeline.length === 0) return '0px';
    return calculateLeft(currentTime, timeline[0]);
  };

  return (
    <div className="epg-wrapper">
      
      <div className="epg-details-panel">
        {focusedItem ? (
          <>
            <div className="epg-details-logo">
              {focusedItem.channel.logo ? (
                <SmartChannelLogo
                  src={focusedItem.channel.logo}
                  alt={focusedItem.channel.name}
                  style={{ width: '80px', height: '80px', flexShrink: 0 }}
                />
              ) : (
                <div className="epg-details-logo-placeholder">{focusedItem.channel.name}</div>
              )}
            </div>
            <div className="epg-details-info">
              <h2 className="epg-details-title">
                {focusedItem.program ? focusedItem.program.title : focusedItem.channel.name}
              </h2>
              <div className="epg-details-meta">
                <span className="epg-meta-channel">CH {focusedItem.channel.num} - {focusedItem.channel.name}</span>
                {focusedItem.program && (
                  <span className="epg-meta-time">
                    {format(focusedItem.program.start, timeFmt)} - {format(focusedItem.program.end, timeFmt)}
                  </span>
                )}
                <span className="epg-badge-hd">HD</span>
              </div>
            </div>
            
            <div className="epg-details-extra">
              <p className="epg-details-desc">
                {focusedItem.program ? (focusedItem.program.description || 'No description available for this program.') : 'Select a program to view details.'}
              </p>
            </div>
          </>
        ) : (
          <div className="epg-details-empty">Hover over a program to view details</div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative', overflow: 'hidden' }}>
        
        <div className="epg-grid-content-wrapper" style={{ overflowY: 'auto', overflowX: 'auto', flex: 1, position: 'relative', display: 'block' }} ref={gridRef} onScroll={handleScroll}>
          
          <div className="epg-timeline-header-container" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', width: `${timeline.length * 200 + 250}px`, height: '60px' }}>
            <div className="timeline-container" style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
              
              <div className="epg-top-left-corner" style={{ width: '250px', flexShrink: 0, position: 'sticky', left: 0, zIndex: 110, background: 'rgba(15, 15, 20, 0.85)', backdropFilter: 'blur(10px)', borderRight: '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 0.5rem', boxShadow: '10px 0 20px -5px rgba(0,0,0,0.5)' }}>
                {categorySelector}
              </div>
              
              <div style={{ position: 'relative', display: 'flex', flex: 1 }}>
                {showEpgNowLine && timeline.length > 0 && (
                  <div 
                    className="epg-now-line" 
                    style={{ 
                      left: getNowLineLeft(),
                      backgroundColor: epgNowLineColor || 'var(--accent-primary)',
                      '--now-line-color': epgNowLineColor || 'var(--accent-primary)'
                    }}
                  >
                    <div className="epg-now-line-head" style={{ backgroundColor: epgNowLineColor || 'var(--accent-primary)' }}></div>
                  </div>
                )}

                {timeline.map((time, idx) => (
                  <div key={idx} className="timeline-slot">
                    {format(time, timeFmt)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="epg-virtual-list" style={{ position: 'relative', width: `${timeline.length * 200 + 250}px`, height: `${channels.length * ROW_HEIGHT}px` }}>
            
            {showEpgNowLine && timeline.length > 0 && (
              <div 
                className="epg-now-line" 
                style={{ 
                  left: `calc(250px + ${getNowLineLeft()})`, 
                  zIndex: 10,
                  backgroundColor: epgNowLineColor || 'var(--accent-primary)',
                  '--now-line-color': epgNowLineColor || 'var(--accent-primary)'
                }}
              >
                <div className="epg-now-line-head" style={{ backgroundColor: epgNowLineColor || 'var(--accent-primary)' }}></div>
              </div>
            )}

            {visibleChannels.map((channel, i) => {
              const actualIndex = startIndex + i;
              const ch = channels[actualIndex];
              const cidStream = String(ch?.stream_id || ch?.id || '');
              const cidEpg = ch?.epg_channel_id ? String(ch.epg_channel_id) : null;
              const rowEpg = epgCacheRef.current.get(cidStream)
                || (cidEpg ? epgCacheRef.current.get(cidEpg) : null)
                || (epgData[ch?.stream_id || ch?.id] || []);

              return (
                <Row 
                  key={`prog-${channel.id}`}
                  index={actualIndex}
                  style={{ position: 'absolute', top: `${actualIndex * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px`, width: '100%' }}
                  channels={channels}
                  channelEpg={rowEpg}
                  timeline={timeline}
                  currentTime={currentTime}
                  scrollLeftState={scrollLeftState}
                  onPlay={onPlay}
                  handleFocus={handleFocus}
                  onHoverChannel={onHoverChannel}
                  calculateWidth={calculateWidth}
                  calculateLeft={calculateLeft}
                  timeFormat={timeFormat}
                  isFavoritesCategory={isFavoritesCategory}
                  draggedIdx={draggedIdx}
                  dragOverIdx={dragOverIdx}
                  onDragStart={handleDragStart}
                  onDragEnter={handleDragEnter}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                  enableMultiView={enableMultiView}
                  showEpgProgressFill={showEpgProgressFill}
                  showEpgLiveDot={showEpgLiveDot}
                  epgProgressFillColor={epgProgressFillColor}
                  isMultiViewSelectMode={isMultiViewSelectMode}
                  multiViewSelectionQueue={multiViewSelectionQueue}
                  toggleMultiViewSelection={toggleMultiViewSelection}
                  openContextMenu={openContextMenu}
                />
              );
            })}
          </div>
        </div>
      </div>
      {isMultiViewSelectMode && (
        <div className="animate-fade-in" style={{ position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(20, 20, 25, 0.95)', backdropFilter: 'blur(20px)', padding: '1rem 2rem', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', gap: '2rem', zIndex: 999999 }}>
          <div style={{ color: 'white', fontSize: '1.1rem' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}>{multiViewSelectionQueue.length}/4</span> Channels Selected
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={() => setMultiViewSelectMode(false)}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Cancel
            </button>
            <button 
              disabled={multiViewSelectionQueue.length === 0}
              onClick={() => launchMultiViewGrid()}
              style={{ background: 'var(--accent-primary)', border: 'none', color: 'white', padding: '0.75rem 2rem', borderRadius: '16px', cursor: multiViewSelectionQueue.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', opacity: multiViewSelectionQueue.length > 0 ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Grid size={18} /> Launch Grid
            </button>
          </div>
        </div>
      )}

      {enableCatchup && (
        <div className="animate-fade-in" style={{ position: 'absolute', bottom: '30px', right: '30px', zIndex: 200, display: 'flex', gap: '8px', background: 'rgba(20,20,25,0.9)', backdropFilter: 'blur(12px)', borderRadius: '30px', padding: '10px 16px', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 10px 30px rgba(0,0,0,0.7)', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem', marginRight: '8px', opacity: 0.8 }}>TIME TRAVEL</span>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', marginRight: '4px' }}></div>
          <button onClick={() => jumpToTime(-72)} style={{ padding: '6px 14px', borderRadius: '16px', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.target.style.color='white'} onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.7)'}>3 Days Ago</button>
          <button onClick={() => jumpToTime(-48)} style={{ padding: '6px 14px', borderRadius: '16px', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.target.style.color='white'} onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.7)'}>2 Days Ago</button>
          <button onClick={() => jumpToTime(-24)} style={{ padding: '6px 14px', borderRadius: '16px', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.target.style.color='white'} onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.7)'}>Yesterday</button>
          <button onClick={() => jumpToTime(0)} style={{ padding: '6px 14px', borderRadius: '16px', background: 'var(--accent-primary)', color: 'white', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.2s', marginLeft: '4px' }}>LIVE</button>
        </div>
      )}
    </div>
  );
};

const Row = React.memo((props) => {
  const { index, style, channels, channelEpg, timeline, currentTime, scrollLeftState, onPlay, handleFocus, onHoverChannel, calculateWidth, calculateLeft, timeFormat, isFavoritesCategory, draggedIdx, dragOverIdx, onDragStart, onDragEnter, onDragEnd, onDrop, enableMultiView, showEpgProgressFill, showEpgLiveDot, epgProgressFillColor, isMultiViewSelectMode, multiViewSelectionQueue, toggleMultiViewSelection, openContextMenu } = props;
  const channel = channels[index];
  const isDragged = index === draggedIdx;
  const isDragOver = index === dragOverIdx;
  const isSelected = multiViewSelectionQueue.some(c => (c.id || c.stream_id) === (channel.id || channel.stream_id));

  const handleDragOver = (e) => {
    e.preventDefault();
    if (onDragEnter && index !== dragOverIdx) onDragEnter(index);
  };

  return (
    <div
      className={`grid-row-virtual ${isDragged ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
      style={{...style, display: 'flex', width: '100%', opacity: isDragged ? 0.5 : 1, transition: 'background 0.2s', background: isDragOver ? 'rgba(99, 102, 241, 0.2)' : 'transparent'}}
    >
      {/* STICKY CHANNEL BLOCK */}
      <div
        className="channel-slot"
        style={{
          position: 'sticky',
          left: 0,
          width: '250px',
          flexShrink: 0,
          height: '80px',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0 1rem',
          boxSizing: 'border-box',
          background: isSelected ? 'rgba(40, 40, 80, 0.95)' : 'rgb(15, 15, 20)',
          borderRight: isSelected ? '4px solid var(--accent-primary)' : '1px solid transparent',
          borderBottom: '1px solid rgba(255,255,255,0.02)',
          zIndex: 50,
          boxShadow: '10px 0 20px -5px rgba(0,0,0,0.5)',
          cursor: isFavoritesCategory && !isMultiViewSelectMode ? 'grab' : 'pointer'
        }}
        onClick={() => {
          if (isMultiViewSelectMode) { toggleMultiViewSelection(channel); }
          else { onPlay(channel, null); }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(e.clientX, e.clientY, channel, 'channel');
        }}
        draggable={isFavoritesCategory && !isMultiViewSelectMode}
        onDragStart={(e) => {
          if (isFavoritesCategory && onDragStart) {
            e.dataTransfer.effectAllowed = 'move';
            onDragStart(index);
          }
        }}
        onDragOver={isFavoritesCategory ? handleDragOver : undefined}
        onDrop={isFavoritesCategory ? () => onDrop(index) : undefined}
        onDragEnd={onDragEnd}
        onMouseEnter={() => {
          handleFocus(channel, null);
          const slot = document.querySelectorAll('.channel-slot')[index];
          if (slot) slot.classList.add('hovered');
        }}
        onMouseLeave={() => {
          const slot = document.querySelectorAll('.channel-slot')[index];
          if (slot) slot.classList.remove('hovered');
        }}
      >
        {isMultiViewSelectMode && (
          <div style={{ position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px', borderRadius: '50%', background: isSelected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)', border: isSelected ? 'none' : '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '12px' }}>
            {isSelected ? multiViewSelectionQueue.findIndex(c => (c.id || c.stream_id) === (channel.id || channel.stream_id)) + 1 : ''}
          </div>
        )}
        {channel.logo ? (
          <SmartChannelLogo src={channel.logo} alt={channel.name} className="epg-grid-channel-logo" style={{ width: '64px', height: '64px', flexShrink: 0 }} />
        ) : (
          <div className="epg-grid-channel-logo" style={{ background: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'black', fontWeight: '900', fontSize: '1.5rem', flexShrink: 0, width: '64px', height: '64px', boxShadow: '0 4px 10px rgba(0,0,0,0.4)' }}>
            {channel.name.charAt(0)}
          </div>
        )}
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent-primary)', opacity: 0.9 }}>CH {channel.num}</div>
          <div style={{ fontWeight: '600', fontSize: '1.05rem', color: isSelected ? 'var(--accent-primary)' : 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={channel.name}>
            {channel.name}
          </div>
        </div>
      </div>

      {/* Programs Area */}
      <div className="programs-container" style={{ position: 'relative', flex: 1, height: '100%' }}>
        <div className="program-cell empty" style={{ width: '100%', left: '0px', zIndex: 0 }} onClick={() => onPlay(channel, null)} onMouseEnter={() => handleFocus(channel, null)}>
          <div className="program-content" style={{ background: 'var(--bg-secondary)', borderColor: 'transparent' }}>
            {(!channelEpg || channelEpg.length === 0) && (
              <div className="program-text-wrapper">
                <h5 className="program-title" style={{ color: 'var(--text-muted)' }}>No Program Information Available</h5>
              </div>
            )}
          </div>
        </div>

        {(() => {
          if (!channelEpg || channelEpg.length === 0) return null;
          const timelineStart = timeline[0];
          if (!timelineStart) return null;
          const timelineEnd = timeline[timeline.length - 1];
          const PIXELS_PER_MIN = 200 / 30;
          const HORIZ_BUFFER_PX = 800;
          const CHANNEL_COL_WIDTH = 250;
          const viewLeft = scrollLeftState - HORIZ_BUFFER_PX;
          const viewRight = scrollLeftState + 1920 + HORIZ_BUFFER_PX;
          const visiblePrograms = [];

          for (let i = 0; i < channelEpg.length; i++) {
            const program = channelEpg[i];
            if (program.end.getTime() <= timelineStart.getTime() || program.start.getTime() >= timelineEnd.getTime()) continue;
            const renderStart = program.start.getTime() < timelineStart.getTime() ? timelineStart : program.start;
            const renderEnd = program.end.getTime() > timelineEnd.getTime() ? timelineEnd : program.end;
            const cellLeftPx = CHANNEL_COL_WIDTH + ((renderStart.getTime() - timelineStart.getTime()) / 60000) * PIXELS_PER_MIN;
            const cellRightPx = cellLeftPx + ((renderEnd.getTime() - renderStart.getTime()) / 60000) * PIXELS_PER_MIN;
            if (cellRightPx < viewLeft) continue;
            if (cellLeftPx > viewRight) break;
            const isLive = program.start.getTime() < currentTime.getTime() && program.end.getTime() > currentTime.getTime();
            const isCatchup = channel.tv_archive && program.start.getTime() < currentTime.getTime() && !isLive;
            visiblePrograms.push(
              <ProgramCell
                key={program.id}
                program={program}
                renderStart={renderStart}
                renderEnd={renderEnd}
                timelineStart={timelineStart}
                calculateWidth={calculateWidth}
                calculateLeft={calculateLeft}
                onPlay={onPlay}
                channel={channel}
                onFocus={(ch, prog) => handleFocus(ch, prog)}
                isLive={isLive}
                isCatchup={isCatchup}
                currentTime={currentTime}
                timeFormat={timeFormat}
                showEpgProgressFill={showEpgProgressFill}
                showEpgLiveDot={showEpgLiveDot}
                epgProgressFillColor={epgProgressFillColor}
              />
            );
          }
          return visiblePrograms;
        })()}
      </div>
    </div>
  );
}, (prev, next) => {
  // Only re-render on currentTime change if this row has a live or recently-live program.
  // This prevents all rows from re-rendering every 60s just because the clock ticked.
  if (prev.currentTime !== next.currentTime) {
    const now = next.currentTime.getTime();
    const hasLiveOrNearLive = (next.channelEpg || []).some(
      p => p.stop_timestamp > now - 120000 && p.start_timestamp < now + 120000
    );
    if (hasLiveOrNearLive) return false; // re-render needed
    return true; // no live program — skip re-render
  }
  return (
    prev.index === next.index &&
    prev.channelEpg === next.channelEpg &&
    prev.channels[prev.index]?.id === next.channels[next.index]?.id &&
    prev.scrollLeftState === next.scrollLeftState &&
    prev.timeline === next.timeline &&
    prev.isFavoritesCategory === next.isFavoritesCategory &&
    prev.draggedIdx === next.draggedIdx &&
    prev.dragOverIdx === next.dragOverIdx &&
    prev.isMultiViewSelectMode === next.isMultiViewSelectMode &&
    prev.multiViewSelectionQueue === next.multiViewSelectionQueue &&
    prev.showEpgProgressFill === next.showEpgProgressFill &&
    prev.timeFormat === next.timeFormat
  );
});

class EPGErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', padding: '20px', zIndex: 9999, position: 'relative', background: 'black' }}>
          <h2>EPGGrid Crashed!</h2>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function EPGGridWrapper(props) {
  return (
    <EPGErrorBoundary>
      <EPGGrid {...props} />
    </EPGErrorBoundary>
  );
}
