import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import CategoryRow from '../vod/CategoryRow';
import { getVodStreams, getSeries } from '../../services/api';
import './SearchTab.css';

const SearchTab = ({ onPlay, userData }) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [allMovies, setAllMovies] = useState([]);
  const [allSeries, setAllSeries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const workerRef = useRef(null);

  const [filteredMovies, setFilteredMovies] = useState([]);
  const [filteredSeries, setFilteredSeries] = useState([]);
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

  // Fetch all content on mount
  useEffect(() => {
    const fetchAllContent = async () => {
      setIsLoading(true);
      try {
        // Fetching without category_id if the proxy supports it, or we could just fetch a default set
        // Many XTream panels return everything if category_id is 0 or omitted
        const [moviesData, seriesData] = await Promise.all([
          getVodStreams(0),
          getSeries(0)
        ]);
        
        const mapItems = (items, type) => (items || []).map(item => ({
          ...item,
          id: item.stream_id || item.series_id,
          title: item.name || item.title,
          type: type,
          poster: item.stream_icon || item.cover,
        }));

        setAllMovies(mapItems(moviesData, 'movie'));
        setAllSeries(mapItems(seriesData, 'series'));
      } catch (err) {
        console.error("Error fetching all content for search", err);
      }
      setIsLoading(false);
    };
    
    fetchAllContent();
  }, []);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../../workers/searchWorker.js', import.meta.url), { type: 'module' });
    
    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'search_done') {
        if (e.data.category === 'movie') setFilteredMovies(e.data.results);
        if (e.data.category === 'series') setFilteredSeries(e.data.results);
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
    if (debouncedQuery.length > 2 && workerRef.current) {
      workerRef.current.postMessage({ type: 'search', category: 'movie', query: debouncedQuery });
      workerRef.current.postMessage({ type: 'search', category: 'series', query: debouncedQuery });
    } else {
      setFilteredMovies([]);
      setFilteredSeries([]);
    }
  }, [debouncedQuery]);

  const hasMovies = (filterMode === 'all' || filterMode === 'movie') && filteredMovies.length > 0;
  const hasSeries = (filterMode === 'all' || filterMode === 'series') && filteredSeries.length > 0;
  const hasNoResults = !isLoading && debouncedQuery.length > 2 && !hasMovies && !hasSeries;

  return (
    <div className="search-tab animate-fade-in">
        <div className="search-header">
          <div className="search-input-wrapper">
            <Search className="search-icon" size={28} />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search for movies or series..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const topResult = filteredMovies[0] || filteredSeries[0];
                  if (topResult) {
                    saveRecentSearch(query);
                    onPlay(topResult);
                  }
                }
              }}
              autoFocus
            />
          </div>
          
          <div className="search-filters" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
            {['all', 'movie', 'series'].map(mode => (
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
                {mode === 'movie' ? 'Movies' : mode === 'all' ? 'All' : 'Series'}
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
            {hasMovies && (
              <CategoryRow 
                title={`Movies matching "${debouncedQuery}"`} 
                items={filteredMovies} 
                onPlay={(item) => { saveRecentSearch(query); onPlay(item); }} 
                userData={userData} 
              />
            )}
            
            {hasSeries && (
              <CategoryRow 
                title={`Series matching "${debouncedQuery}"`} 
                items={filteredSeries} 
                onPlay={(item) => { saveRecentSearch(query); onPlay(item); }} 
                userData={userData} 
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SearchTab;
