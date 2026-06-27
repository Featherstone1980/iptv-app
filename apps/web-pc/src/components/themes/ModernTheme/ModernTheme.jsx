import React, { useEffect, useMemo, useCallback, useState, startTransition } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import Sidebar from '../../layout/Sidebar';
import HomeTab from '../../layout/HomeTab';
import CategorySelector from '../../layout/CategorySelector';
import CategoryRow from '../../vod/CategoryRow';
import HeroBanner from '../../layout/HeroBanner';
import EPGGrid from '../../epg/EPGGrid';
import RecordingsTab from '../../recordings/RecordingsTab';
import LibraryTab from '../../layout/LibraryTab';
import DragDropHint from '../../layout/DragDropHint';
import { getLiveStreamUrl, getTimeshiftStreamUrl } from '../../../services/api';
import { format, differenceInMinutes } from 'date-fns';
import { Grid } from 'lucide-react';

const SortToggle = ({ sortOrder, setSortOrder }) => (
  <div className="sort-toggle-container" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', marginTop: '-1rem', paddingLeft: '112px' }}>
    <button 
      className={`sort-btn ${sortOrder === 'default' ? 'active' : ''}`}
      onClick={() => setSortOrder('default')}
    >
      Most Popular
    </button>
    <button 
      className={`sort-btn ${sortOrder === 'newest' ? 'active' : ''}`}
      onClick={() => setSortOrder('newest')}
    >
      New Releases
    </button>
    <button 
      className={`sort-btn ${sortOrder === 'rating' ? 'active' : ''}`}
      onClick={() => setSortOrder('rating')}
    >
      Top Rated
    </button>
  </div>
);

const ModernTheme = ({ userData }) => {
  const { 
    activeTab, 
    setActiveTab,
    setIsSettingsOpen,
    setIsSearchOpen,
    isLoading,
    isSessionUnlocked,
    vodCategories,
    seriesCategories,
    liveCategories,
    movies,
    series,
    liveChannels,
    activeVodCategoryId,
    activeSeriesCategoryId,
    activeLiveCategoryId,
    setActiveVodCategoryId,
    setActiveSeriesCategoryId,
    setActiveLiveCategoryId,
    handlePlay,
    setIsHomeDataLoaded,
    sortOrder,
    setSortOrder,
    epgLoadingProgress,
    setPinPromptCallback,
    activePlayers,
    setBackgroundPlayer,
    fetchVodStreams,
    fetchSeriesStreams,
    fetchLiveStreams,
    isHomeDataLoaded,
    connectionError,
    addDvrSchedule,
    addReminder,
    isMultiViewSelectMode,
    setMultiViewSelectMode
  } = useAppStore();

  const [dvrPrompt, setDvrPrompt] = useState(null);

  // Hoisted from renderContent to comply with React Rules of Hooks
  const getSortedItems = useCallback((items) => {
    if (sortOrder === 'default') return items;
    
    let sorted = [...items];
    if (sortOrder === 'newest') {
      sorted.sort((a, b) => b.added - a.added);
    } else if (sortOrder === 'rating') {
      sorted.sort((a, b) => {
        let ratingA = parseFloat(a.rating) || 0;
        if (!a.is_tmdb_rating && ratingA > 0 && ratingA <= 5) ratingA = ratingA * 2;
        else if (!a.is_tmdb_rating && ratingA === 0 && parseFloat(a.rating_5based) > 0) ratingA = parseFloat(a.rating_5based) * 2;
        
        let ratingB = parseFloat(b.rating) || 0;
        if (!b.is_tmdb_rating && ratingB > 0 && ratingB <= 5) ratingB = ratingB * 2;
        else if (!b.is_tmdb_rating && ratingB === 0 && parseFloat(b.rating_5based) > 0) ratingB = parseFloat(b.rating_5based) * 2;
        
        return ratingB - ratingA;
      });
    }
    return sorted;
  }, [sortOrder]);

  const safeVodCats = useMemo(() => {
    const hidden = userData.hiddenCategories || [];
    const locked = userData.lockedCategories || [];
    return vodCategories.filter(c => !hidden.includes(c.category_id) && (isSessionUnlocked || !locked.includes(c.category_id)));
  }, [isSessionUnlocked, vodCategories, userData.lockedCategories, userData.hiddenCategories]);

  const safeSeriesCats = useMemo(() => {
    const hidden = userData.hiddenCategories || [];
    const locked = userData.lockedCategories || [];
    return seriesCategories.filter(c => !hidden.includes(c.category_id) && (isSessionUnlocked || !locked.includes(c.category_id)));
  }, [isSessionUnlocked, seriesCategories, userData.lockedCategories, userData.hiddenCategories]);

  const safeMovies = useMemo(() => {
    const hidden = userData.hiddenCategories || [];
    const locked = userData.lockedCategories || [];
    return movies.filter(m => !hidden.includes(m.category_id) && (isSessionUnlocked || !locked.includes(m.category_id)));
  }, [isSessionUnlocked, movies, userData.lockedCategories, userData.hiddenCategories]);

  const safeSeries = useMemo(() => {
    const hidden = userData.hiddenCategories || [];
    const locked = userData.lockedCategories || [];
    return series.filter(s => !hidden.includes(s.category_id) && (isSessionUnlocked || !locked.includes(s.category_id)));
  }, [isSessionUnlocked, series, userData.lockedCategories, userData.hiddenCategories]);


  const sortedLiveChannels = useMemo(() => getSortedItems(liveChannels), [liveChannels, getSortedItems]);
  
  const filteredLiveChannels = useMemo(() => {
    let baseList = [];
    if (activeLiveCategoryId === 'favorites') {
      baseList = (userData.favorites || []).filter(f => f.type === 'live');
    } else {
      // liveChannels is the FULL catalog (loaded at startup for instant switching).
      // Filter by category_id client-side — '0' means "All Channels".
      const hidden = userData.hiddenCategories || [];
      const locked = userData.lockedCategories || [];
      const categoryList = (!activeLiveCategoryId || activeLiveCategoryId === '0')
        ? sortedLiveChannels
        : sortedLiveChannels.filter(c => String(c.category_id) === String(activeLiveCategoryId));
      baseList = categoryList.filter(c => !hidden.includes(c.category_id) && (isSessionUnlocked || !locked.includes(c.category_id)));
    }

    // The 'hideEmptyEpgChannels' feature is currently disabled because EPG data 
    // was moved from memory (epgData) to IndexedDB to prevent out-of-memory crashes.
    // Filtering 10,000 channels asynchronously on every render is too slow.
    return baseList;
  }, [sortedLiveChannels, activeLiveCategoryId, userData.favorites, isSessionUnlocked, userData.lockedCategories, userData.hiddenCategories]);

  const handleEPGPlay = useCallback((channel, program) => {
    const now = new Date();
    if (program && program.end < now && channel.tv_archive) {
      const startStr = format(program.start, 'yyyy-MM-dd:HH-mm');
      const durationMins = differenceInMinutes(program.end, program.start);
      const timeshiftUrl = getTimeshiftStreamUrl(channel.id, startStr, durationMins);
      handlePlay({
        ...channel,
        type: 'live',
        url: timeshiftUrl,
        isTimeshift: true
      });
    } else if (program && program.start > now) {
      setDvrPrompt({ channel, program });
    } else {
      handlePlay({...channel, type: 'live'});
    }
  }, [handlePlay]);

  const handleEPGHover = useCallback((channel) => {
    // Only set background player when no active player is open
    if (!activePlayers || activePlayers.length === 0) {
      setBackgroundPlayer({
        url: channel.url || getLiveStreamUrl(channel.id),
        title: channel.name,
        item: { ...channel, type: 'live' }
      });
    }
  }, [activePlayers, setBackgroundPlayer]);

  const handleReorderLiveFavorites = useCallback((newLiveFavs) => {
    if (!userData || !userData.reorderFavorites) return;
    const otherFavs = (userData.favorites || []).filter(f => f.type !== 'live');
    userData.reorderFavorites([...newLiveFavs, ...otherFavs]);
  }, [userData]);

  const handleCategoryChange = (type, categoryId) => {
    if (userData.lockedCategories.includes(categoryId) && !isSessionUnlocked) {
      setPinPromptCallback(() => () => {
        useAppStore.getState().setIsSessionUnlocked(true);
        if (type === 'live') setActiveLiveCategoryId(categoryId);
        if (type === 'vod') setActiveVodCategoryId(categoryId);
        if (type === 'series') setActiveSeriesCategoryId(categoryId);
      });
      return;
    }
    if (type === 'live') setActiveLiveCategoryId(categoryId);
    if (type === 'vod') setActiveVodCategoryId(categoryId);
    if (type === 'series') setActiveSeriesCategoryId(categoryId);
  };


  // Fetch VOD Streams when activeVodCategoryId changes
  useEffect(() => {
    if (!activeVodCategoryId || activeTab !== 'movies') return;
    const timer = setTimeout(() => fetchVodStreams(activeVodCategoryId), 50);
    return () => clearTimeout(timer);
  }, [activeVodCategoryId, activeTab, fetchVodStreams]);

  // Fetch Series when activeSeriesCategoryId changes
  useEffect(() => {
    if (!activeSeriesCategoryId || activeTab !== 'series') return;
    const timer = setTimeout(() => fetchSeriesStreams(activeSeriesCategoryId), 50);
    return () => clearTimeout(timer);
  }, [activeSeriesCategoryId, activeTab, fetchSeriesStreams]);

  // Fetch Live Streams & EPG when activeLiveCategoryId changes
  useEffect(() => {
    if (!activeLiveCategoryId || activeTab !== 'live' || activeLiveCategoryId === 'favorites') return;
    const timer = setTimeout(() => fetchLiveStreams(activeLiveCategoryId, userData.enableCatchup !== false), 100);
    return () => clearTimeout(timer);
  }, [activeLiveCategoryId, activeTab, userData.enableCatchup, fetchLiveStreams]);


  const renderContent = () => {
    if (isLoading) {
      return <div className="content-container flex items-center justify-center"><h3>Loading Xtream Data...</h3></div>;
    }

    if (connectionError) {
      return (
        <div className="content-container flex flex-col items-center justify-center h-full">
          <h2 className="text-4xl font-black mb-4 text-red-500">Connection Failed</h2>
          <p className="text-xl opacity-70 max-w-lg text-center">{connectionError}</p>
        </div>
      );
    }

    if (activeTab === 'home') {

      return (
        <HomeTab 
          onPlay={handlePlay} 
          userData={userData} 
          movies={safeMovies} 
          series={safeSeries} 
          vodCategories={safeVodCats}
          seriesCategories={safeSeriesCats}
          onHomeDataLoaded={() => setIsHomeDataLoaded(true)}
        />
      );
    }

    if (activeTab === 'movies') {
      const hidden = userData.hiddenCategories || [];
      const locked = userData.lockedCategories || [];
      const sortedMovies = getSortedItems(movies.filter(m => !hidden.includes(m.category_id) && (isSessionUnlocked || !locked.includes(m.category_id))));
      const displayCats = vodCategories
        .filter(c => !hidden.includes(c.category_id))
        .map(c => ({
          ...c,
          category_name: (!isSessionUnlocked && locked.includes(c.category_id)) ? `🔒 ${c.category_name}` : c.category_name
        }));
      return (
        <div className="content-container animate-fade-in flex-col h-full">
          <div className="flex-1 overflow-y-auto pb-20 relative" style={{ zIndex: 10 }}>
            {sortedMovies.length > 0 && (
            <HeroBanner 
              item={sortedMovies[0]} 
              onPlay={handlePlay} 
              contextLabel={displayCats.find(c => c.category_id === activeVodCategoryId)?.category_name || "Movies"} 
            />
          )}
          
          <CategorySelector 
            categories={displayCats} 
            activeCategoryId={activeVodCategoryId} 
            onSelectCategory={(id) => handleCategoryChange('vod', id)} 
          />
          <SortToggle sortOrder={sortOrder} setSortOrder={setSortOrder} />
          
            {sortedMovies.length > 0 ? (
              <CategoryRow title={sortOrder === 'newest' ? "New Releases" : sortOrder === 'rating' ? "Top Rated" : "Movies"} items={sortedMovies} onPlay={handlePlay} userData={userData} />
            ) : (
              <div className="flex items-center justify-center h-full"><h4>No movies found in this category.</h4></div>
            )}
          </div>
        </div>
      );
    }
    
    if (activeTab === 'live') {
      const hidden = userData.hiddenCategories || [];
      const locked = userData.lockedCategories || [];
      const displayCats = [
        { category_id: 'favorites', category_name: 'My Favorites' },
        ...liveCategories
          .filter(c => !hidden.includes(c.category_id))
          .map(c => ({
            ...c,
            category_name: (!isSessionUnlocked && locked.includes(c.category_id)) ? `🔒 ${c.category_name}` : c.category_name
          }))
      ];

      return (
        <div className="content-container animate-fade-in flex-col h-full w-full">
          <div className="epg-section flex-grow" style={{ display: 'flex', flexDirection: 'column', paddingLeft: '80px', paddingRight: '2rem', paddingBottom: '2rem', paddingTop: '2rem', boxSizing: 'border-box', height: '100%' }}>
            {liveChannels.length > 0 ? (
              <>
              {activeTab === 'live' && activeLiveCategoryId === 'favorites' && filteredLiveChannels.length > 0 && userData?.activeProfile?.hasSeenDragDropHint !== true && (
                <div style={{ marginBottom: '16px' }}>
                  <DragDropHint onDismiss={() => userData.dismissDragDropHint()} />
                </div>
              )}
              {epgLoadingProgress >= -1 && epgLoadingProgress < 100 && (
                <div style={{ 
                  marginBottom: '16px', 
                  background: 'rgba(255,255,255,0.03)', 
                  borderRadius: '12px', 
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.2)'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'rgba(255,255,255,0.9)', letterSpacing: '0.02em' }}>
                        {epgLoadingProgress === -1 ? 'Initializing local EPG engine... (Parsing 700MB+ XMLTV file)' : 'Downloading & mapping EPG guide data...'}
                      </span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--accent-primary, #ffffff)' }}>
                        {epgLoadingProgress === -1 ? 'Please Wait' : `${epgLoadingProgress}%`}
                      </span>
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height: '6px', 
                      background: 'rgba(0,0,0,0.4)', 
                      borderRadius: '3px',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      <div 
                        style={{ 
                          width: epgLoadingProgress === -1 ? '30%' : `${epgLoadingProgress}%`,
                          height: '100%', 
                          background: 'linear-gradient(90deg, rgba(255,255,255,0.4), #ffffff)',
                          borderRadius: '3px',
                          transition: epgLoadingProgress === -1 ? 'none' : 'width 0.3s ease-out',
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          animation: epgLoadingProgress === -1 ? 'epg-indeterminate 1.5s infinite linear' : 'none'
                        }} 
                      />
                    </div>
                  </div>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: 'spin 2s linear infinite'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ffffff' }}>
                      <line x1="12" y1="2" x2="12" y2="6"></line>
                      <line x1="12" y1="18" x2="12" y2="22"></line>
                      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                      <line x1="2" y1="12" x2="6" y2="12"></line>
                      <line x1="18" y1="12" x2="22" y2="12"></line>
                      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                    </svg>
                  </div>
                </div>
              )}
              <EPGGrid 
                channels={filteredLiveChannels} 
                categoryId={activeLiveCategoryId}
                enableCatchup={userData.enableCatchup !== false}
                timeFormat={userData.timeFormat || '12h'}
                onPlay={handleEPGPlay} 
                onHoverChannel={handleEPGHover}
                enableMultiView={userData.enableMultiView !== false}
                showEpgNowLine={userData.showEpgNowLine !== false}
                showEpgProgressFill={userData.showEpgProgressFill !== false}
                showEpgLiveDot={userData.showEpgLiveDot !== false}
                epgNowLineColor={userData.epgNowLineColor}
                epgProgressFillColor={userData.epgProgressFillColor}
                isFavoritesCategory={activeLiveCategoryId === 'favorites'}
                onReorderFavorites={handleReorderLiveFavorites}
                userData={userData}
                epgLoadingProgress={epgLoadingProgress}
                categorySelector={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CategorySelector 
                      categories={displayCats} 
                      activeCategoryId={activeLiveCategoryId} 
                      onSelectCategory={(id) => handleCategoryChange('live', id)} 
                      compact={true}
                    />
                    <button 
                      onClick={() => setMultiViewSelectMode(!isMultiViewSelectMode)}
                      title="Launch Multi-View"
                      style={{ 
                        background: isMultiViewSelectMode ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        color: 'white', 
                        padding: '8px', 
                        borderRadius: '8px', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        transition: 'background 0.2s'
                      }}
                    >
                      <Grid size={18} />
                    </button>
                  </div>
                }
              />
              </>
            ) : (
              <div className="flex items-center justify-center h-full"><h4>No channels found in this category.</h4></div>
            )}
          </div>
        </div>
      );
    }

    if (activeTab === 'series') {
      const hidden = userData.hiddenCategories || [];
      const locked = userData.lockedCategories || [];
      const sortedSeries = getSortedItems(series.filter(s => !hidden.includes(s.category_id) && (isSessionUnlocked || !locked.includes(s.category_id))));
      const displayCats = seriesCategories
        .filter(c => !hidden.includes(c.category_id))
        .map(c => ({
          ...c,
          category_name: (!isSessionUnlocked && locked.includes(c.category_id)) ? `🔒 ${c.category_name}` : c.category_name
        }));
      return (
        <div className="content-container animate-fade-in flex-col h-full">
          <div className="flex-1 overflow-y-auto pb-20 relative" style={{ zIndex: 10 }}>
            {sortedSeries.length > 0 && (
            <HeroBanner 
              item={sortedSeries[0]} 
              onPlay={handlePlay} 
              contextLabel={displayCats.find(c => c.category_id === activeSeriesCategoryId)?.category_name || "Series"} 
            />
          )}

          <CategorySelector 
            categories={displayCats} 
            activeCategoryId={activeSeriesCategoryId} 
            onSelectCategory={(id) => handleCategoryChange('series', id)} 
          />
          <SortToggle sortOrder={sortOrder} setSortOrder={setSortOrder} />

            {sortedSeries.length > 0 ? (
              <CategoryRow title={sortOrder === 'newest' ? "New Releases" : sortOrder === 'rating' ? "Top Rated" : "Series"} items={sortedSeries} onPlay={handlePlay} userData={userData} />
            ) : (
              <div className="flex items-center justify-center h-full"><h4>No series found in this category.</h4></div>
            )}
          </div>
        </div>
      );
    }
    
    if (activeTab === 'recordings') {
      return <RecordingsTab />;
    }

    if (activeTab === 'library') {
      return <LibraryTab userData={userData} onPlay={handlePlay} />;
    }
  };

  return (
    <div className="app-container flex h-screen overflow-hidden bg-background text-text">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        activeProfile={userData?.activeProfile ? {
           name: userData.activeProfile.name || userData.credentials?.username || 'User',
           avatar: userData.activeProfile.avatar || (userData.credentials?.username ? userData.credentials.username.charAt(0).toUpperCase() : 'U')
        } : null}
        onLogout={() => {
           userData.logoutProfile();
        }}
      />
      <main className="main-content relative">
        <div key={activeTab} className="h-full w-full">
          {renderContent()}
        </div>
      </main>

      {/* DVR Schedule Prompt Modal */}
      {dvrPrompt && (
        <ScheduleModal 
          dvrPrompt={dvrPrompt} 
          onClose={() => setDvrPrompt(null)} 
          onScheduleDvr={addDvrSchedule} 
          onScheduleReminder={addReminder} 
        />
      )}
    </div>
  );
};

const ScheduleModal = ({ dvrPrompt, onClose, onScheduleDvr, onScheduleReminder }) => {
  const [actionType, setActionType] = useState('record'); // 'record', 'autotune', 'remind'
  const [prePad, setPrePad] = useState(3); // minutes
  const [postPad, setPostPad] = useState(3); // minutes
  const [playAudio, setPlayAudio] = useState(() => localStorage.getItem('iptv_remind_audio') !== 'false');
  const [showBanner, setShowBanner] = useState(() => localStorage.getItem('iptv_remind_banner') !== 'false');
  const [recurrence, setRecurrence] = useState('none'); // 'none', 'daily', 'weekdays', 'weekly'
  const [retention, setRetention] = useState('all'); // 'all', 'last_1', 'last_3', 'last_5'
  
  const handleSave = () => {
    const startMs = dvrPrompt.program.start.getTime();
    const endMs = dvrPrompt.program.end.getTime();
    const paddedStart = startMs - (prePad * 60000);
    const paddedEnd = endMs + (postPad * 60000);

    if (actionType === 'record') {
      onScheduleDvr({
        url: getLiveStreamUrl(dvrPrompt.channel.id),
        title: `${dvrPrompt.channel.name} - ${dvrPrompt.program.title}`,
        startTime: paddedStart,
        endTime: paddedEnd,
        recurrence,
        retention
      });
    } else {
      localStorage.setItem('iptv_remind_audio', playAudio);
      localStorage.setItem('iptv_remind_banner', showBanner);
      
      onScheduleReminder({
        channel: dvrPrompt.channel,
        programTitle: dvrPrompt.program.title,
        startTime: paddedStart,
        type: actionType,
        playAudio,
        showBanner
      });
      if (Notification.permission !== "granted") {
        Notification.requestPermission();
      }
    }
    onClose();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(10px)' }}>
      <div style={{ backgroundColor: '#1a1b26', padding: '2rem', borderRadius: '12px', maxWidth: '450px', width: '100%', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: 'white' }}>Schedule Action</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
          Configure action for <strong style={{ color: 'white' }}>{dvrPrompt.program.title}</strong> on <strong style={{ color: 'white' }}>{dvrPrompt.channel.name}</strong>.
        </p>

        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={() => setActionType('record')}
            style={{ flex: 1, padding: '0.75rem 0.5rem', borderRadius: '8px', border: actionType === 'record' ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)', backgroundColor: actionType === 'record' ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.4)', color: actionType === 'record' ? '#fca5a5' : 'rgba(255,255,255,0.6)', fontWeight: actionType === 'record' ? 'bold' : '500', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Record
          </button>
          <button 
            onClick={() => setActionType('autotune')}
            style={{ flex: 1, padding: '0.75rem 0.5rem', borderRadius: '8px', border: actionType === 'autotune' ? '2px solid #8b5cf6' : '1px solid rgba(255,255,255,0.1)', backgroundColor: actionType === 'autotune' ? 'rgba(139,92,246,0.2)' : 'rgba(0,0,0,0.4)', color: actionType === 'autotune' ? '#c4b5fd' : 'rgba(255,255,255,0.6)', fontWeight: actionType === 'autotune' ? 'bold' : '500', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Auto-Tune
          </button>
          <button 
            onClick={() => setActionType('remind')}
            style={{ flex: 1, padding: '0.75rem 0.5rem', borderRadius: '8px', border: actionType === 'remind' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)', backgroundColor: actionType === 'remind' ? 'rgba(59,130,246,0.2)' : 'rgba(0,0,0,0.4)', color: actionType === 'remind' ? '#93c5fd' : 'rgba(255,255,255,0.6)', fontWeight: actionType === 'remind' ? 'bold' : '500', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Remind
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: '500' }}>{actionType === 'record' ? 'Start Early By' : 'Trigger Early By'}</label>
            <select 
              value={prePad} 
              onChange={(e) => setPrePad(Number(e.target.value))}
              style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '8px', outline: 'none' }}
            >
              <option value={0}>Exact Time</option>
              <option value={1}>1 Minute</option>
              <option value={2}>2 Minutes</option>
              <option value={3}>3 Minutes</option>
              <option value={5}>5 Minutes</option>
            </select>
          </div>
          
          {actionType === 'record' && (
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: '500' }}>End Late By</label>
              <select 
                value={postPad} 
                onChange={(e) => setPostPad(Number(e.target.value))}
                style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '8px', outline: 'none' }}
              >
                <option value={0}>Exact Time</option>
                <option value={1}>1 Minute</option>
                <option value={2}>2 Minutes</option>
                <option value={3}>3 Minutes</option>
                <option value={5}>5 Minutes</option>
                <option value={10}>10 Minutes</option>
              </select>
            </div>
          )}
        </div>

        {actionType === 'record' && (
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: '500' }}>Recurrence</label>
              <select 
                value={recurrence} 
                onChange={(e) => setRecurrence(e.target.value)}
                style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '8px', outline: 'none' }}
              >
                <option value="none">Once</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays (Mon-Fri)</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            
            <div style={{ flex: 1, opacity: recurrence === 'none' ? 0.3 : 1, pointerEvents: recurrence === 'none' ? 'none' : 'auto', transition: 'all 0.2s' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: '500' }}>Keep at Most</label>
              <select 
                value={retention} 
                onChange={(e) => setRetention(e.target.value)}
                style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '8px', outline: 'none' }}
              >
                <option value="all">All Episodes</option>
                <option value="last_1">Last 1 Episode</option>
                <option value="last_3">Last 3 Episodes</option>
                <option value="last_5">Last 5 Episodes</option>
              </select>
            </div>
          </div>
        )}

        {actionType === 'remind' && (
          <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', marginBottom: '0.75rem' }}>Notification Settings</h3>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={playAudio} 
                onChange={(e) => setPlayAudio(e.target.checked)}
                style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer', accentColor: '#3b82f6' }}
              />
              <span style={{ color: 'white', fontSize: '0.875rem' }}>Play Audio Chime</span>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showBanner} 
                onChange={(e) => setShowBanner(e.target.checked)}
                style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer', accentColor: '#3b82f6' }}
              />
              <span style={{ color: 'white', fontSize: '0.875rem' }}>Show In-App Banner</span>
            </label>
          </div>
        )}

        <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>Target Start</span>
            <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: '500' }}>{format(new Date(dvrPrompt.program.start.getTime() - (prePad * 60000)), "h:mm a")}</span>
          </div>
          {actionType === 'record' && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>Target End</span>
              <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: '500' }}>{format(new Date(dvrPrompt.program.end.getTime() + (postPad * 60000)), "h:mm a")}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={onClose} 
            style={{ flex: 1, padding: '0.75rem 1rem', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            style={{ flex: 1, padding: '0.75rem 1rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModernTheme;

// Add console log at the end of ModernTheme.jsx 
// Actually, let's just edit ModernTheme.jsx to log those values.
