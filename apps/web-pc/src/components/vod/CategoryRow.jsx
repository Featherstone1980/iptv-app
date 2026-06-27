import React, { useState, useEffect, useRef } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { Heart, X, CheckCircle, Film, Play } from 'lucide-react';
import { getTmdbMovieInfo, getTmdbSeriesInfo, cleanTitle } from '../../services/tmdb';
import { getProxiedImageUrl } from '../../services/api';
import { getProceduralGradient, getInitials } from '../../utils/posterGenerator';
import './CategoryRow.css';

const MediaCard = ({ item, idx, onPlay, isFavorite, onToggleFavorite, progress, onRemove, isContinueWatching }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hasTriedFallback, setHasTriedFallback] = useState(false);
  const [posterSrc, setPosterSrc] = useState(item.poster || item.cover || item.stream_icon || item.logo || '');
  const [isVisible, setIsVisible] = useState(false); // deferred: effects only run once card enters viewport
  const tiltRafRef = useRef(null);                   // throttle 3D tilt recalcs to once per animation frame
  
  const activeProgress = progress || (item.progress !== undefined ? item : null);

  const { ref, focused } = useFocusable({
    onEnterPress: () => onPlay(item)
  });

  // WHY IntersectionObserver: without this, ALL 100+ cards run their image-probe and
  // TMDB-fallback useEffects simultaneously on mount — regardless of whether the user
  // has ever scrolled to them. That means hundreds of concurrent network requests and
  // React state updates, all competing with the scroll paint thread.
  // With this observer, the expensive effects only activate when the card enters the
  // visible area (+ 150px lookahead so images pre-load just before they appear).
  useEffect(() => {
    const el = ref.current;
    if (!el) { setIsVisible(true); return; } // Fallback: if ref not attached, run immediately
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '1200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    if (onToggleFavorite) onToggleFavorite(item);
  };

  const handleRemoveClick = (e) => {
    e.stopPropagation();
    if (onRemove) onRemove(item.stream_id || item.series_id || item.id);
  };

  // RAF throttle: fire tilt recalc at most once per animation frame.
  // Without this, every single mousemove event (fired at ~125Hz) causes getBoundingClientRect()
  // and CSS custom property writes — both of which can force a synchronous layout.
  const handleMouseMove = (e) => {
    if (tiltRafRef.current) return; // Already have a frame queued — skip this event entirely
    const card = e.currentTarget;
    const clientX = e.clientX;
    const clientY = e.clientY;
    tiltRafRef.current = requestAnimationFrame(() => {
      tiltRafRef.current = null;
      const rect = card.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const tiltX = ((centerY - y) / centerY) * 12;
      const tiltY = ((x - centerX) / centerX) * 12;
      card.style.setProperty('--tiltX', `${tiltX}deg`);
      card.style.setProperty('--tiltY', `${tiltY}deg`);
    });
  };

  const handleMouseLeave = (e) => {
    if (tiltRafRef.current) { cancelAnimationFrame(tiltRafRef.current); tiltRafRef.current = null; }
    const card = e.currentTarget;
    card.style.setProperty('--tiltX', '0deg');
    card.style.setProperty('--tiltY', '0deg');
  };

  let displayTitle = item.name || item.title;
  let displayMeta = item.year || item.group;

  if (item.type === 'series' && item.stream_id) {
    if (item.episode_label) {
      displayTitle = item.name || item.title;
      displayMeta = item.episode_label;
    } else if (item.title && item.title.includes(' - ')) {
      const firstHyphen = item.title.indexOf(' - ');
      displayTitle = item.title.substring(0, firstHyphen);
      displayMeta = item.title.substring(firstHyphen + 3);
    } else {
      displayMeta = 'Saved Episode';
    }
  }

  let extractedYear = null;
  if (typeof displayTitle === 'string') {
    // 1. Remove garbage tags like HD, FHD, 1080p, etc. first
    displayTitle = cleanTitle(displayTitle);

    // 2. Try to match (YYYY)
    const parenYearMatch = displayTitle.match(/\((\d{4})\)/);
    if (parenYearMatch) {
      extractedYear = parenYearMatch[1];
      displayTitle = displayTitle.replace(parenYearMatch[0], '').trim();
    } else {
      // 3. Try to match naked YYYY at the end of the string (e.g., "Avengers 1950")
      const endYearMatch = displayTitle.match(/\b((?:19|20)\d{2})\s*$/);
      if (endYearMatch) {
        extractedYear = endYearMatch[1];
        displayTitle = displayTitle.replace(endYearMatch[0], '').trim();
      }
    }
  }

  if (extractedYear && (item.type === 'movie' || item.type === 'series' || item.stream_type === 'movie')) {
    displayMeta = extractedYear;
  }

  let rating = parseFloat(item.rating) || 0;
  if (!item.is_tmdb_rating && rating > 0 && rating <= 5) rating = rating * 2;
  else if (!item.is_tmdb_rating && rating === 0 && parseFloat(item.rating_5based) > 0) rating = parseFloat(item.rating_5based) * 2;
  
  // Fallback to 0 if we can't parse anything
  if (isNaN(rating)) rating = 0;

  // Fetch from TMDB if the image is broken or missing
  useEffect(() => {
    if (!isVisible) return; // Wait until card is in viewport — prevents mass TMDB fetches on initial render
    if ((!posterSrc || imageError) && !hasTriedFallback) {
      setHasTriedFallback(true);
      const fetchFallback = async () => {
        try {
          const titleToSearch = displayTitle;
          const imdbId = item.imdb_id || item.tmdb_id;
          let tmdbData = null;
          
          if (item.type === 'movie' || item.stream_type === 'movie') {
            const yearToSearch = item.year || item.released || extractedYear;
            tmdbData = await getTmdbMovieInfo(titleToSearch, yearToSearch, imdbId);
          } else if (item.type === 'series' || item.series_id || item.type === 'series_episode') {
            tmdbData = await getTmdbSeriesInfo(titleToSearch, imdbId);
          }
          
          if (tmdbData && tmdbData.poster) {
            setPosterSrc(tmdbData.poster);
            setImageError(false); // Reset error to try rendering the new poster
          } else {
            // If TMDB also fails to find an image, mark it as error so it shows fallback text
            setImageError(true);
          }
        } catch (e) {
          console.error("TMDB Fallback failed for", displayTitle);
          setImageError(true);
        }
      };
      fetchFallback();
    }
  }, [isVisible, posterSrc, imageError, hasTriedFallback, item, displayTitle]);

  // Image load timeout: if the provider's image hangs for > 500ms, trigger TMDB fallback
  useEffect(() => {
    if (!isVisible || !posterSrc || imageError || hasTriedFallback) return; // Only run for visible cards
    
    let isMounted = true;
    const img = new Image();
    
    const timeout = setTimeout(() => {
      if (isMounted && !img.complete) {
        setImageError(true);
        img.src = ''; // Cancel
      }
    }, 500);

    img.onload = () => clearTimeout(timeout);
    img.onerror = () => {
      clearTimeout(timeout);
      if (isMounted) setImageError(true);
    };

    img.src = getProxiedImageUrl(posterSrc);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [isVisible, posterSrc, imageError, hasTriedFallback]);

  return (
    <div 
      ref={ref} 
      className={`media-card ${focused ? 'focused' : ''}`} 
      onClick={() => onPlay(item)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="card-image-container">
        {!imageError && posterSrc ? (
          <img 
            src={getProxiedImageUrl(posterSrc)} 
            alt={displayTitle} 
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            decoding="async"
            loading="lazy"
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover',
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 0.4s ease-in-out'
            }}
          />
        ) : (
          <div 
            className="card-image-fallback procedural-poster"
            style={{ background: getProceduralGradient(displayTitle) }}
          >
            <div className="procedural-initials">{getInitials(displayTitle)}</div>
            <span className="fallback-title">{displayTitle}</span>
          </div>
        )}
        
        {item.hasNewEpisodes && (
          <div className="new-episodes-badge">
            NEW EPISODES
          </div>
        )}

        {/* Rating Badge */}
        {rating > 0 && (
          <div className="card-rating-badge" style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(20, 20, 25, 0.5)', backdropFilter: 'blur(12px)', padding: '4px 8px', borderRadius: '8px', color: 'rgba(255, 255, 255, 0.95)', fontSize: '0.8rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 10, border: '1px solid rgba(255, 255, 255, 0.15)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>★</span> {rating.toFixed(1)}
          </div>
        )}

        {/* Progress Bar & Watched Badge - ONLY ON CONTINUE WATCHING */}
        {isContinueWatching && activeProgress && activeProgress.duration > 0 && (
          <>
            {activeProgress.progress >= activeProgress.duration * 0.9 ? (
              <div className="watched-badge" style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(34,197,94,0.9)', color: 'white', padding: '4px 8px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)' }}>
                <CheckCircle size={14} /> Watched
              </div>
            ) : (
              <div className="progress-bar-container" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '6px', background: 'rgba(0,0,0,0.8)', zIndex: 20 }}>
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${Math.min((activeProgress.progress / activeProgress.duration) * 100, 100)}%`, height: '100%', background: 'var(--accent-primary, #6366f1)', transition: 'width 0.3s ease', borderRadius: '0 4px 4px 0' }}
                ></div>
              </div>
            )}
          </>
        )}

        {/* Favorite Button */}
        {!onRemove && (
          <button 
            className={`favorite-btn ${isFavorite ? 'active' : ''}`}
            onClick={handleFavoriteClick}
          >
            <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}

        {/* Remove Button */}
        {onRemove && (
          <button 
            className="remove-btn"
            onClick={handleRemoveClick}
          >
            <X size={20} color="white" />
          </button>
        )}
      </div>
      <div className="card-info">
        <h4 className="card-title">{displayTitle}</h4>
        <span className="card-meta">{displayMeta}</span>
      </div>
    </div>
  );
};

const MediaCardSkeleton = () => {
  return (
    <div className="media-card skeleton">
      <div className="card-image-container skeleton-img"></div>
      <div className="card-info">
        <div className="skeleton-text title"></div>
        <div className="skeleton-text meta"></div>
      </div>
    </div>
  );
};

const CategoryRow = ({ title, items, onPlay, userData, onRemove, isLoading }) => {
  const { ref, focusKey } = useFocusable();
  // Virtualize the row by only rendering 10 items initially (just enough to fill the screen).
  // This completely eliminates UI freezing caused by registering 50+ items into spatial navigation simultaneously.
  const [visibleCount, setVisibleCount] = useState(15);
  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);

  useEffect(() => {
    setVisibleCount(15);
  }, [items]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisibleCount(prev => prev + 15);
      }
    }, { rootMargin: '1200px', threshold: 0 });

    observerRef.current.observe(loadMoreRef.current);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [items, visibleCount]);

  const handleWheel = (e) => {
    if (ref.current) {
      ref.current.scrollLeft += e.deltaY;
    }
  };

  if (!isLoading && (!items || items.length === 0)) return null;

  const visibleItems = items ? items.slice(0, visibleCount) : [];

  return (
    <div className="category-row-container">
      <h3 className="category-title">{title}</h3>
      <div 
        ref={ref} 
        className="category-row"
        onWheel={handleWheel}
      >
        {isLoading 
          ? Array(10).fill(0).map((_, i) => <MediaCardSkeleton key={`skeleton-${i}`} />)
          : visibleItems.map((item, idx) => {
              const id = item.stream_id || item.series_id || item.id;
              const isFavorite = userData ? userData.isFavorite(id) : false;
              const progress = userData ? userData.getProgress(id) : null;
              
              return (
                <MediaCard 
                  key={id} 
                  item={item} 
                  idx={idx} 
                  onPlay={onPlay} 
                  isFavorite={isFavorite}
                  onToggleFavorite={userData && userData.toggleFavorite ? userData.toggleFavorite : null}
                  progress={progress}
                  onRemove={onRemove}
                  isContinueWatching={title === 'Continue Watching'}
                />
              );
            })}
        {items && visibleCount < items.length && (
          <div ref={loadMoreRef} style={{ width: '100%', height: '10px', flexShrink: 0 }} />
        )}
      </div>
    </div>
  );
};

export default CategoryRow;
