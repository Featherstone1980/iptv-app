import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import ModernTheme from '../themes/ModernTheme/ModernTheme';
import VideoPlayer from '../player/VideoPlayer';
import PinPromptModal from './PinPromptModal';
import SeriesOverlay from '../vod/SeriesOverlay';
import MovieOverlay from '../vod/MovieOverlay';
import GlobalSearchOverlay from './GlobalSearchOverlay';
import SettingsModal from './SettingsModal';
import SplashScreen from './SplashScreen';
import ContextMenu from './ContextMenu';

const LayoutManager = ({ userData }) => {
  const [showSplash, setShowSplash] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);
  const [hideMultiViewTutorial, setHideMultiViewTutorial] = useState(false);
  const [prevGlobalVolume, setPrevGlobalVolume] = useState(1);

  const { 
    isHomeDataLoaded, 
    isLoading,
    fetchInitialCategories,
    activePlayers,
    primaryAudioPlayerId,
    setPrimaryAudioPlayerId,
    removeMultiViewPlayer,
    isMiniPlayer,
    setIsMiniPlayer,
    closePlayer,
    handlePlay,
    globalVolume,
    setGlobalVolume,
    playEpisodeHandler,
    launchMovie,
    epgData,
    pinPromptCallback,
    setPinPromptCallback,
    activeSeries,
    setActiveSeries,
    activeMovie,
    setActiveMovie,
    isSearchOpen,
    setIsSearchOpen,
    isSessionUnlocked,
    isSettingsOpen,
    setIsSettingsOpen,
    vodCategories,
    seriesCategories,
    liveCategories,
    setBackgroundPlayer,
    isMultiViewSelectMode
  } = useAppStore();

  // Initial Load (Categories only)
  useEffect(() => {
    const hasProvider = userData && userData.providers && userData.providers.length > 0;
    if (hasProvider || (userData && userData.credentials)) {
      if (userData.startupTab && useAppStore.getState().activeTab === 'home') {
        useAppStore.getState().setActiveTab(userData.startupTab);
      }
      fetchInitialCategories();
    }
  }, [userData?.credentials, userData?.providers, userData?.startupTab]);

  // Auto-Hide Adult Categories
  useEffect(() => {
    if (liveCategories?.length > 0 || vodCategories?.length > 0 || seriesCategories?.length > 0) {
      if (userData && userData.processNewCategories) {
        userData.processNewCategories([
          ...(liveCategories || []),
          ...(vodCategories || []),
          ...(seriesCategories || [])
        ]);
      }
    }
  }, [liveCategories, vodCategories, seriesCategories, userData]);

  // Background fetch for global series catalog to track new episodes
  useEffect(() => {
    if (userData && userData.favorites && userData.favorites.length > 0 && !useAppStore.getState().globalSeriesCatalog) {
      import('../../services/api').then(({ getSeries }) => {
        getSeries(0).then(data => {
          if (data) useAppStore.getState().setGlobalSeriesCatalog(data);
        }).catch(e => console.error("Error fetching global series catalog", e));
      });
    }
  }, [userData]);

  // Apply Theme Color to CSS variables
  useEffect(() => {
    if (userData && userData.themeColor) {
      document.documentElement.style.setProperty('--accent-primary', userData.themeColor);
      document.documentElement.style.setProperty('--accent-secondary', userData.themeColor);
      document.documentElement.style.setProperty('--accent-color', userData.themeColor);
    }
  }, [userData?.themeColor]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Toast Listener
  useEffect(() => {
    const handleToast = (e) => {
      setToastMessage(e.detail);
      setTimeout(() => setToastMessage(null), 8000);
    };
    window.addEventListener('show-toast', handleToast);
    return () => window.removeEventListener('show-toast', handleToast);
  }, []);

  // Reminder Auto-Tune Monitor
  useEffect(() => {
    const playChime = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch(e) { console.warn("AudioContext not supported", e); }
    };

    const interval = setInterval(() => {
      const now = Date.now();
      const { reminders, removeReminder, handlePlay } = useAppStore.getState();
      
      reminders.forEach(r => {
        // If the start time is reached (trigger up to 1m after)
        if (now >= r.startTime && now <= r.startTime + 60000) {
          
          if (r.type === 'autotune') {
            // Play the live channel
            handlePlay({ ...r.channel, type: 'live' });
            if (Notification.permission === "granted") {
              new Notification("Program Starting!", {
                body: `Auto-tuning to ${r.channel.name} for ${r.programTitle}`
              });
            }
          } else if (r.type === 'remind') {
            // Native OS Notification
            if (Notification.permission === "granted") {
              new Notification("Reminder", {
                body: `${r.programTitle} is starting now on ${r.channel.name}!`
              });
            }
            // Custom Audio
            if (r.playAudio) {
              playChime();
            }
            // In-App Toast
            if (r.showBanner) {
              window.dispatchEvent(new CustomEvent('show-toast', { 
                detail: { title: "Reminder", body: `${r.programTitle} is starting now on ${r.channel.name}!`, channel: r.channel } 
              }));
            }
          }
          
          // Remove the reminder so it doesn't trigger again
          removeReminder(r.id);
        } else if (now > r.startTime + 60000) {
          // Expired reminder
          removeReminder(r.id);
        }
      });
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {showSplash && (
        <SplashScreen 
          isDataLoaded={!isLoading && isHomeDataLoaded} 
          onComplete={() => setShowSplash(false)} 
        />
      )}
      
      {/* Dynamic Theme Renderer */}
      <ModernTheme userData={userData} />

      {/* Global Toast Banner */}
      {toastMessage && (
        <div style={{ position: 'fixed', top: '2rem', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(59,130,246,0.95)', backdropFilter: 'blur(10px)', color: 'white', padding: '1rem 1.5rem', borderRadius: '12px', zIndex: 99999, display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', animation: 'slideDown 0.3s ease-out' }}>
          <div>
            <h4 style={{ margin: 0, fontWeight: 'bold', fontSize: '1rem' }}>{toastMessage.title}</h4>
            <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.9 }}>{toastMessage.body}</p>
          </div>
          <button 
            onClick={() => {
              setToastMessage(null);
              if(toastMessage.channel) {
                useAppStore.getState().handlePlay({ ...toastMessage.channel, type: 'live' });
              }
            }}
            style={{ backgroundColor: 'white', color: '#3b82f6', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Watch Now
          </button>
        </div>
      )}

      {/* Global Overlays */}
      <ContextMenu userData={userData} />
      
      {!hideMultiViewTutorial && isMultiViewSelectMode && localStorage.getItem('seen_multiview_tooltip') !== 'true' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#1a1b26', padding: '2.5rem', borderRadius: '16px', border: '1px solid var(--accent-primary)', maxWidth: '500px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <h2 style={{ color: 'white', margin: '0 0 1rem 0', fontSize: '1.75rem' }}>Welcome to Multi-View! 📺</h2>
            <ul style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'left', lineHeight: '1.6', marginBottom: '1.5rem', paddingLeft: '1.5rem', fontSize: '1.05rem' }}>
              <li style={{marginBottom: '0.5rem'}}><strong style={{color: 'var(--accent-primary)'}}>Add up to 4 Channels</strong> by clicking the grid icon next to the category dropdown, then selecting channels.</li>
              <li style={{marginBottom: '0.5rem'}}><strong style={{color: 'var(--accent-primary)'}}>Double-Click</strong> the grid to expand it to full-screen or minimize it to the corner.</li>
              <li style={{marginBottom: '0.5rem'}}><strong style={{color: 'var(--accent-primary)'}}>Single-Click</strong> any video to tune into its audio track.</li>
              <li><strong style={{color: 'var(--accent-primary)'}}>Hover</strong> over a video and click the red 'X' to close it.</li>
            </ul>
            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem' }}>You can disable the Multi-View feature in the App Settings at any time.</p>
            <button 
              onClick={() => {
                localStorage.setItem('seen_multiview_tooltip', 'true');
                setHideMultiViewTutorial(true);
              }}
              style={{ background: 'var(--accent-primary)', color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem' }}
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {activePlayers && activePlayers.length > 0 && (
        <div className={`player-overlay animate-fade-in ${isMiniPlayer ? 'mini' : ''}`}>
          {/* Removed global mini player overlay to allow individual cell clicks */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: activePlayers.length === 1 ? '1fr' : '1fr 1fr',
            gridTemplateRows: activePlayers.length === 1 ? '1fr' : activePlayers.length === 2 ? 'auto' : '1fr 1fr',
            alignContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%',
            gap: '0px',
            background: 'black'
          }}>
            {activePlayers.map((player) => (
              <div 
                className="multi-view-cell"
                key={player.url} 
                style={{ 
                  position: 'relative', 
                  width: '100%', 
                  height: activePlayers.length === 1 ? '100%' : 'auto',
                  aspectRatio: activePlayers.length === 1 ? 'auto' : '16/9',
                  border: 'none',
                  transition: 'border 0.2s ease-in-out'
                }}
              >
                <style>{`
                  .multi-view-cell .multi-view-header { opacity: 0; transition: opacity 0.2s ease-in-out; }
                  .multi-view-cell:hover .multi-view-header { opacity: 1; }
                `}</style>
                {/* Multi-view Header for context */}
                <div 
                  className="multi-view-header"
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    padding: '8px 16px',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
                    zIndex: 10,
                    display: (activePlayers.length === 1 && !isMiniPlayer) ? 'none' : 'flex',
                    justifyContent: 'space-between',
                    pointerEvents: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', pointerEvents: 'auto' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', textShadow: '1px 1px 2px black' }}>{player.title}</span>
                    {primaryAudioPlayerId === (player.item?.stream_id || player.url) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {globalVolume === 0 ? (
                          <VolumeX 
                            size={16} color="var(--accent-primary)" 
                            style={{ filter: 'drop-shadow(1px 1px 2px black)', cursor: 'pointer' }} 
                            onClick={(e) => { e.stopPropagation(); setGlobalVolume(prevGlobalVolume || 1); }}
                          />
                        ) : (
                          <Volume2 
                            size={16} color="var(--accent-primary)" 
                            style={{ filter: 'drop-shadow(1px 1px 2px black)', cursor: 'pointer' }} 
                            onClick={(e) => { e.stopPropagation(); setPrevGlobalVolume(globalVolume); setGlobalVolume(0); }}
                          />
                        )}
                        {activePlayers.length === 1 && isMiniPlayer && (
                          <input 
                            type="range" min="0" max="1" step="0.05"
                            value={globalVolume}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setGlobalVolume(val);
                              if (val > 0) setPrevGlobalVolume(val);
                            }}
                            title="Volume"
                            style={{ width: '60px', height: '4px', cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeMultiViewPlayer(player.url); }}
                    style={{ pointerEvents: 'auto', background: 'rgba(255,0,0,0.5)', border: 'none', borderRadius: '50%', color: 'white', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >×</button>
                </div>
                <VideoPlayer 
                  url={player.url} 
                  nextEpisodeItem={player.nextEpisodeItem}
                  onPlayNext={(nextObj) => {
                    if (nextObj && nextObj.ep) {
                      playEpisodeHandler(nextObj.ep, nextObj.seriesInfo, nextObj.seasonNum, nextObj.episodesMap);
                    } else if (nextObj) {
                      handlePlay(nextObj);
                    }
                  }}
                  title={player.title} 
                  item={player.item}
                  epgData={epgData}
                  autoPlay={true}
                  muted={primaryAudioPlayerId !== (player.item?.stream_id || player.url)}
                  onClose={activePlayers.length === 1 ? closePlayer : () => removeMultiViewPlayer(player.url)}
                  isMiniPlayer={isMiniPlayer || activePlayers.length > 1}
                  onToggleMiniPlayer={() => setIsMiniPlayer(!isMiniPlayer)}
                  onPlay={handlePlay}
                  userData={userData}
                  onProgress={(progress, duration) => {
                    if (player.item) {
                      if (player.item.type === 'live') {
                        userData.addRecentChannel(player.item);
                      } else {
                        userData.updateContinueWatching(player.item, progress, duration);
                      }
                    }
                  }}
                />
                
                {/* Click Catcher for Multi-View (allows selecting audio and maximizing without triggering video pause) */}
                {(activePlayers.length > 1 || isMiniPlayer) && (
                  <div 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPrimaryAudioPlayerId(player.item?.stream_id || player.url);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      useAppStore.getState().setIsMiniPlayer(!isMiniPlayer);
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Master Volume Control for Multi-View */}
          {activePlayers.length > 1 && !isMiniPlayer && (
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(10px)',
              padding: '12px 24px',
              borderRadius: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              zIndex: 100,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              {globalVolume === 0 ? (
                <VolumeX 
                  size={20} color="white" 
                  style={{ cursor: 'pointer' }}
                  onClick={() => setGlobalVolume(prevGlobalVolume || 1)}
                />
              ) : (
                <Volume2 
                  size={20} color="white" 
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setPrevGlobalVolume(globalVolume); setGlobalVolume(0); }}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '1px' }}>Master Volume</span>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05" 
                  value={globalVolume} 
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setGlobalVolume(val);
                    if (val > 0) setPrevGlobalVolume(val);
                  }}
                  style={{ width: '150px', cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* PIN Prompt Modal */}
      {pinPromptCallback && (
        <PinPromptModal 
          expectedPin={userData.pinCode}
          onClose={() => setPinPromptCallback(null)}
          onSuccess={() => {
            pinPromptCallback();
            setPinPromptCallback(null);
          }}
        />
      )}

      {/* Series Details Overlay */}
      {activeSeries && (
        <SeriesOverlay 
          series={activeSeries} 
          onClose={() => setActiveSeries(null)}
          onPlayEpisode={playEpisodeHandler}
          onPlay={handlePlay}
          userData={userData}
        />
      )}

      {/* Movie Details Overlay */}
      {activeMovie && (
        <MovieOverlay 
          movie={activeMovie} 
          onClose={() => setActiveMovie(null)} 
          onPlay={launchMovie} 
          userData={userData} 
        />
      )}
      
      {/* Search Overlay */}
      {isSearchOpen && (
        <GlobalSearchOverlay 
          onClose={() => setIsSearchOpen(false)}
          onPlay={handlePlay}
          userData={userData}
          isSessionUnlocked={isSessionUnlocked}
          isHidden={activePlayers && activePlayers.length > 0}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)} 
          userData={userData} 
          vodCategories={vodCategories}
          seriesCategories={seriesCategories}
          liveCategories={liveCategories}
        />
      )}
    </>
  );
};

export default LayoutManager;
