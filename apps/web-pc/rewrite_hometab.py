import re

with open('src/components/layout/HomeTab.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# We need to change the first useEffect block, to also await the AI fetch logic.

new_use_effect_block = '''  // Fetch Categories Asynchronously
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
        setBecauseYouWatchedTitle(\Because you watched \\);
        
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
'''

# Find the start of the first useEffect and the end of the second useEffect.
start_idx = code.find('  // Fetch Categories Asynchronously')
end_idx = code.find('  useEffect(() => {', start_idx + 100) # This is the second useEffect
end_idx = code.find('  useEffect(() => {', end_idx + 100) # This is the third useEffect
# We want to replace from start_idx up to the third useEffect.
new_code = code[:start_idx] + new_use_effect_block + "\n" + code[end_idx:]

with open('src/components/layout/HomeTab.jsx', 'w', encoding='utf-8') as f:
    f.write(new_code)
print('Success')