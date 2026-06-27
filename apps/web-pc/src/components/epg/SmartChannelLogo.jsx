import React, { useState, useEffect } from 'react';
import { getProxiedImageUrl } from '../../services/api';
import './SmartChannelLogo.css';

// Module-level dedup: track URLs we know have already loaded successfully.
// Note: We intentionally do NOT permanently cache failures — a transient network
// blip or a hot-reload cycle could cause a URL to fail once and then be blocked
// for the entire session. Instead we only cache successes.
const loadedUrls = new Set();

const SmartChannelLogo = React.memo(({ src, alt, className = '', style = {} }) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state whenever src changes so a new URL always gets a fresh attempt.
  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src) return null;

  if (hasError) {
    return (
      <div
        className={`smart-channel-logo-wrapper ${className}`}
        style={{
          ...style,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: '800',
          fontSize: '1.5rem',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)'
        }}
        title={alt || 'Channel Logo'}
      >
        {(alt || '?').charAt(0).toUpperCase()}
      </div>
    );
  }

  // Route through local proxy to bypass CORS restrictions
  const safeSrc = getProxiedImageUrl(src);

  return (
    <div className={`smart-channel-logo-wrapper ${className}`} style={style}>
      <img
        src={safeSrc}
        alt={alt || 'Channel Logo'}
        className="smart-channel-logo-img"
        loading="lazy"
        onLoad={() => {
          loadedUrls.add(src);
        }}
        onError={() => {
          setHasError(true);
        }}
      />
    </div>
  );
});

export default SmartChannelLogo;
