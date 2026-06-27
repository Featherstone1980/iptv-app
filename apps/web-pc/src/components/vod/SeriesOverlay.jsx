import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Play, X, Heart, Star, Calendar, CheckCircle, User } from 'lucide-react';
import { getSeriesInfo, getProxiedImageUrl } from '../../services/api';
import { getTmdbSeriesInfo, getTmdbSeasonInfo, cleanTitle } from '../../services/tmdb';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import CategoryRow from './CategoryRow';
import './MovieOverlay.css';
import './SeriesOverlay.css';

// Persist failed URLs across React re-mounts using sessionStorage
let _deadSet = null;
const getDeadImageUrls = () => {
  if (!_deadSet) {
    try {
      _deadSet = new Set(JSON.parse(sessionStorage.getItem('dead_img_urls') || '[]'));
    } catch (e) { _deadSet = new Set(); }
  }
  return _deadSet;
};
const markDead = (url) => {
  if (!url) return;
  const s = getDeadImageUrls();
  s.add(url);
  try { sessionStorage.setItem('dead_img_urls', JSON.stringify([...s].slice(-200))); } catch (e) {}
};

const EpisodeItem = ({ episode, seriesCover, tmdbThumbnail, onPlay, isWatched, onToggleWatched, progress }) => {
  const { ref, focused } = useFocusable({
    onEnterPress: () => onPlay(episode)
  });

  const dead = getDeadImageUrls();
  const pImg = getProxiedImageUrl(episode?.info?.movie_image);
  const pCov = getProxiedImageUrl(episode?.info?.cover);
  const pSer = getProxiedImageUrl(seriesCover);

  // Simplified 2-level fallback: provider image → TMDB thumbnail → series cover → null
  const getInitialSrc = () => {
    if (pImg && !dead.has(pImg)) return pImg;
    if (tmdbThumbnail && !dead.has(tmdbThumbnail)) return tmdbThumbnail;
    if (pCov && !dead.has(pCov)) return pCov;
    if (pSer && !dead.has(pSer)) return pSer;
    return null;
  };

  const [imgSrc, setImgSrc] = useState(getInitialSrc);

  useEffect(() => {
    setImgSrc(getInitialSrc());
  }, [episode, tmdbThumbnail, seriesCover]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleError = () => {
    if (imgSrc) markDead(imgSrc);
    // Walk through fallback chain
    if (imgSrc !== tmdbThumbnail && tmdbThumbnail && !dead.has(tmdbThumbnail)) {
      setImgSrc(tmdbThumbnail);
    } else if (imgSrc !== pCov && pCov && !dead.has(pCov)) {
      setImgSrc(pCov);
    } else if (imgSrc !== pSer && pSer && !dead.has(pSer)) {
      setImgSrc(pSer);
    } else {
      setImgSrc(null);
    }
  };

  return (
    <div
      ref={ref}
      className={`episode-item ${focused ? 'focused' : ''}`}
      onClick={() => onPlay(episode)}
    >
      <div className="episode-thumbnail">
        {imgSrc ? (
          <img src={imgSrc} alt="Episode" onError={handleError} loading="lazy" decoding="async" />
        ) : (
          <div className="episode-thumbnail-fallback" />
        )}
        <button className="play-btn-overlay">
          <Play size={20} fill="currentColor" />
        </button>
        {isWatched ? (
          <div className="progress-bar-container" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '6px', background: 'rgba(0,0,0,0.8)', zIndex: 10 }}>
            <div style={{ width: '100%', height: '100%', background: 'rgba(34,197,94,0.9)', transition: 'width 0.3s ease' }}></div>
          </div>
        ) : progress && progress.duration > 0 ? (
          <div className="progress-bar-container" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '6px', background: 'rgba(0,0,0,0.8)', zIndex: 10 }}>
            <div style={{ width: `${Math.min((progress.progress / progress.duration) * 100, 100)}%`, height: '100%', background: 'var(--accent-primary, #6366f1)', transition: 'width 0.3s ease', borderRadius: '0 4px 4px 0' }}></div>
          </div>
        ) : null}
      </div>
      <div className="episode-details">
        <div className="ep-header">
          <span className="episode-number">E{episode.episode_num}</span>
          <h4 className="episode-title">{episode.title || `Episode ${episode.episode_num}`}</h4>
        </div>
        <div className="episode-meta">
          <button 
            className={`watched-toggle-btn ${isWatched ? 'is-watched' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleWatched) onToggleWatched(episode.id);
            }}
            title={isWatched ? "Mark as Unwatched" : "Mark as Watched"}
          >
            <CheckCircle size={16} className={isWatched ? "icon-watched" : "icon-unwatched"} />
            <span>{isWatched ? 'Watched' : 'Mark Watched'}</span>
          </button>
          {episode.duration && <span className="episode-duration">{episode.duration}</span>}
        </div>
      </div>
    </div>
  );
};


const SeriesOverlay = ({ series, onClose, onPlayEpisode, onPlay, userData }) => {
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [episodes, setEpisodes] = useState({});
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tmdbSeasonData, setTmdbSeasonData] = useState({});
  
  const { ref, focusSelf } = useFocusable({
    focusKey: 'SERIES_OVERLAY',
    trackChildren: true,
    isFocusBoundary: true,
  });

  const isFavorite = userData && userData.isFavorite ? userData.isFavorite(series.series_id || series.id) : false;

  useEffect(() => {
    focusSelf();
  }, [focusSelf]);

  useEffect(() => {
    const fetchInfo = async () => {
      if (userData && userData.markSeriesAsViewed && series.last_modified) {
        userData.markSeriesAsViewed(series.series_id || series.id, series.last_modified);
      }

      setIsLoading(true);
      const data = await getSeriesInfo(series.series_id || series.id);
      
      let finalInfo = data && data.info ? { ...series, ...data.info } : series;

      if (data && data.episodes) {
        setSeriesInfo(finalInfo);
        setEpisodes(data.episodes);
        
        const seasonKeys = Object.keys(data.episodes).sort((a, b) => parseInt(a) - parseInt(b));
        setSeasons(seasonKeys);
        if (seasonKeys.length > 0) {
          const savedSeason = localStorage.getItem(`series_${series.series_id || series.id}_season`);
          if (savedSeason && seasonKeys.includes(savedSeason)) {
            setSelectedSeason(savedSeason);
          } else {
            setSelectedSeason(seasonKeys[0]);
          }
        }
      } else {
        setSeriesInfo(finalInfo);
      }
      setIsLoading(false);

      try {
        let titleToSearch = finalInfo.name || finalInfo.title;
        let imdbId = finalInfo.imdb_id || finalInfo.tmdb_id;
        
        let extractedYear = null;
        if (typeof titleToSearch === 'string') {
          titleToSearch = cleanTitle(titleToSearch);
          const parenMatch = titleToSearch.match(/\((\d{4})\)/);
          if (parenMatch) {
            extractedYear = parenMatch[1];
            titleToSearch = titleToSearch.replace(parenMatch[0], '').trim();
          } else {
            const nakedYearMatch = titleToSearch.match(/\b((?:19|20)\d{2})\s*$/);
            if (nakedYearMatch) {
              extractedYear = nakedYearMatch[1];
              titleToSearch = titleToSearch.replace(nakedYearMatch[0], '').trim();
            }
          }
        }

        const tmdbData = await getTmdbSeriesInfo(titleToSearch, imdbId);
        
        if (tmdbData) {
          setSeriesInfo(prev => ({
            ...prev,
            plot: prev.plot && prev.plot.length > 20 ? prev.plot : tmdbData.plot,
            cover: prev.cover || tmdbData.poster,
            backdrop_path: tmdbData.backdrop ? [tmdbData.backdrop] : prev.backdrop_path,
            rating: tmdbData.rating || prev.rating,
            cast: tmdbData.cast?.length > 0 ? tmdbData.cast : prev.cast,
            similar: tmdbData.similar || [],
            tmdbId: tmdbData.id
          }));
        }
      } catch (err) {
        console.error("Failed to load TMDB info for series", err);
      }
    };
    fetchInfo();
  }, [series]);

  useEffect(() => {
    if (seriesInfo?.tmdbId && selectedSeason) {
      getTmdbSeasonInfo(seriesInfo.tmdbId, selectedSeason).then(data => {
        if (data) setTmdbSeasonData(data);
      });
    }
  }, [seriesInfo?.tmdbId, selectedSeason]);

  const toggleFavorite = () => {
    if (userData && userData.toggleFavorite) {
      userData.toggleFavorite({
        ...seriesInfo,
        id: seriesInfo.series_id || seriesInfo.id,
        type: 'series'
      });
    }
  };

  const handlePlayNextEpisode = () => {
    if (!selectedSeason || !episodes[selectedSeason]) return;
    
    const currentEps = episodes[selectedSeason];
    const unwatched = currentEps.find(ep => !(userData && userData.isWatched && userData.isWatched(ep.id)));
    
    if (unwatched) {
      onPlayEpisode(unwatched, seriesInfo || series, selectedSeason, episodes);
    } else {
      onPlayEpisode(currentEps[0], seriesInfo || series, selectedSeason, episodes);
    }
  };

  if (isLoading) {
    return ReactDOM.createPortal(
      <div className="movie-overlay loading">
        <div className="spinner">Loading Series Details...</div>
      </div>
    , document.body);
  }

  const bgImage = (seriesInfo?.backdrop_path && seriesInfo.backdrop_path.length > 0)
    ? seriesInfo.backdrop_path[0]
    : seriesInfo?.cover || seriesInfo?.stream_icon;

  let displayTitle = seriesInfo?.name || seriesInfo?.title || "Series";
  if (typeof displayTitle === 'string') {
    displayTitle = displayTitle.replace(/\(\d{4}\)/, '').trim();
  }

  const rating = parseFloat(seriesInfo?.rating) || (parseFloat(seriesInfo?.rating_5based) * 2) || 0;
  const year = seriesInfo?.year || seriesInfo?.released;
  
  const currentEpisodesRaw = selectedSeason && episodes[selectedSeason] ? episodes[selectedSeason] : [];
  const currentEpisodes = currentEpisodesRaw.filter((ep, index, self) =>
    index === self.findIndex((t) => (
      t.episode_num === ep.episode_num
    ))
  );

  const isSeasonWatched = currentEpisodes.length > 0 && !currentEpisodes.some(ep => !(userData && userData.isWatched && userData.isWatched(ep.id)));
  
  const isTmdbCast = Array.isArray(seriesInfo?.cast) && seriesInfo.cast.length > 0;

  return ReactDOM.createPortal(
    <div className="movie-overlay" ref={ref}>
      <div className="overlay-bg cinematic-bg">
        {bgImage && <img src={getProxiedImageUrl(bgImage)} alt={displayTitle} />}
        <div className="cinematic-gradient"></div>
        <div className="cinematic-vignette"></div>
      </div>
      
      <div className="overlay-content-wrapper scrollable-content">
        <button className="btn-close glass-btn" onClick={onClose}>
          <X size={28} />
        </button>

        <div className="cinematic-layout">
          <div className="movie-hero-section">
            <h1 className="cinematic-title">{displayTitle}</h1>
            
            <div className="cinematic-meta">
              {year && <span className="glass-pill">{year}</span>}
              {seasons.length > 0 && <span className="glass-pill">{seasons.length} Seasons</span>}
              {rating > 0 && (
                <span className="glass-pill highlight">
                  <Star size={14} fill="currentColor" /> {rating.toFixed(1)}
                </span>
              )}
              <span className="glass-pill hd-badge">4K HDR</span>
            </div>
            
            <p className="cinematic-plot">
              {seriesInfo?.plot || seriesInfo?.description || "No plot description available."}
            </p>
            
            <div className="cinematic-actions" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-cinematic-play" onClick={handlePlayNextEpisode}>
                <Play fill="currentColor" size={24} />
                <span>Play Next Episode</span>
              </button>

              {seasons.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <select 
                      className="season-dropdown"
                      style={{ 
                        background: 'rgba(255,255,255,0.1)', 
                        border: '1px solid rgba(255,255,255,0.25)', 
                        color: 'white', 
                        padding: '14px 24px', 
                        borderRadius: '9999px', 
                        fontSize: '1.15rem', 
                        fontWeight: '600', 
                        cursor: 'pointer',
                        outline: 'none',
                        backdropFilter: 'blur(16px)'
                      }}
                      value={selectedSeason || ''}
                      onChange={(e) => {
                        setSelectedSeason(e.target.value);
                        localStorage.setItem(`series_${seriesInfo?.series_id || seriesInfo?.id}_season`, e.target.value);
                      }}
                    >
                      {seasons.map(s => (
                        <option key={s} value={s}>Season {s}</option>
                      ))}
                    </select>
                      <button 
                        className={`mark-season-watched-btn ${isSeasonWatched ? 'is-watched' : ''}`}
                        onClick={() => {
                          if (!selectedSeason || !episodes[selectedSeason]) return;
                          const ids = episodes[selectedSeason].map(ep => ep.id);
                          if (isSeasonWatched) {
                            if (userData?.unmarkMultipleAsWatched) userData.unmarkMultipleAsWatched(ids);
                          } else {
                            if (userData?.markMultipleAsWatched) userData.markMultipleAsWatched(ids);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '14px 24px',
                          background: isSeasonWatched ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.15)',
                          color: '#4ade80',
                          border: `1px solid rgba(34,197,94,${isSeasonWatched ? '0.6' : '0.3'})`,
                          borderRadius: '9999px',
                          fontSize: '1.15rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          backdropFilter: 'blur(16px)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isSeasonWatched ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.25)';
                          e.currentTarget.style.borderColor = isSeasonWatched ? 'rgba(34,197,94,0.8)' : 'rgba(34,197,94,0.5)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isSeasonWatched ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.15)';
                          e.currentTarget.style.borderColor = `rgba(34,197,94,${isSeasonWatched ? '0.6' : '0.3'})`;
                        }}
                        title={isSeasonWatched ? "Unmark Season as Watched" : "Mark Season as Watched"}
                      >
                        <CheckCircle size={20} fill={isSeasonWatched ? "currentColor" : "none"} />
                        <span>{isSeasonWatched ? 'Watched' : 'Mark Watched'}</span>
                      </button>
                </div>
              )}
              
              <button 
                className={`btn-cinematic-secondary ${isFavorite ? 'active' : ''}`}
                onClick={toggleFavorite}
              >
                {isFavorite ? <CheckCircle size={20} /> : <Heart size={20} />}
                <span>{isFavorite ? 'Saved' : 'Save'}</span>
              </button>
            </div>
          </div>
          
          <div className="movie-extras-section" style={{ gridTemplateColumns: '1fr', gap: '2rem' }}>
            
            <div className="seasons-container glass-panel">
              <div className="episodes-grid">
                {currentEpisodes.map((ep) => (
                  <EpisodeItem 
                    key={ep.id} 
                    episode={ep} 
                    seriesCover={seriesInfo?.cover}
                    tmdbThumbnail={tmdbSeasonData[ep.episode_num]}
                    isWatched={userData && userData.isWatched ? userData.isWatched(ep.id) : false}
                    onToggleWatched={userData && userData.toggleWatched ? userData.toggleWatched : null}
                    progress={userData && userData.getProgress ? userData.getProgress(ep.id) : null}
                    onPlay={() => onPlayEpisode(ep, seriesInfo || series, selectedSeason, episodes)} 
                  />
                ))}
              </div>
            </div>

            {isTmdbCast && (
              <div className="cast-row-container">
                <h3 className="section-title">Cast</h3>
                <div className="cast-row">
                  {seriesInfo.cast.map(actor => (
                    <div className="cast-card" key={actor.id}>
                      {actor.profile ? (
                        <img src={actor.profile} alt={actor.name} className="cast-avatar" />
                      ) : (
                        <div className="cast-avatar fallback"><User size={40} color="rgba(255,255,255,0.5)" /></div>
                      )}
                      <span className="cast-name">{actor.name}</span>
                      <span className="cast-character">{actor.character}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {seriesInfo?.genre && (
              <div className="info-text-block">
                <h4>Genres</h4>
                <p>{seriesInfo.genre}</p>
              </div>
            )}
          </div>
          
          {seriesInfo?.similar && seriesInfo.similar.length > 0 && (
            <div className="similar-movies-section">
              <CategoryRow 
                title="Similar Series" 
                items={seriesInfo.similar} 
                onPlay={(item) => {
                  if (onPlay) onPlay(item);
                }}
                userData={userData} 
                isLoading={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  , document.body);
};

export default SeriesOverlay;
