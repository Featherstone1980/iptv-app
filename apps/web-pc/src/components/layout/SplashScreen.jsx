import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

const SplashScreen = ({ isDataLoaded, minDisplayTime = 2500, onComplete }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [mountTime] = useState(Date.now());

  const triggerFadeOut = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 850);
  };

  useEffect(() => {
    // If data is loaded, check if we've met the minimum display time AND guarantee at least 1s after data load
    if (isDataLoaded) {
      const timeElapsed = Date.now() - mountTime;
      const minTimeRemaining = Math.max(0, minDisplayTime - timeElapsed);
      const postLoadDelay = 1500; // Give browser 1.5s to fetch images after DOM mounts
      const timeRemaining = Math.max(minTimeRemaining, postLoadDelay);

      const fadeTimer = setTimeout(triggerFadeOut, timeRemaining);
      return () => clearTimeout(fadeTimer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDataLoaded, mountTime, minDisplayTime]);

  // Safety net: auto-dismiss after 15 seconds even if data never loads
  // (e.g. backend server failed to start, provider is offline, connection error)
  useEffect(() => {
    const maxTimeout = setTimeout(() => {
      if (!isFadingOut) {
        console.warn('[SplashScreen] Maximum wait time exceeded — auto-dismissing.');
        triggerFadeOut();
      }
    }, 15000);
    return () => clearTimeout(maxTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`splash-screen-overlay ${isFadingOut ? 'splash-zoom-out' : ''}`}>
      <div className="splash-content-wrapper">
        <div className="splash-logo-container">
          <div className="splash-glow"></div>
          <h1 className="splash-logo-text animated-logo">STREAMPRO</h1>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
