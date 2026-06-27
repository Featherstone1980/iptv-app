import React, { useState, useEffect } from 'react';
import { Play, Info } from 'lucide-react';
import { getVodInfo, getSeriesInfo } from '../../services/api';
import './HeroBanner.css';

const HeroBanner = ({ item }) => {
  const [imageError, setImageError] = useState(false);
  const [extendedInfo, setExtendedInfo] = useState(null);

  useEffect(() => {
    setImageError(false);
    setExtendedInfo(null);
    if (!item) return;

    const fetchInfo = async () => {
      try {
        if (item.type === 'movie' || item.stream_type === 'movie') {
          const data = await getVodInfo(item.id || item.stream_id);
          if (data && data.info) setExtendedInfo(data.info);
        } else if (item.type === 'series' || item.series_id) {
          const data = await getSeriesInfo(item.id || item.series_id);
          if (data && data.info) setExtendedInfo(data.info);
        }
      } catch (e) {
        console.error("Error fetching hero info", e);
      }
    };
    fetchInfo();
  }, [item]);

  if (!item) return null;

  let displayTitle = item.title || item.name;
  if (typeof displayTitle === 'string') {
    const yearRegex = /\(\d{4}\)/;
    const match = displayTitle.match(yearRegex);
    if (match) {
      displayTitle = displayTitle.replace(match[0], '').trim();
    }
  }

  const plot = extendedInfo?.plot || extendedInfo?.description || "Experience the ultimate entertainment with our premium selection. Watch in stunning HD quality.";
  const bgImage = (extendedInfo?.backdrop_path && extendedInfo.backdrop_path.length > 0) 
    ? extendedInfo.backdrop_path[0] 
    : item.poster;

  return (
    <div className="hero-banner">
      <div className="hero-bg">
        {bgImage && !imageError ? (
          <img src={bgImage} alt={displayTitle} onError={() => setImageError(true)} />
        ) : (
          <div className="hero-bg-fallback"></div>
        )}
        <div className="hero-overlay"></div>
      </div>
      <div className="hero-content">
        <h1 className="hero-title">{displayTitle}</h1>
        <div className="hero-meta">
          <span className="year">{item.year}</span>
          <span className="type">{item.type ? item.type.toUpperCase() : 'VOD'}</span>
        </div>
        <p className="hero-description">
          {plot}
        </p>
        <div className="hero-actions">
          <button className="btn-primary">
            <Play fill="currentColor" size={20} />
            <span>Play Now</span>
          </button>
          <button className="btn-secondary">
            <Info size={20} />
            <span>More Info</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroBanner;
