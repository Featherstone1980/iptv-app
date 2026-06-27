import React, { useEffect } from 'react';
import { init } from '@noriginmedia/norigin-spatial-navigation';
import LoginScreen from './components/layout/LoginScreen';
import ProfileSelectionScreen from './components/layout/ProfileSelectionScreen';
import LayoutManager from './components/layout/LayoutManager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useUserData } from './hooks/useUserData';
import './App.css';
import { useAppStore } from './store/useAppStore';

window.appStore = useAppStore;

// Initialize TV Remote Navigation
init({
  debug: false,
  visualDebug: false,
});

function App() {
  const userData = useUserData();

  // Apply UI Zoom across the entire app
  useEffect(() => {
    try {
      if (window.require && userData.uiZoom) {
        const { webFrame } = window.require('electron');
        webFrame.setZoomFactor(parseFloat(userData.uiZoom));
      }
    } catch (err) {
      console.warn("Could not set zoom factor. Are you running outside Electron?", err);
    }
  }, [userData.uiZoom]);

  const hasProvider = userData.providers && userData.providers.length > 0;

  if (!hasProvider && !userData.credentials) {
    return <LoginScreen onLogin={userData.login} />;
  }

  if ((hasProvider || userData.credentials) && !userData.activeProfileId) {
    return (
      <ProfileSelectionScreen 
        profiles={userData.profiles} 
        onSelectProfile={userData.switchProfile}
        onAddProfile={userData.addProfile}
        onLogout={userData.logout}
        initialAutoLogin={!!userData.autoLoginProfileId}
      />
    );
  }

  return (
    <ErrorBoundary>
      <LayoutManager userData={userData} />
    </ErrorBoundary>
  );
}

export default App;
