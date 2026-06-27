import React, { useState, useEffect } from 'react';
import { Play, Info } from 'lucide-react';
import { getTmdbMovieInfo, getTmdbSeriesInfo } from '../../services/tmdb';
import { getProxiedImageUrl } from '../../services/api';
import './HeroBanner.css';

const HeroBanner = ({ item, onPlay, contextLabel }) => {
  const [extendedInfo, setExtendedInfo] = useState(null);
  
  useEffect(() => {
    if (!item) return;

    const fetchInfo = async () => {
      let data = null;
      const title = item.name || item.title;
      
      if (item.type === 'series') {
        data = await getTmdbSeriesInfo(title, item.imdb_id || item.tmdb_id);
      } else {
        data = await getTmdbMovieInfo(title, item.year, item.imdb_id || item.tmdb_id);
      }
      
      if (data) {
        setExtendedInfo(data);
      }
    };
    
    fetchInfo();
  }, [item]);

  if (!item) return null;

  const backdrop = extendedInfo?.backdrop || item.backdrop_path?.[0] || item.cover || item.stream_icon;
  const title = extendedInfo?.title || item.name || item.title;
  const plot = extendedInfo?.plot || item.plot || "A featured presentation.";

  return (
    <div className="hero-banner">
      <div className="hero-backdrop">
        {backdrop && <img src={getProxiedImageUrl(backdrop)} alt={title} />}
        <div className="hero-vignette"></div>
        <div className="hero-gradient"></div>
      </div>
      
      <div className="hero-content">
        {contextLabel && <div className="hero-context-label">{contextLabel}</div>}
        <h1 className="hero-title">{title}</h1>
        <p className="hero-plot">{plot}</p>
        
        <div className="hero-actions">
          <button className="btn-hero-play" onClick={() => onPlay(item)}>
            <Play fill="currentColor" size={24} />
            <span>Play</span>
          </button>
          <button className="btn-hero-info" onClick={() => onPlay(item)}>
            <Info size={24} />
            <span>More Info</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroBanner;
