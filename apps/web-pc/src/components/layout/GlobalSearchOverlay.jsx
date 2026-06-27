import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import CategoryRow from '../vod/CategoryRow';
import { getVodStreams, getSeries, getLiveStreams } from '../../services/api';
import './GlobalSearchOverlay.css';

import { useAppStore } from '../../store/useAppStore';

const GlobalSearchOverlay = ({ onClose, onPlay, userData, isSessionUnlocked, isHidden }) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [allMovies, setAllMovies] = useState([]);
  const [allSeries, setAllSeries] = useState([]);
  const [allLive, setAllLive] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const workerRef = useRef(null);

  const [filteredMovies, setFilteredMovies] = useState([]);
  const [filteredSeries, setFilteredSeries] = useState([]);
  const [filteredLive, setFilteredLive] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('iptv_recent_searches')) || [];
      setRecentSearches(saved);
    } catch(e) {}
  }, []);

  const saveRecentSearch = (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length === 0) return;
    const term = searchQuery.trim().toLowerCase();
    const updated = [term, ...recentSearches.filter(s => s !== term)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('iptv_recent_searches', JSON.stringify(updated));
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);
    return () => clearTimeout(handler);
  }, [query]);

let cachedSearchMovies = null;
let cachedSearchSeries = null;
let cachedSearchLive = null;
let lastSearchCacheTime = 0;

  // Fetch all content on mount
  useEffect(() => {
    const fetchAllContent = async () => {
      setIsLoading(true);
      try {
        const now = Date.now();
        // Use cached mapped arrays if they exist and are younger than 1 hour
        if (cachedSearchMovies && cachedSearchSeries && cachedSearchLive && (now - lastSearchCacheTime < 3600000)) {
          setAllMovies(cachedSearchMovies);
          setAllSeries(cachedSearchSeries);
          setAllLive(cachedSearchLive);
          setIsLoading(false);
          return;
        }

        const [moviesData, seriesData, liveData] = await Promise.all([
          getVodStreams(0),
          getSeries(0),
          getLiveStreams(0)
        ]);
        
        const mapItems = (items, type) => (items || []).filter(item => {
          if (userData.hiddenCategories?.includes(item.category_id)) return false;
          return isSessionUnlocked || !userData.lockedCategories?.includes(item.category_id);
        }).map(item => ({
          ...item,
          id: item.stream_id || item.series_id,
          title: item.name || item.title,
          type: type,
          poster: item.stream_icon || item.cover,
        }));

        cachedSearchMovies = mapItems(moviesData, 'movie');
        cachedSearchSeries = mapItems(seriesData, 'series');
        cachedSearchLive = (liveData || []).filter(item => {
          if (userData.hiddenCategories?.includes(item.category_id)) return false;
          return isSessionUnlocked || !userData.lockedCategories?.includes(item.category_id);
        }).map(item => ({
          ...item,
          id: item.stream_id,
          title: item.name,
          type: 'live',
          poster: item.stream_icon
        }));
        
        lastSearchCacheTime = now;

        setAllMovies(cachedSearchMovies);
        setAllSeries(cachedSearchSeries);
        setAllLive(cachedSearchLive);
      } catch (err) {
        console.error("Error fetching all content for search", err);
      }
      setIsLoading(false);
    };
    
    fetchAllContent();
  }, []);

  useEffect(() => {
    // Focus input when mounted
    if (inputRef.current) {
      inputRef.current.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        const state = useAppStore.getState();
        if (!state.activeMovie && !state.activeSeries && !state.activePlayers.length) {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../../workers/searchWorker.js', import.meta.url), { type: 'module' });
    
    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'search_done') {
        if (e.data.category === 'movie') setFilteredMovies(e.data.results);
        if (e.data.category === 'series') setFilteredSeries(e.data.results);
        if (e.data.category === 'live') setFilteredLive(e.data.results);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const fuseOptions = {
    keys: [
      { name: 'title', weight: 1.0 },
      { name: 'name', weight: 1.0 },
      { name: 'cast', weight: 0.6 },
      { name: 'director', weight: 0.4 },
      { name: 'genre', weight: 0.3 },
      { name: 'plot', weight: 0.2 }
    ],
    threshold: 0.4,
    ignoreLocation: true,
  };

  useEffect(() => {
    if (allMovies.length > 0 && workerRef.current) {
      workerRef.current.postMessage({ type: 'init', category: 'movie', data: allMovies, options: fuseOptions });
    }
  }, [allMovies]);

  useEffect(() => {
    if (allSeries.length > 0 && workerRef.current) {
      workerRef.current.postMessage({ type: 'init', category: 'series', data: allSeries, options: fuseOptions });
    }
  }, [allSeries]);

  useEffect(() => {
    if (allLive.length > 0 && workerRef.current) {
      workerRef.current.postMessage({ type: 'init', category: 'live', data: allLive, options: fuseOptions });
    }
  }, [allLive]);

  useEffect(() => {
    if (debouncedQuery.length > 2 && workerRef.current) {
      workerRef.current.postMessage({ type: 'search', category: 'movie', query: debouncedQuery });
      workerRef.current.postMessage({ type: 'search', category: 'series', query: debouncedQuery });
      workerRef.current.postMessage({ type: 'search', category: 'live', query: debouncedQuery });
    } else {
      setFilteredMovies([]);
      setFilteredSeries([]);
      setFilteredLive([]);
    }
  }, [debouncedQuery]);

  const hasMovies = (filterMode === 'all' || filterMode === 'movie') && filteredMovies.length > 0;
  const hasSeries = (filterMode === 'all' || filterMode === 'series') && filteredSeries.length > 0;
  const hasLive = (filterMode === 'all' || filterMode === 'live') && filteredLive.length > 0;
  const hasNoResults = !isLoading && debouncedQuery.length > 2 && !hasMovies && !hasSeries && !hasLive;

  return (
    <div className="global-search-overlay animate-fade-in" onClick={onClose} style={{ display: isHidden ? 'none' : 'flex' }}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <X size={32} />
        </button>

        <div className="search-header">
          <div className="search-input-wrapper">
            <Search className="search-icon" size={28} />
            <input 
              ref={inputRef}
              type="text" 
              className="search-input" 
              placeholder="Search for movies or series..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const topResult = filteredLive[0] || filteredMovies[0] || filteredSeries[0];
                  if (topResult) {
                    saveRecentSearch(query);
                    onPlay(topResult);
                  }
                } else if (e.key === 'Backspace' && query === '') {
                  onClose();
                }
              }}
            />
          </div>
          
          <div className="search-filters" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
            {['all', 'live', 'movie', 'series'].map(mode => (
              <button 
                key={mode}
                onClick={() => setFilterMode(mode)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  background: filterMode === mode ? 'var(--accent-primary, #6366f1)' : 'rgba(255,255,255,0.1)',
                  color: filterMode === mode ? 'white' : 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
              >
                {mode === 'movie' ? 'Movies' : mode === 'live' ? 'Live TV' : mode === 'all' ? 'All' : 'Series'}
              </button>
            ))}
          </div>
        </div>

        <div className="search-results">
          {isLoading && <div className="search-message">Loading library...</div>}
          
          {!isLoading && debouncedQuery.length <= 2 && (
            <div className="search-message" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div>Type at least 3 characters to search</div>
              {recentSearches.length > 0 && (
                <div style={{ marginTop: '2rem' }}>
                  <div style={{ fontSize: '0.9rem', opacity: 0.6, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Recent Searches</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                    {recentSearches.map(term => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        style={{
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          padding: '8px 16px',
                          borderRadius: '20px',
                          color: 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <Search size={14} /> {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {hasNoResults && (
            <div className="search-message">No results found for "{debouncedQuery}"</div>
          )}

          {!isLoading && debouncedQuery.length > 2 && (
            <>
              {hasLive && (
                <div className="search-category">
                  <h3 className="search-category-title">Live TV</h3>
                  <div className="search-live-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', padding: '0 1rem' }}>
                    {filteredLive.map(channel => (
                      <div 
                        key={channel.id} 
                        className="search-live-card"
                        onClick={() => { saveRecentSearch(query); onPlay(channel); }}
                        style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {channel.poster ? (
                          <img src={channel.poster} alt={channel.title} style={{ width: '50px', height: '50px', objectFit: 'contain', background: 'rgba(255,255,255,0.9)', padding: '4px', borderRadius: '8px' }} />
                        ) : (
                          <div style={{ width: '50px', height: '50px', background: 'rgba(255,255,255,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
                            {channel.title?.charAt(0) || '?'}
                          </div>
                        )}
                        <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{channel.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {hasMovies && (
                <div className="search-category">
                  <h3 className="search-category-title">Movies</h3>
                  <CategoryRow 
                    items={filteredMovies} 
                    onPlay={(item) => { saveRecentSearch(query); onPlay(item); }} 
                    userData={userData} 
                  />
                </div>
              )}
              
              {hasSeries && (
                <div className="search-category">
                  <h3 className="search-category-title">Series</h3>
                  <CategoryRow 
                    items={filteredSeries} 
                    onPlay={(item) => { saveRecentSearch(query); onPlay(item); }} 
                    userData={userData} 
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchOverlay;
