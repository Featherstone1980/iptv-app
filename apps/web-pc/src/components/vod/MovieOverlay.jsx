import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Play, X, Heart, Star, Clock, Calendar, CheckCircle, User } from 'lucide-react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { getVodInfo, getProxiedImageUrl } from '../../services/api';
import { getTmdbMovieInfo, cleanTitle } from '../../services/tmdb';
import CategoryRow from './CategoryRow';
import './MovieOverlay.css';

const MovieOverlay = ({ movie, onClose, onPlay, userData }) => {
  const [movieInfo, setMovieInfo] = useState(movie);
  const [isLoading, setIsLoading] = useState(true);
  
  const { ref, focusSelf } = useFocusable({
    focusKey: 'MOVIE_OVERLAY',
    trackChildren: true,
    isFocusBoundary: true,
  });

  const isFavorite = userData && userData.isFavorite ? userData.isFavorite(movie.stream_id || movie.id) : false;
  const progress = userData && userData.getProgress ? userData.getProgress(movie.stream_id || movie.id) : null;
  const isResume = progress && progress.duration > 0 && progress.progress < progress.duration * 0.95;
  const progressPercent = progress && progress.duration ? (progress.progress / progress.duration) * 100 : 0;

  useEffect(() => {
    focusSelf();
  }, [focusSelf]);

  useEffect(() => {
    const fetchInfo = async () => {
      setIsLoading(true);
      const data = await getVodInfo(movie.stream_id || movie.id);
      
      let enrichedInfo = data && data.info ? { ...movie, ...data.info } : movie;
      setMovieInfo(enrichedInfo);
      setIsLoading(false);

      try {
        let titleToSearch = enrichedInfo.name || enrichedInfo.title;
        let yearToSearch = enrichedInfo.year || enrichedInfo.released;
        let imdbId = enrichedInfo.imdb_id || enrichedInfo.tmdb_id;

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
          if (!yearToSearch) yearToSearch = extractedYear;
        }

        const tmdbData = await getTmdbMovieInfo(titleToSearch, yearToSearch, imdbId);
        
        if (tmdbData) {
          setMovieInfo(prev => ({
            ...prev,
            plot: prev.plot && prev.plot.length > 20 ? prev.plot : tmdbData.plot,
            poster: prev.poster || prev.cover || tmdbData.poster,
            backdrop_path: tmdbData.backdrop ? [tmdbData.backdrop] : prev.backdrop_path,
            rating: tmdbData.rating || prev.rating,
            cast: tmdbData.cast?.length > 0 ? tmdbData.cast : prev.cast,
            similar: tmdbData.similar || []
          }));
        }
      } catch (err) {
        console.error("Failed to load TMDB info", err);
      }
    };
    fetchInfo();
  }, [movie]);

  const toggleFavorite = () => {
    if (userData && userData.toggleFavorite) {
      userData.toggleFavorite({
        ...movieInfo,
        id: movieInfo.stream_id || movieInfo.id,
        type: 'movie'
      });
    }
  };

  if (isLoading) {
    return (
      <div className="movie-overlay loading">
        <div className="spinner">Loading Movie Details...</div>
      </div>
    );
  }

  const bgImage = (movieInfo.backdrop_path && movieInfo.backdrop_path.length > 0)
    ? movieInfo.backdrop_path[0]
    : movieInfo.poster || movieInfo.stream_icon;

  let displayTitle = movieInfo.name || movieInfo.title || "Movie";
  if (typeof displayTitle === 'string') {
    displayTitle = displayTitle.replace(/\(\d{4}\)/, '').trim();
  }

  const rating = parseFloat(movieInfo.rating) || (parseFloat(movieInfo.rating_5based) * 2) || 0;
  const runtime = movieInfo.duration || movieInfo.runtime;
  const year = movieInfo.year || movieInfo.released;
  
  // Cast can be an array of objects from TMDB, or a string from the IPTV provider
  const isTmdbCast = Array.isArray(movieInfo.cast) && movieInfo.cast.length > 0;
  const isIptvCast = typeof movieInfo.cast === 'string' && movieInfo.cast.length > 0;

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
              {runtime && <span className="glass-pill">{runtime} min</span>}
              {rating > 0 && (
                <span className="glass-pill highlight">
                  <Star size={14} fill="currentColor" /> {rating.toFixed(1)}
                </span>
              )}
              <span className="glass-pill hd-badge">4K HDR</span>
            </div>
            
            <p className="cinematic-plot">
              {movieInfo.plot || movieInfo.description || "No plot description available."}
            </p>
            
            <div className="cinematic-actions">
              <div className="action-group">
                <button className="btn-cinematic-play" onClick={() => onPlay(movieInfo)}>
                  <Play fill="currentColor" size={24} />
                  <span>{isResume ? 'Resume' : 'Play Movie'}</span>
                </button>
                {isResume && (
                  <div className="resume-progress-bar">
                    <div className="resume-progress-fill" style={{ width: `${progressPercent}%` }}></div>
                  </div>
                )}
              </div>
              
              <button 
                className={`btn-cinematic-secondary ${isFavorite ? 'active' : ''}`}
                onClick={toggleFavorite}
              >
                {isFavorite ? <CheckCircle size={20} /> : <Heart size={20} />}
                <span>{isFavorite ? 'Saved' : 'Save'}</span>
              </button>
            </div>
          </div>
          
          <div className="movie-extras-section">
            {isTmdbCast && (
              <div className="cast-row-container">
                <h3 className="section-title">Cast</h3>
                <div className="cast-row">
                  {movieInfo.cast.map(actor => (
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
            
            {isIptvCast && !isTmdbCast && (
              <div className="info-text-block">
                <h4>Cast</h4>
                <p>{movieInfo.cast}</p>
              </div>
            )}
            
            {movieInfo.director && (
              <div className="info-text-block">
                <h4>Director</h4>
                <p>{movieInfo.director}</p>
              </div>
            )}
            
            {movieInfo.genre && (
              <div className="info-text-block">
                <h4>Genres</h4>
                <p>{movieInfo.genre}</p>
              </div>
            )}
          </div>
          
          {movieInfo.similar && movieInfo.similar.length > 0 && (
            <div className="similar-movies-section">
              <CategoryRow 
                title="More Like This" 
                items={movieInfo.similar} 
                onPlay={(item) => {
                  // If playing a similar movie from TMDB, we might not have the stream_id.
                  // We would ideally search our IPTV library for it, but for now we just pass it to onPlay
                  onPlay(item);
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

export default MovieOverlay;
