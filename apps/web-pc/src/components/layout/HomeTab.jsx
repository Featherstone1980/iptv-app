import React, { useState, useEffect, useMemo } from 'react';
import CategoryRow from '../vod/CategoryRow';
import HeroBanner from './HeroBanner';
import { getVodStreams, getSeries } from '../../services/api';
import { getSimilarTmdb, cleanTitle } from '../../services/tmdb';

const HomeTab = ({ onPlay, userData, movies, series, vodCategories, seriesCategories, onHomeDataLoaded }) => {
  const [featuredItem, setFeaturedItem] = useState(null);
  const [featuredContext, setFeaturedContext] = useState("");
  const [actionMovies, setActionMovies] = useState([]);
  const [comedyMovies, setComedyMovies] = useState([]);
  const [bingeSeries, setBingeSeries] = useState([]);
  const [becauseYouWatched, setBecauseYouWatched] = useState([]);
  const [becauseYouWatchedTitle, setBecauseYouWatchedTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Calculate New Episode badges
  const newEpisodes = useMemo(() => {
    if (!userData || !userData.favorites) return [];
    
    const episodesList = [];
    userData.favorites.forEach(fav => {
      if (fav.type === 'series' && series) {
        const serverItem = series.find(s => s.series_id === (fav.series_id || fav.id));
        if (serverItem && serverItem.last_modified) {
          if (parseInt(serverItem.last_modified, 10) > parseInt(fav.last_modified || '0', 10)) {
            episodesList.push({ ...serverItem, hasNewEpisodes: true });
          }
        }
      }
    });
    return episodesList;
  }, [userData.favorites, series]);

  // Fetch Categories Asynchronously
  useEffect(() => {
    const hidden = userData?.hiddenCategories || [];
    const promises = [];

    if (vodCategories?.length > 0) {
      const visibleVod = vodCategories.filter(c => !hidden.includes(c.category_id));
      // 1. Fetch Action Thrillers
      const actionCat = visibleVod.find(c => c.category_name.toLowerCase().includes('action') || c.category_name.toLowerCase().includes('thriller'));
      if (actionCat) {
        const p = getVodStreams(actionCat.category_id).then(actionData => {
          if (Array.isArray(actionData)) {
            const sorted = actionData.sort((a, b) => {
              let ratingA = parseFloat(a.rating) || 0;
              if (!a.is_tmdb_rating && ratingA > 0 && ratingA <= 5) ratingA = ratingA * 2;
              else if (!a.is_tmdb_rating && ratingA === 0 && parseFloat(a.rating_5based) > 0) ratingA = parseFloat(a.rating_5based) * 2;
              
              let ratingB = parseFloat(b.rating) || 0;
              if (!b.is_tmdb_rating && ratingB > 0 && ratingB <= 5) ratingB = ratingB * 2;
              else if (!b.is_tmdb_rating && ratingB === 0 && parseFloat(b.rating_5based) > 0) ratingB = parseFloat(b.rating_5based) * 2;
              
              return ratingB - ratingA;
            }).slice(0, 20);
            const mapped = sorted.map(v => ({...v, id: v.stream_id, type: 'movie', poster: v.stream_icon, title: v.name}));
            setActionMovies(mapped);
            return mapped;
          }
          return [];
        }).catch(e => { console.error("Failed to load Action row", e); return []; });
        promises.push(p);
      }

      // 2. Fetch Comedies
      const comedyCat = visibleVod.find(c => c.category_name.toLowerCase().includes('comedy'));
      if (comedyCat) {
        const p = getVodStreams(comedyCat.category_id).then(comedyData => {
          if (Array.isArray(comedyData)) {
            const sorted = comedyData.sort((a, b) => parseInt(b.added || 0) - parseInt(a.added || 0)).slice(0, 20);
            const mapped = sorted.map(v => ({...v, id: v.stream_id, type: 'movie', poster: v.stream_icon, title: v.name}));
            setComedyMovies(mapped);
            return mapped;
          }
          return [];
        }).catch(e => { console.error("Failed to load Comedy row", e); return []; });
        promises.push(p);
      }
    }

    if (seriesCategories?.length > 0) {
      const visibleSeries = seriesCategories.filter(c => !hidden.includes(c.category_id));
      // 3. Fetch Binge-Worthy Series
      const topSeriesCat = visibleSeries.find(c => c.category_name.toLowerCase().includes('top') || c.category_name.toLowerCase().includes('english'));
      if (topSeriesCat) {
        const p = getSeries(topSeriesCat.category_id).then(seriesData => {
          if (Array.isArray(seriesData)) {
            const sorted = seriesData.sort((a, b) => {
              let ratingA = parseFloat(a.rating) || 0;
              if (!a.is_tmdb_rating && ratingA > 0 && ratingA <= 5) ratingA = ratingA * 2;
              else if (!a.is_tmdb_rating && ratingA === 0 && parseFloat(a.rating_5based) > 0) ratingA = parseFloat(a.rating_5based) * 2;
              
              let ratingB = parseFloat(b.rating) || 0;
              if (!b.is_tmdb_rating && ratingB > 0 && ratingB <= 5) ratingB = ratingB * 2;
              else if (!b.is_tmdb_rating && ratingB === 0 && parseFloat(b.rating_5based) > 0) ratingB = parseFloat(b.rating_5based) * 2;
              
              return ratingB - ratingA;
            }).slice(0, 20);
            const mapped = sorted.map(s => ({...s, id: s.series_id, type: 'series', poster: s.cover, title: s.name}));
            setBingeSeries(mapped);
            return mapped;
          }
          return [];
        }).catch(e => { console.error("Failed to load Series row", e); return []; });
        promises.push(p);
      }
    }

    // 4. Fetch AI Recommendations / Hero Banner
    const aiPromise = new Promise(async (resolve) => {
      const validContinueWatching = userData?.continueWatching ? userData.continueWatching.filter(item => item.type !== 'live') : [];
      if (validContinueWatching.length > 0) {
        const lastWatched = validContinueWatching[0];
        setBecauseYouWatchedTitle(`Because you watched ${lastWatched.title || lastWatched.name}`);
        
        let relatedFound = false;
        try {
          const similarTitles = await getSimilarTmdb(lastWatched.title || lastWatched.name, lastWatched.type, userData?.tmdbApiKey);
          
          if (similarTitles && similarTitles.length > 0) {
                const allItems = lastWatched.type === 'movie' ? await getVodStreams(0) : await getSeries(0);
                if (allItems && allItems.length > 0) {
                  const matchedItems = [];
                  const searchTitles = similarTitles.map(t => cleanTitle(String(t)).toLowerCase());
                  
                  // Keep it simple and sync for preloading, we can just slice for speed if needed, but doing it sync is fine for background load
                  for (let idx = 0; idx < allItems.length; idx++) {
                        const item = allItems[idx];
                        if (item.stream_id === lastWatched.id || item.series_id === lastWatched.id) continue;
                        
                        const rawTitle = item.name || item.title || '';
                        if (!rawTitle) continue;
                        
                        const cleanItemTitle = cleanTitle(String(rawTitle)).toLowerCase();
                        
                        for (let i = 0; i < searchTitles.length; i++) {
                          const t = searchTitles[i];
                          if (cleanItemTitle === t || cleanItemTitle.startsWith(t)) {
                            matchedItems.push({
                              ...item, 
                              id: item.stream_id || item.series_id, 
                              type: lastWatched.type, 
                              poster: item.stream_icon || item.cover, 
                              title: rawTitle
                            });
                            break;
                          }
                        }
                        // Limit matches to speed up
                        if (matchedItems.length >= 20) break;
                  }
                  
                  if (matchedItems.length > 0) {
                      const sorted = matchedItems.sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));
                      const finalMatches = sorted.slice(0, 20);
                      setBecauseYouWatched(finalMatches);
                      relatedFound = true;
                      return resolve(finalMatches);
                  }
                }
          }
        } catch (e) {
          console.error("TMDB AI recommendation failed", e);
        }
        
        // Fallback: Grab items from the same category
        if (!relatedFound && lastWatched.category_id) {
          if (lastWatched.type === 'movie') {
            const related = await getVodStreams(lastWatched.category_id);
            if (related) {
                const finalMatches = related.filter(r => r.stream_id !== lastWatched.id).slice(0, 20).map(v => ({...v, id: v.stream_id, type: 'movie', poster: v.stream_icon, title: v.name}));
              setBecauseYouWatched(finalMatches);
              return resolve(finalMatches);
            }
          } else {
            const related = await getSeries(lastWatched.category_id);
            if (related) {
                const finalMatches = related.filter(r => r.series_id !== lastWatched.id).slice(0, 20).map(s => ({...s, id: s.series_id, type: 'series', poster: s.cover, title: s.name}));
              setBecauseYouWatched(finalMatches);
              return resolve(finalMatches);
            }
          }
        }
      }
      resolve([]);
    });
    
    promises.push(aiPromise);

    if (promises.length > 0) {
      Promise.all(promises).then((results) => {
        // Collect all poster URLs
        const allItems = results.flat();
        const allPosters = allItems.map(item => item.poster).filter(url => url);
        
        // Preload all images directly into browser cache with a safety timeout
        const imagePromises = allPosters.map(url => {
          return new Promise((resolve) => {
            let isResolved = false;
            const img = new Image();
            
            const handleResolve = () => {
              if (!isResolved) {
                isResolved = true;
                resolve();
              }
            };

            img.onload = handleResolve;
            img.onerror = handleResolve;
            img.src = url;
            
            setTimeout(handleResolve, 3000); // Wait up to 3s for hero banner and posters
          });
        });

        // Wait for all images to actually download, then trigger complete
        Promise.all(imagePromises).then(() => {
          if (onHomeDataLoaded) onHomeDataLoaded();
          setIsLoading(false);
        });
      });
    } else {
      if (onHomeDataLoaded) onHomeDataLoaded();
      setIsLoading(false);
    }
  }, [vodCategories, seriesCategories, userData?.hiddenCategories, userData?.continueWatching, userData?.tmdbApiKey]);

  useEffect(() => {
    const cw = userData?.continueWatching?.filter(i => i.type !== 'live') || [];
    if (cw.length > 0) {
      setFeaturedItem(cw[0]);
      setFeaturedContext("Jump Back In");
    } else if (becauseYouWatched.length > 0) {
      setFeaturedItem(becauseYouWatched[0]);
      setFeaturedContext("Recommended For You");
    } else if (actionMovies.length > 0) {
      setFeaturedItem(actionMovies[0]);
      setFeaturedContext("Trending Action");
    }
  }, [userData?.continueWatching, becauseYouWatched, actionMovies]);

  const opts = userData?.homeOptions || {
    showContinueWatching: true,
    showLiveInContinueWatching: false,
    showNewEpisodes: true,
    showBecauseYouWatched: true,
    showTrendingAction: true,
    showComedies: true,
    showBingeSeries: true
  };

  const cwItems = useMemo(() => {
    if (!userData.continueWatching) return [];
    if (opts.showLiveInContinueWatching) return userData.continueWatching;
    return userData.continueWatching.filter(i => i.type !== 'live');
  }, [userData.continueWatching, opts.showLiveInContinueWatching]);

  return (
    <div className="content-container animate-fade-in flex-col h-full">
      <div className="swimlane-container flex-1 overflow-y-auto pb-20 relative" style={{ zIndex: 10 }}>
        
        <HeroBanner item={featuredItem} onPlay={onPlay} contextLabel={featuredContext} />
      {opts.showContinueWatching && cwItems.length > 0 && (
        <CategoryRow 
          title="Continue Watching" 
          items={cwItems} 
          onPlay={onPlay} 
          userData={userData} 
          onRemove={userData.removeContinueWatching} 
        />
      )}

      {opts.showNewEpisodes && newEpisodes.length > 0 && (
        <CategoryRow 
          title="New Episodes" 
          items={newEpisodes} 
          onPlay={onPlay} 
          userData={userData} 
        />
      )}

      {opts.showBecauseYouWatched && becauseYouWatched.length > 0 && (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '10px', right: '40px', background: 'linear-gradient(90deg, #ec4899, #8b5cf6)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', zIndex: 10 }}>
            Powered by AI
          </div>
          <CategoryRow title={becauseYouWatchedTitle} items={becauseYouWatched} onPlay={onPlay} userData={userData} />
        </div>
      )}

      {opts.showTrendingAction && (isLoading || actionMovies.length > 0) && (
        <CategoryRow 
        title="Trending Action & Thrillers" 
        items={actionMovies} 
        onPlay={onPlay} 
        userData={userData} 
        isLoading={isLoading}
      />
      )}
      
      {opts.showComedies && (isLoading || comedyMovies.length > 0) && (
        <CategoryRow 
        title="Feel-Good Comedies" 
        items={comedyMovies} 
        onPlay={onPlay} 
        userData={userData} 
        isLoading={isLoading}
      />
      )}

      {opts.showBingeSeries && (isLoading || bingeSeries.length > 0) && (
        <CategoryRow 
        title="Binge-Worthy Series" 
        items={bingeSeries} 
        onPlay={onPlay} 
        userData={userData} 
        isLoading={isLoading}
      />
      )}
      </div>
    </div>
  );
};

export default HomeTab;
