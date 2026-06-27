import React, { useState, useRef, useEffect } from 'react';
import { Play, Heart, GripVertical, ArrowDownAZ, X, Image as ImageIcon } from 'lucide-react';
import DragDropHint from './DragDropHint';
import './LibraryTab.css';
import { getTmdbMovieInfo, getTmdbSeriesInfo, cleanTitle } from '../../services/tmdb';
import { getProxiedImageUrl } from '../../services/api';
import { getProceduralGradient, getInitials } from '../../utils/posterGenerator';

const LibraryCard = ({ item, idx, type, isDragging, isDragOver, handleDragStart, handleDragOver, handleDrop, handleDragEnd, handlePlayClick, handleRemove }) => {
  const [posterSrc, setPosterSrc] = useState(item.poster || item.stream_icon || item.cover || '');
  const [imageError, setImageError] = useState(false);
  const [hasTriedFallback, setHasTriedFallback] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);

  // Force sync poster state if the underlying item props change (safety net for drag-and-drop reorders)
  useEffect(() => {
    setPosterSrc(item.poster || item.stream_icon || item.cover || '');
    setImageError(false);
  }, [item.poster, item.stream_icon, item.cover]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) { setIsVisible(true); return; }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '1200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    if (!posterSrc || imageError) {
      if (!hasTriedFallback) {
        setHasTriedFallback(true);
        const fetchFallback = async () => {
          try {
            let displayTitle = item.title || item.name;
            let extractedYear = item.year || item.released;

            if (typeof displayTitle === 'string') {
              displayTitle = cleanTitle(displayTitle);
              const parenYearMatch = displayTitle.match(/\((\d{4})\)/);
              if (parenYearMatch) {
                extractedYear = parenYearMatch[1];
                displayTitle = displayTitle.replace(parenYearMatch[0], '').trim();
              } else {
                const endYearMatch = displayTitle.match(/\b((?:19|20)\d{2})\s*$/);
                if (endYearMatch) {
                  extractedYear = endYearMatch[1];
                  displayTitle = displayTitle.replace(endYearMatch[0], '').trim();
                }
              }
            }

            const imdbId = item.imdb_id || item.tmdb_id;
            let tmdbData = null;
            if (item.type === 'movie' || item.stream_type === 'movie') {
              tmdbData = await getTmdbMovieInfo(displayTitle, extractedYear, imdbId);
            } else {
              tmdbData = await getTmdbSeriesInfo(displayTitle, imdbId);
            }

            if (tmdbData && tmdbData.poster) {
              setPosterSrc(tmdbData.poster);
              setImageError(false);
              // Patch the in-memory object so if user clicks play, VideoPlayer gets the working poster!
              item.poster = tmdbData.poster;
              item.cover = tmdbData.poster;
            } else {
              setImageError(true);
            }
          } catch (e) {
            setImageError(true);
          }
        };
        fetchFallback();
      }
    }
  }, [isVisible, posterSrc, imageError, hasTriedFallback, item]);

  const title = item.title || item.name;

  return (
    <div 
      ref={cardRef}
      draggable
      onDragStart={(e) => handleDragStart(e, type, idx)}
      onDragOver={(e) => handleDragOver(e, type, idx)}
      onDrop={(e) => handleDrop(e, type, idx)}
      onDragEnd={handleDragEnd}
      className={`library-card ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
      onClick={() => handlePlayClick(item)}
    >
      {!imageError && posterSrc ? (
        <img src={getProxiedImageUrl(posterSrc)} alt={title} className="library-poster" loading="lazy" onError={() => setImageError(true)} />
      ) : (
        <div 
          className="library-poster fallback procedural-poster"
          style={{ background: getProceduralGradient(title) }}
        >
          <div className="procedural-initials">{getInitials(title)}</div>
          <span className="fallback-title">{title}</span>
        </div>
      )}
      
      <div className="library-info">
        <div className="library-title">{title}</div>
        <div className="text-xs opacity-70 uppercase tracking-widest mt-1">
          {item.type === 'movie' ? 'Movie' : 'Series'}
        </div>
      </div>

      <div className="library-actions">
        <div className="library-btn cursor-grab active:cursor-grabbing" title="Drag to reorder">
          <GripVertical size={16} />
        </div>
        <button className="library-btn remove" onClick={(e) => handleRemove(e, item)} title="Remove from library">
          <X size={16} />
        </button>
        <button className="library-btn" onClick={(e) => { e.stopPropagation(); handlePlayClick(item); }} title="Play">
          <Play size={16} fill="currentColor" />
        </button>
      </div>
    </div>
  );
};

const LibraryTab = ({ userData, onPlay }) => {
  const [movieFavorites, setMovieFavorites] = useState([]);
  const [seriesFavorites, setSeriesFavorites] = useState([]);
  
  const [draggedType, setDraggedType] = useState(null);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const [visibleCount, setVisibleCount] = useState(50);
  const loadMoreRef = useRef(null);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisibleCount(prev => prev + 50);
      }
    }, { rootMargin: '1200px', threshold: 0 });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [movieFavorites, seriesFavorites]);

  // Sync state with global user data (filter out live TV)
  useEffect(() => {
    if (userData && userData.favorites) {
      setMovieFavorites(userData.favorites.filter(f => f.type === 'movie'));
      setSeriesFavorites(userData.favorites.filter(f => f.type === 'series'));
    }
  }, [userData?.favorites]);

  const saveOrder = (mList, sList) => {
    if (userData.reorderFavorites) {
      const liveFavs = (userData.favorites || []).filter(f => f.type === 'live');
      userData.reorderFavorites([...mList, ...sList, ...liveFavs]);
    }
  };

  const handleSortAZ = () => {
    const sortFn = (a, b) => {
      const titleA = (a.name || a.title || '').toLowerCase();
      const titleB = (b.name || b.title || '').toLowerCase();
      return titleA.localeCompare(titleB);
    };
    const sortedM = [...movieFavorites].sort(sortFn);
    const sortedS = [...seriesFavorites].sort(sortFn);
    setMovieFavorites(sortedM);
    setSeriesFavorites(sortedS);
    saveOrder(sortedM, sortedS);
  };

  const handleDragStart = (e, type, idx) => {
    setDraggedType(type);
    setDraggedIdx(idx);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setDragImage(e.target, 20, 20);
    }
  };

  const handleDragOver = (e, type, idx) => {
    e.preventDefault(); // Necessary to allow dropping
    if (draggedType === type && dragOverIdx !== idx) {
      setDragOverIdx(idx);
    }
  };

  const handleDrop = (e, targetType, targetIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedType !== targetType) return;
    
    if (draggedIdx !== targetIdx) {
      if (targetType === 'movie') {
        const newFavs = [...movieFavorites];
        const [draggedItem] = newFavs.splice(draggedIdx, 1);
        newFavs.splice(targetIdx, 0, draggedItem);
        setMovieFavorites(newFavs);
        saveOrder(newFavs, seriesFavorites);
      } else {
        const newFavs = [...seriesFavorites];
        const [draggedItem] = newFavs.splice(draggedIdx, 1);
        newFavs.splice(targetIdx, 0, draggedItem);
        setSeriesFavorites(newFavs);
        saveOrder(movieFavorites, newFavs);
      }
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
    setDraggedType(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
    setDraggedType(null);
  };

  const handleRemove = (e, item) => {
    e.stopPropagation();
    if (userData.toggleFavorite) {
      userData.toggleFavorite(item);
    }
  };

  const handlePlayClick = (item) => {
    if (onPlay) {
      onPlay(item);
    }
  };

  const renderCard = (item, idx, type) => {
    const uniqueKey = item.stream_id || item.series_id || item.id || item.name || item.title || idx;
    return (
      <LibraryCard 
        key={uniqueKey}
        item={item}
        idx={idx}
        type={type}
        isDragging={draggedIdx === idx && draggedType === type}
        isDragOver={dragOverIdx === idx && draggedType === type}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        handleDragEnd={handleDragEnd}
        handlePlayClick={handlePlayClick}
        handleRemove={handleRemove}
      />
    );
  };

  return (
    <div className="content-container animate-fade-in flex-col h-full" style={{ paddingLeft: '112px', paddingRight: '2rem', paddingTop: '3rem', paddingBottom: '4rem' }}>
      <div className="flex items-end justify-between mb-8">
        <h1 className="text-5xl font-black tracking-tighter">
          <span className="opacity-50 font-medium text-3xl block mb-2">Your Space,</span>
          My Library
        </h1>
        
        {(movieFavorites.length > 1 || seriesFavorites.length > 1) && (
          <button className="sort-btn" onClick={handleSortAZ}>
            <ArrowDownAZ size={20} />
            Sort A-Z
          </button>
        )}
      </div>

      {(movieFavorites.length === 0 && seriesFavorites.length === 0) ? (
        <div className="flex flex-col items-center justify-center h-full opacity-50 mt-20">
          <Heart size={64} className="mb-4" />
          <h2 className="text-2xl font-bold">Your library is empty</h2>
          <p className="mt-2 text-lg">Click the heart icon on any movie or series to save it here.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-20 pr-4">
          {(movieFavorites.length > 0 || seriesFavorites.length > 0) && userData?.activeProfile?.hasSeenDragDropHint !== true && (
            <DragDropHint onDismiss={() => userData.dismissDragDropHint()} />
          )}

          {movieFavorites.length > 0 && (
            <div className="mb-10">
              <h2 className="text-2xl font-bold mb-4 opacity-80 border-b border-white/10 pb-2">Movies</h2>
              <div className="library-grid">
                {movieFavorites.slice(0, visibleCount).map((item, idx) => renderCard(item, idx, 'movie'))}
              </div>
            </div>
          )}
          
          {seriesFavorites.length > 0 && (
            <div className="mb-10">
              <h2 className="text-2xl font-bold mb-4 opacity-80 border-b border-white/10 pb-2">Series</h2>
              <div className="library-grid">
                {seriesFavorites.slice(0, Math.max(0, visibleCount - movieFavorites.length)).map((item, idx) => renderCard(item, idx, 'series'))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Invisible element at the bottom to trigger load more */}
      {(movieFavorites.length > 0 || seriesFavorites.length > 0) && visibleCount < (movieFavorites.length + seriesFavorites.length) && (
        <div ref={loadMoreRef} style={{ width: '100%', height: '20px' }} />
      )}
    </div>
  );
};

export default LibraryTab;
