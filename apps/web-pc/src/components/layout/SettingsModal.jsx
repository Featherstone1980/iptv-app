import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { X, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { AVATARS } from '../../hooks/useUserData';
import './SettingsModal.css';

const THEME_COLORS = [
  { name: 'Indigo (Default)', hex: '#6366f1' },
  { name: 'Neon Pink', hex: '#ec4899' },
  { name: 'Electric Blue', hex: '#3b82f6' },
  { name: 'Emerald Green', hex: '#10b981' },
  { name: 'Crimson Red', hex: '#ef4444' },
  { name: 'Golden Yellow', hex: '#f59e0b' },
  { name: 'Deep Purple', hex: '#8b5cf6' },
  { name: 'Teal', hex: '#14b8a6' },
];

const SettingsModal = ({ onClose, userData, vodCategories = [], seriesCategories = [], liveCategories = [] }) => {
  const currentTheme = userData.themeColor || '#6366f1';
  const activeProfile = userData.activeProfile;

  const [activeTab, setActiveTab] = useState('profile');
  const [editName, setEditName] = useState(activeProfile?.name || '');
  const [editAvatar, setEditAvatar] = useState(activeProfile?.avatar || AVATARS[0]);

  // Parental Control State
  const [pinInput, setPinInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [setupPin, setSetupPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  const JUNK_REGEX = /(xxx|adult|x-rated|18\+)/i;
  const allAdultCats = [
    ...(liveCategories || []),
    ...(vodCategories || []),
    ...(seriesCategories || [])
  ].filter(c => JUNK_REGEX.test(c.category_name));

  const adultCategoryIds = allAdultCats.map(c => c.category_id);
  const isAdultEnabled = adultCategoryIds.length > 0 && !adultCategoryIds.every(id => userData.hiddenCategories.includes(id));

  // Category Search State
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  const autoStartOnBoot = useAppStore(state => state.autoStartOnBoot);
  const setAutoStartOnBoot = useAppStore(state => state.setAutoStartOnBoot);
  const idleTimeoutEnabled = useAppStore(state => state.idleTimeoutEnabled);
  const setIdleTimeoutEnabled = useAppStore(state => state.setIdleTimeoutEnabled);
  const epgUpdateFrequency = useAppStore(state => state.epgUpdateFrequency);
  const setEpgUpdateFrequency = useAppStore(state => state.setEpgUpdateFrequency);
  const forceEpgUpdate = useAppStore(state => state.forceEpgUpdate);

  const handleSaveProfile = () => {
    if (editName.trim()) {
      userData.editProfile(editName.trim(), editAvatar);
    }
  };

  const [expandedGroups, setExpandedGroups] = useState([]);
  const [expandedRoots, setExpandedRoots] = useState(['Genres & Categories']);

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => prev.includes(groupName) ? prev.filter(g => g !== groupName) : [...prev, groupName]);
  };

  const toggleRoot = (rootName) => {
    setExpandedRoots(prev => prev.includes(rootName) ? prev.filter(r => r !== rootName) : [...prev, rootName]);
  };

  const KNOWN_REGIONS = ['US', 'USA', 'UK', 'CA', 'CAN', 'AU', 'NZ', 'FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'IE', 'ZA', 'IN', 'PK', 'BD', 'LK', 'MY', 'SG', 'PH', 'ID', 'TH', 'VN', 'CN', 'TW', 'HK', 'JP', 'KR', 'RU', 'UA', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'TR', 'IL', 'AE', 'SA', 'EG', 'MA', 'DZ', 'TN', 'AR', 'BR', 'CL', 'CO', 'PE', 'MX', 'LATINO', 'AFRICA', 'ARABIC', 'EX-YU', 'NORDIC', 'SCANDINAVIA', 'ASIA', 'EUROPE', 'CARIBBEAN'];

  const parseGroupName = (name) => {
    const lower = name.toLowerCase();

    // Explicit Latino/Hispanic check
    if (/(latino|latin|hispanic|espanol)/.test(lower)) return { isCountry: true, group: 'LATINO' };

    let potentialRegion = null;
    let match = name.match(/^\[([A-Z\s\-]+)\](.*)$/i);
    if (match) {
      potentialRegion = match[1].trim().toUpperCase();
    } else {
      match = name.match(/^([A-Z\s\-]+)\s*[|\-:]\s+(.*)$/i);
      if (match) {
        potentialRegion = match[1].trim().toUpperCase();
      }
    }

    if (potentialRegion) {
      if (KNOWN_REGIONS.includes(potentialRegion) || /^[A-Z]{2}$/.test(potentialRegion)) {
        return { isCountry: true, group: potentialRegion };
      }
    }

    return { isCountry: false };
  };

  const [isAdvancedExpandedCategories, setIsAdvancedExpandedCategories] = useState(false);
  const [isAdvancedExpandedParental, setIsAdvancedExpandedParental] = useState(false);

  const allValidFeeds = [
    ...(liveCategories || []).map(c => ({ ...c, _feed: 'Live' })),
    ...(vodCategories || []).map(c => ({ ...c, _feed: 'Movies' })),
    ...(seriesCategories || []).map(c => ({ ...c, _feed: 'Series' }))
  ].filter(cat => cat.category_id !== '0' && !JUNK_REGEX.test(cat.category_name));

  const countryGroupsMap = new Map();
  const fineTuneCategoriesMap = new Map();

  allValidFeeds.forEach(cat => {
    const { isCountry, group } = parseGroupName(cat.category_name);

    if (isCountry) {
      if (!countryGroupsMap.has(group)) {
        countryGroupsMap.set(group, { name: group, categoryIds: [] });
      }
      countryGroupsMap.get(group).categoryIds.push(cat.category_id);
    } else {
      if (!fineTuneCategoriesMap.has(cat.category_name)) {
        fineTuneCategoriesMap.set(cat.category_name, { ...cat, displayName: `${cat.category_name} (${cat._feed})` });
      }
    }
  });

  const countryGroups = Array.from(countryGroupsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const fineTuneCategories = Array.from(fineTuneCategoriesMap.values()).sort((a, b) => a.category_name.localeCompare(b.category_name));

  const renderCountryList = (mode) => {
    const isParental = mode === 'parental';

    const filteredCountries = countryGroups.filter(g => g.name.toLowerCase().includes(categorySearchQuery.toLowerCase()));

    if (filteredCountries.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>No countries match your search.</p>;

    return filteredCountries.map(group => {
      const allToggled = isParental
        ? group.categoryIds.every(id => userData.lockedCategories.includes(id))
        : group.categoryIds.every(id => userData.hiddenCategories.includes(id));

      return (
        <div key={group.name} className="glass-panel" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', opacity: allToggled && !isParental ? 0.6 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>{group.name}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{group.categoryIds.length} categories</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{allToggled ? (isParental ? 'Locked' : 'Hidden') : (isParental ? 'Unlocked' : 'Visible')}</span>
            <label className="toggle-switch" style={{ transform: 'scale(1.1)', transformOrigin: 'right center' }}>
              <input
                type="checkbox"
                checked={isParental ? allToggled : !allToggled}
                onChange={(e) => {
                  if (isParental) {
                    userData.setCategoriesState(group.categoryIds, { isLocked: e.target.checked });
                  } else {
                    userData.setCategoriesState(group.categoryIds, { isHidden: !e.target.checked });
                  }
                }}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      );
    });
  };

  const renderFineTuneList = (mode) => {
    const isParental = mode === 'parental';
    const isExpanded = isParental ? isAdvancedExpandedParental : isAdvancedExpandedCategories;
    const setIsExpanded = isParental ? setIsAdvancedExpandedParental : setIsAdvancedExpandedCategories;

    const filteredFeeds = fineTuneCategories.filter(cat =>
      cat.displayName.toLowerCase().includes(categorySearchQuery.toLowerCase())
    );

    if (filteredFeeds.length === 0 && categorySearchQuery.length > 0) return null;

    // Auto-expand if searching
    const actuallyExpanded = categorySearchQuery.length > 0 ? true : isExpanded;

    return (
      <div className="glass-panel" style={{ marginTop: '1.5rem', marginBottom: '1.5rem', flexDirection: 'column', alignItems: 'stretch', padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setIsExpanded(!actuallyExpanded)}>
            {actuallyExpanded ? <ChevronDown size={22} /> : <ChevronRight size={22} />}
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>Advanced: Fine-Tune Categories</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{filteredFeeds.length} feeds</span>
          </div>
        </div>

        {actuallyExpanded && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.5rem' }}>
            {filteredFeeds.map(cat => {
              const isToggled = isParental ? userData.lockedCategories.includes(cat.category_id) : userData.hiddenCategories.includes(cat.category_id);
              return (
                <div key={cat.category_id} className="glass-panel" style={{ margin: 0, padding: '0.75rem 1rem', opacity: isToggled && !isParental ? 0.6 : 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: isToggled && !isParental ? 'var(--text-secondary)' : 'white', fontWeight: isToggled ? (isParental ? 'bold' : 'normal') : 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '1rem' }}>
                    {cat.displayName}
                  </span>
                  <label className="toggle-switch" style={{ transform: 'scale(0.85)', transformOrigin: 'right center', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={isParental ? isToggled : !isToggled}
                      onChange={() => {
                        if (isParental) userData.toggleLockedCategory(cat.category_id);
                        else userData.toggleHiddenCategory(cat.category_id);
                      }}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="settings-overlay animate-fade-in" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>

        {/* LEFT SIDEBAR */}
        <div className="settings-sidebar">
          <h2 className="settings-title">Settings</h2>
          <div className="settings-tabs">
            {[
              { id: 'profile', label: 'Profile' },
              { id: 'home', label: 'Home Page' },
              { id: 'appearance', label: 'Appearance' },
              { id: 'playback', label: 'Playback' },
              { id: 'parental', label: 'Parental' },
              { id: 'categories', label: 'Categories' },
              { id: 'providers', label: 'Providers' },
              { id: 'epg', label: 'TV Guide (EPG)' },
              { id: 'advanced', label: 'Advanced' },
              { id: 'backup', label: 'Data Backup' }
            ].map(tab => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCategorySearchQuery('');
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-footer">
            <p style={{ margin: 0 }}>StreamPro Premium<br />Version 2.0.0</p>
          </div>
        </div>

        {/* RIGHT CONTENT AREA */}
        <div className="settings-content-wrapper">
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>

          <div className="settings-scroll-area">

            {activeTab === 'profile' && (
              <div className="settings-section">
                <h3>Edit Profile</h3>
                <p className="settings-desc">Customize your profile name and avatar.</p>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block', fontWeight: 'bold' }}>Profile Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleSaveProfile}
                    maxLength={15}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                  <div>
                    <h4 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>Auto-Login on Startup</h4>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Bypass the profile selection screen automatically.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={userData.autoLoginProfileId === activeProfile?.id}
                      onChange={(e) => userData.toggleAutoLogin(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', display: 'block', fontWeight: 'bold' }}>Profile Avatar</label>
                <div className="avatar-selection-grid">
                  {AVATARS.map(avatar => (
                    <button
                      type="button"
                      key={avatar}
                      className={`avatar-choice ${editAvatar === avatar ? 'active' : ''}`}
                      onClick={() => {
                        setEditAvatar(avatar);
                        userData.editProfile(editName.trim(), avatar);
                      }}
                    >
                      {avatar.includes('/avatars/') ? (
                        <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        avatar
                      )}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <h3 style={{ color: '#ef4444' }}>Danger Zone</h3>
                  <p className="settings-desc">Clear all your "Continue Watching" progress and "Watched" history across the app. This cannot be undone.</p>
                  <button
                    className="danger-button"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to clear your entire watch history?")) {
                        userData.clearHistory();
                      }
                    }}
                  >
                    Clear Watch History
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'home' && (
              <div className="settings-section">
                <h3>Home Page Options</h3>
                <p className="settings-desc">Customize which rows appear on your Home Page dashboard.</p>

                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>Continue Watching</h4>
                      <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Show your recently watched or paused items.</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={userData.homeOptions.showContinueWatching}
                        onChange={(e) => userData.updateHomeOptions({ showContinueWatching: e.target.checked })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  {userData.homeOptions.showContinueWatching && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '1.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                      <div>
                        <h4 style={{ margin: 0, color: 'white', fontSize: '0.9rem', fontWeight: 'bold' }}>Include Live TV</h4>
                        <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Show Live TV channels in Continue Watching.</p>
                      </div>
                      <label className="toggle-switch" style={{ transform: 'scale(0.85)' }}>
                        <input
                          type="checkbox"
                          checked={userData.homeOptions.showLiveInContinueWatching}
                          onChange={(e) => userData.updateHomeOptions({ showLiveInContinueWatching: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  )}

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>New Episodes</h4>
                      <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Show recently added episodes for your watched series.</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={userData.homeOptions.showNewEpisodes}
                        onChange={(e) => userData.updateHomeOptions({ showNewEpisodes: e.target.checked })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>Because You Watched</h4>
                      <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Show personalized AI recommendations.</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={userData.homeOptions.showBecauseYouWatched}
                        onChange={(e) => userData.updateHomeOptions({ showBecauseYouWatched: e.target.checked })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>Trending Action & Thrillers</h4>
                      <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Show the trending action category row.</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={userData.homeOptions.showTrendingAction}
                        onChange={(e) => userData.updateHomeOptions({ showTrendingAction: e.target.checked })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>Feel-Good Comedies</h4>
                      <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Show the trending comedy category row.</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={userData.homeOptions.showComedies}
                        onChange={(e) => userData.updateHomeOptions({ showComedies: e.target.checked })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>Binge-Worthy Series</h4>
                      <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Show the popular series category row.</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={userData.homeOptions.showBingeSeries}
                        onChange={(e) => userData.updateHomeOptions({ showBingeSeries: e.target.checked })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="settings-section">
                <h3>Theme & UI</h3>
                <p className="settings-desc">Customize your premium viewing experience.</p>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ width: '100%' }}>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Startup Tab</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Choose which screen opens when the app launches.</p>
                    <select
                      className="glass-input"
                      style={{ marginTop: '0.75rem', width: '200px' }}
                      value={userData.startupTab}
                      onChange={(e) => userData.setStartupTab(e.target.value)}
                    >
                      <option value="home">Home</option>
                      <option value="live">Live TV</option>
                      <option value="vod">Movies</option>
                      <option value="series">Series</option>
                    </select>
                  </div>

                  <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>App Interface Zoom</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Magnify everything on the screen perfectly without breaking the layout.</p>
                    <select
                      className="glass-input"
                      style={{ marginTop: '0.75rem', width: '200px' }}
                      value={userData.uiZoom}
                      onChange={(e) => userData.setUiZoom(parseFloat(e.target.value))}
                    >
                      <option value={0.75}>75% (Smallest)</option>
                      <option value={0.9}>90% (Compact)</option>
                      <option value={1.0}>100% (Default)</option>
                      <option value={1.1}>110% (Large)</option>
                      <option value={1.25}>125% (Larger)</option>
                      <option value={1.5}>150% (Huge)</option>
                      <option value={1.75}>175% (Massive)</option>
                    </select>
                  </div>

                  <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                    <div className="glass-panel" style={{ padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', color: 'white' }}>Time Format</h4>
                      <select
                        className="glass-input"
                        style={{ width: '150px', padding: '4px 8px' }}
                        value={userData.timeFormat}
                        onChange={(e) => userData.setTimeFormat(e.target.value)}
                      >
                        <option value="12h">12-Hour (AM/PM)</option>
                        <option value="24h">24-Hour (Military)</option>
                      </select>
                    </div>

                    <div className="glass-panel" style={{ width: '100%', flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>EPG Time Offset</h4>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Shift the TV Guide forward or backward if your provider's timezone is incorrect. App will restart.</p>
                      </div>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%' }}>
                        <input
                          type="range" min="-12" max="12" step="1"
                          value={userData.epgOffset}
                          onChange={(e) => userData.setEpgOffset(e.target.value)}
                          onMouseUp={(e) => {
                            if (window.confirm("App must restart to rebuild the EPG timeline. Restart now?")) {
                              window.location.reload();
                            }
                          }}
                          style={{ flex: 1 }}
                        />
                        <span style={{ color: 'white', fontWeight: 'bold', minWidth: '80px', textAlign: 'right' }}>
                          {userData.epgOffset > 0 ? '+' : ''}{userData.epgOffset} Hours
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', color: 'white' }}>Theme Color</h4>
                <div className="color-grid">
                  {THEME_COLORS.map(color => (
                    <button
                      key={color.hex}
                      className={`color-swatch ${currentTheme === color.hex ? 'active' : ''}`}
                      style={{ backgroundColor: color.hex }}
                      onClick={() => {
                        userData.setThemeColor(color.hex);
                      }}
                      title={color.name}
                    >
                      {currentTheme === color.hex && <Check size={24} color="white" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'playback' && (
              <div className="settings-section">
                <h3>Playback & Features</h3>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Virtual RAM Transcoder Buffer</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Adjust the size of the timeshift buffer for live TV when using the PC transcoder. Higher values use more memory but allow you to pause live TV for longer periods.</p>
                  </div>
                  <select
                    className="glass-input"
                    style={{ width: '100%', maxWidth: '300px' }}
                    value={userData.virtualRamSize || 5}
                    onChange={(e) => userData.setVirtualRamSize(parseInt(e.target.value))}
                  >
                    <option value={5}>Low Spec (~12 MB / 20 Seconds)</option>
                    <option value={20}>Standard (~50 MB / 1.5 Minutes)</option>
                    <option value={75}>High Spec (~180 MB / 5 Minutes)</option>
                    <option value={225}>Extreme (~500 MB / 15 Minutes)</option>
                  </select>
                </div>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Stream Buffer Size</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Increase this if you experience frequent stuttering on Live TV. Larger buffers delay live playback slightly.</p>
                  </div>
                  <select
                    className="glass-input"
                    style={{ width: '100%', maxWidth: '300px' }}
                    value={userData.bufferSize}
                    onChange={(e) => userData.setBufferSize(e.target.value)}
                  >
                    <option value="small">Small (Fastest)</option>
                    <option value="medium">Medium (Default)</option>
                    <option value="large">Large (More Stable)</option>
                  </select>
                </div>

                <div className="glass-panel">
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Auto-Play Next Episode</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Automatically start playing the next episode of a series when the current one finishes.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={userData.autoPlayNextEpisode !== false}
                      onChange={userData.toggleAutoPlayNextEpisode}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="glass-panel">
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>"Are You Still Watching?" Timeout</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Pause playback and display a prompt after 4 hours of inactivity.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={idleTimeoutEnabled}
                      onChange={(e) => setIdleTimeoutEnabled(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="glass-panel">
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Multi-View Grid</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Enable the split-screen multi-view functionality for watching multiple streams simultaneously.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={userData.enableMultiView !== false}
                      onChange={userData.toggleMultiView}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>


                <div className="glass-panel">
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Catch-Up TV (Timeshift)</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Enable backwards timeline history. Disable if your provider doesn't support it to save bandwidth.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={userData.enableCatchup !== false}
                      onChange={(e) => userData.setEnableCatchup(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="glass-panel">
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Spoiler-Free Sports Mode</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Hides timelines, durations, and progress bars so you don't know how much time is left in a recorded game.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={userData.spoilerFreeMode === true}
                      onChange={(e) => userData.setSpoilerFreeMode(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="glass-panel">
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Disable Hardware Acceleration</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Toggle this ON if you experience green/black screens during video playback. App will restart.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={userData.hwAccelDisabled === true}
                      onChange={(e) => {
                        userData.toggleHardwareAcceleration(e.target.checked);
                        if (window.confirm("App must restart to apply hardware acceleration changes. Restart now?")) {
                          window.location.reload();
                        }
                      }}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>TMDB API Key</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Enter your TMDB API Key to enable AI "For You" recommendations and rich cinematic metadata.</p>
                  </div>
                  <input
                    type="password"
                    className="glass-input"
                    placeholder="Paste your TMDB API Key here"
                    value={userData.tmdbApiKey}
                    onChange={(e) => userData.setTmdbApiKey(e.target.value)}
                  />
                </div>
              </div>
            )}

            {activeTab === 'parental' && (
              <div className="settings-section">
                <h3>Parental Controls (PIN Lock)</h3>
                <p className="settings-desc">Lock specific categories with a 4-digit PIN code.</p>

                {!userData.pinCode ? (
                  <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem' }}>
                    <h4 style={{ margin: 0, color: 'white' }}>Set up a PIN</h4>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <input
                        type="password" maxLength="4" placeholder="Enter 4-digit PIN"
                        className="glass-input"
                        value={setupPin} onChange={e => setSetupPin(e.target.value.replace(/\D/g, ''))}
                        style={{ textAlign: 'center', letterSpacing: '8px' }}
                      />
                      <input
                        type="password" maxLength="4" placeholder="Confirm PIN"
                        className="glass-input"
                        value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                        style={{ textAlign: 'center', letterSpacing: '8px' }}
                      />
                    </div>
                    {pinError && <p style={{ color: '#ef4444', fontSize: '0.9rem', margin: 0 }}>{pinError}</p>}
                    <button
                      className="primary-button"
                      onClick={() => {
                        if (setupPin.length !== 4) return setPinError('PIN must be exactly 4 digits.');
                        if (setupPin !== confirmPin) return setPinError('PINs do not match.');
                        userData.setPinCode(setupPin);
                        setIsUnlocked(true);
                        setPinError('');
                      }}
                    >
                      Save PIN
                    </button>
                  </div>
                ) : !isUnlocked ? (
                  <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <h4 style={{ margin: 0, color: 'white' }}>Enter PIN to Edit Settings</h4>
                    <input
                      type="password" maxLength="4" placeholder="****"
                      className="glass-input"
                      value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '150px', textAlign: 'center', letterSpacing: '8px' }}
                    />
                    {pinError && <p style={{ color: '#ef4444', fontSize: '0.9rem', margin: 0 }}>{pinError}</p>}
                    <button
                      className="primary-button"
                      onClick={() => {
                        if (pinInput === userData.pinCode) {
                          setIsUnlocked(true);
                          setPinError('');
                        } else {
                          setPinError('Incorrect PIN.');
                          setPinInput('');
                        }
                      }}
                    >
                      Unlock
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0, color: 'white' }}>Locked Categories</h4>
                      <button
                        onClick={() => { userData.setPinCode(null); setIsUnlocked(false); }}
                        className="danger-button"
                        style={{ width: 'auto', padding: '8px 16px', fontSize: '0.9rem' }}
                      >
                        Remove PIN
                      </button>
                    </div>


                    <div className="glass-panel" style={{ marginBottom: '1.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <div>
                          <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>English Countries Only</h4>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Instantly lock all foreign language countries to quickly declutter your list.</p>
                        </div>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={countryGroups.filter(g => !['US', 'USA', 'UK', 'CA', 'CAN', 'AU', 'NZ', 'IE', 'ZA'].includes(g.name)).flatMap(g => g.categoryIds).every(id => userData.lockedCategories.includes(id))}
                            onChange={(e) => {
                              const englishRegions = ['US', 'USA', 'UK', 'CA', 'CAN', 'AU', 'NZ', 'IE', 'ZA'];
                              const foreignCategoryIds = countryGroups
                                .filter(g => !englishRegions.includes(g.name))
                                .flatMap(g => g.categoryIds);
                              userData.setCategoriesState(foreignCategoryIds, { isLocked: e.target.checked });
                            }}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                      <input
                        type="text"
                        className="glass-input"
                        placeholder="Search categories to lock/unlock..."
                        value={categorySearchQuery}
                        onChange={(e) => setCategorySearchQuery(e.target.value)}
                      />
                    </div>

                    <div style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                      {renderCountryList('parental')}
                      {renderFineTuneList('parental')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'categories' && (
              <div className="settings-section">
                <h3>Manage Categories</h3>
                <p className="settings-desc">Hide unwanted international or 24/7 categories from the sidebar and TV guide.</p>

                <div className="glass-panel" style={{ marginBottom: '1.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Hide Channels Without Guide Data</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Automatically cleans up junk channels. Intelligently preserves 24/7, Adult, Movies, and PPV networks.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={userData.hideEmptyEpgChannels === true}
                      onChange={(e) => userData.setHideEmptyEpgChannels(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {adultCategoryIds.length > 0 && (
                  <div className="glass-panel" style={{ marginBottom: '1.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', border: '1px solid rgba(255, 50, 50, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Enable Adult Content ({allAdultCats.length} Categories)</h4>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Show adult channels in your TV Guide and sidebar.</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={isAdultEnabled}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            if (checked) {
                              const wantPin = window.confirm("Adult content is now visible. Would you like to set a Parental PIN to protect these categories?");
                              if (wantPin) {
                                const newPin = window.prompt("Enter a 4-digit PIN:");
                                if (newPin && /^\d{4}$/.test(newPin)) {
                                  userData.setPinCode(newPin);
                                  userData.setCategoriesState(adultCategoryIds, { isHidden: false, isLocked: true });
                                  alert("PIN set successfully. Adult categories are now visible but locked behind PIN.");
                                  return;
                                } else if (newPin) {
                                  alert("Invalid PIN. Must be exactly 4 digits. Categories were unhidden without a lock.");
                                }
                              }
                              userData.setCategoriesState(adultCategoryIds, { isHidden: false });
                            } else {
                              userData.setCategoriesState(adultCategoryIds, { isHidden: true });
                            }
                          }}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                )}
                <div className="glass-panel" style={{ marginBottom: '1.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>English Countries Only</h4>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Instantly hide all foreign language countries to quickly declutter your guide.</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={countryGroups.filter(g => !['US', 'USA', 'UK', 'CA', 'CAN', 'AU', 'NZ', 'IE', 'ZA'].includes(g.name)).flatMap(g => g.categoryIds).every(id => userData.hiddenCategories.includes(id))}
                        onChange={(e) => {
                          const englishRegions = ['US', 'USA', 'UK', 'CA', 'CAN', 'AU', 'NZ', 'IE', 'ZA'];
                          const foreignCategoryIds = countryGroups
                            .filter(g => !englishRegions.includes(g.name))
                            .flatMap(g => g.categoryIds);
                          userData.setCategoriesState(foreignCategoryIds, { isHidden: e.target.checked });
                        }}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="Search categories to hide/show..."
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                  />
                </div>

                <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {renderCountryList('categories')}
                  {renderFineTuneList('categories')}
                </div>
              </div>
            )}

            {activeTab === 'providers' && (
              <div className="settings-section">
                <h3>Manage Providers</h3>
                <p className="settings-desc">Add a backup provider for seamless auto-fallback during network drops.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {(userData.providers || []).map(p => (
                    <div key={p.id} className="glass-panel" style={{ border: p.isPrimary ? '1px solid var(--accent-primary)' : '1px solid rgba(255, 255, 255, 0.03)', background: p.isPrimary ? 'rgba(99, 102, 241, 0.05)' : '' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {p.name}
                          {p.isPrimary && <span style={{ fontSize: '0.7rem', padding: '3px 8px', background: 'var(--accent-primary)', borderRadius: '6px', fontWeight: 'bold' }}>PRIMARY</span>}
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{p.url} ({p.username})</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!p.isPrimary && (
                          <button
                            onClick={() => userData.setPrimaryProvider(p.id)}
                            style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}
                          >
                            Set Primary
                          </button>
                        )}
                        <button
                          onClick={() => userData.removeProvider(p.id)}
                          className="danger-button"
                          style={{ width: 'auto', padding: '8px 16px' }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'stretch', marginTop: '2rem', background: 'rgba(0,0,0,0.2)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: 'white' }}>Add New Provider</h4>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.target);
                    let cleanUrl = fd.get('url').trim();
                    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
                    userData.addProvider(fd.get('name'), cleanUrl, fd.get('user').trim(), fd.get('pass').trim());
                    e.target.reset();
                  }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input name="name" type="text" placeholder="Provider Nickname (e.g. Backup)" required className="glass-input" />
                    <input name="url" type="url" placeholder="http://iptv-server.com:8080" required className="glass-input" />
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <input name="user" type="text" placeholder="Username" required className="glass-input" />
                      <input name="pass" type="password" placeholder="Password" required className="glass-input" />
                    </div>
                    <button type="submit" className="primary-button" style={{ marginTop: '0.5rem' }}>
                      Add Connection
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'epg' && (
              <div className="settings-section">
                <h3>TV Guide (EPG) Sync</h3>
                <p className="settings-desc">Manage how often the application rebuilds the TV Guide cache.</p>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Update Frequency</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>How often should the app check for new TV Guide data? Frequent updates use more CPU.</p>
                  </div>
                  <select
                    className="glass-input"
                    style={{ width: '200px' }}
                    value={epgUpdateFrequency}
                    onChange={(e) => setEpgUpdateFrequency(parseInt(e.target.value, 10))}
                  >
                    <option value={6}>Every 6 Hours</option>
                    <option value={12}>Every 12 Hours (Default)</option>
                    <option value={24}>Every 24 Hours</option>
                    <option value={48}>Every 48 Hours</option>
                  </select>
                </div>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Force Update Now</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Immediately wipe the local guide cache and force a complete rebuild from your EPG sources. App will restart.</p>
                  </div>
                  <button
                    className="danger-button"
                    style={{ width: 'auto', padding: '8px 16px' }}
                    onClick={() => {
                      if (window.confirm("This will force the TV Guide to completely rebuild on the next launch. Restart now?")) {
                        forceEpgUpdate();
                      }
                    }}
                  >
                    Force EPG Sync
                  </button>
                </div>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem', marginTop: '1.5rem' }}>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>TV Guide "Now" Line</h4>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Show a global vertical line across the TV Guide to easily see the current time.</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={userData.showEpgNowLine !== false}
                          onChange={userData.toggleEpgNowLine}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    {userData.showEpgNowLine !== false && (
                      <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="color"
                          value={userData.epgNowLineColor || userData.themeColor}
                          onChange={(e) => userData.setEpgNowLineColor(e.target.value)}
                          style={{ width: '32px', height: '32px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Line Color (Default is Theme Color)</span>
                        {userData.epgNowLineColor && (
                          <button onClick={() => userData.setEpgNowLineColor('')} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem', marginLeft: 'auto' }}>Reset</button>
                        )}
                      </div>
                    )}
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', width: '100%', margin: '0.5rem 0' }} />

                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>TV Guide Progress Fill</h4>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Fill the background of the live program blocks to indicate playback progress.</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={userData.showEpgProgressFill !== false}
                          onChange={userData.toggleEpgProgressFill}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    {userData.showEpgProgressFill !== false && (
                      <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="color"
                          value={userData.epgProgressFillColor || '#ffffff'}
                          onChange={(e) => userData.setEpgProgressFillColor(e.target.value)}
                          style={{ width: '32px', height: '32px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Fill Color</span>
                      </div>
                    )}
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', width: '100%', margin: '0.5rem 0' }} />

                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>TV Guide Live Indicator Dot</h4>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Show a pulsating dot on currently airing programs.</p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={userData.showEpgLiveDot !== false}
                          onChange={userData.toggleEpgLiveDot}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="settings-section">
                <h3>Advanced Network Options</h3>
                <p className="settings-desc">Modify network behavior for strict providers.</p>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Custom User Agent</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Some providers block the default media player headers. Setting a custom User Agent (e.g., `VLC/3.0.9 LibVLC/3.0.9`) can bypass this restriction. Leave blank for default.</p>
                  </div>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. VLC/3.0.9 LibVLC/3.0.9"
                    value={userData.customUserAgent}
                    onChange={(e) => userData.setCustomUserAgent(e.target.value)}
                  />
                </div>

                <div className="glass-panel" style={{ marginTop: '1.5rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Auto-Start on Boot</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Launch the application automatically in the background when the PC boots.</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={autoStartOnBoot}
                      onChange={(e) => setAutoStartOnBoot(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem', marginTop: '1.5rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Reset UI Tooltips</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Restore any dismissed "one-time" hints, such as the drag-and-drop tutorial banners, so they show up again.</p>
                  </div>
                  <button
                    className="secondary-button"
                    style={{ width: 'auto', padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '8px', cursor: 'pointer' }}
                    onClick={() => {
                      userData.resetDragDropHint();
                      window.localStorage.removeItem('seen_multiview_tooltip');
                      alert("Tooltips have been reset! The app will reload to apply changes.");
                      window.location.reload();
                    }}
                  >
                    Reset Tooltips
                  </button>
                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem', marginTop: '1.5rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: '#ef4444' }}>Factory Reset App</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Log out entirely, clear your IPTV credentials, and wipe all local settings.</p>
                  </div>
                  <button
                    className="danger-button"
                    style={{ width: 'auto', padding: '8px 16px' }}
                    onClick={() => {
                      if (window.confirm("Are you sure you want to log out and wipe all app data? You will need to enter your IPTV credentials again.")) {
                        localStorage.removeItem('streampro_user_data');
                        window.location.reload();
                      }
                    }}
                  >
                    Wipe App & Log Out
                  </button>
                </div>
              </div>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem', marginTop: '1.5rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Clear Local Cache</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Flushes all downloaded TMDB posters, EPG data, and local state to free up hard drive space and fix UI glitches. The app will restart.</p>
                  </div>
                  <button
                    className="danger-button"
                    style={{ width: 'auto', padding: '8px 16px' }}
                    onClick={useAppStore.getState().forceEpgUpdate}
                  >
                    Clear Cache & Restart
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'backup' && (
              <div className="settings-section">
                <h3>Local Backup & Restore</h3>
                <p className="settings-desc">Save a copy of all your settings, favorites, and watch history, or restore from a previous backup.</p>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Backup Data</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Download a .bak file containing your current configuration.</p>
                  </div>
                  <button
                    className="primary-button"
                    style={{ width: 'auto', padding: '8px 16px' }}
                    onClick={() => {
                      const data = {
                        userData: window.localStorage.getItem('streampro_user_data'),
                        reminders: window.localStorage.getItem('streampro_reminders'),
                        volume: window.localStorage.getItem('streampro_volume'),
                      };
                      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `streampro-backup-${new Date().toISOString().split('T')[0]}.bak`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download Backup
                  </button>
                </div>

                <div className="glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem', marginTop: '1.5rem' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'white' }}>Restore Data</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Upload a .bak file to restore your configuration. This will overwrite your current settings.</p>
                  </div>
                  <input
                    type="file"
                    accept=".bak,.json"
                    style={{ display: 'block', color: 'white' }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      if (window.confirm('Are you sure you want to restore from this backup? Your current settings will be overwritten.')) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          try {
                            const data = JSON.parse(event.target.result);
                            if (data.userData) window.localStorage.setItem('streampro_user_data', data.userData);
                            if (data.reminders) window.localStorage.setItem('streampro_reminders', data.reminders);
                            if (data.volume) window.localStorage.setItem('streampro_volume', data.volume);
                            alert('Restore complete! The app will now reload.');
                            window.location.reload();
                          } catch (err) {
                            alert('Invalid backup file.');
                          }
                        };
                        reader.readAsText(file);
                      }
                    }}
                  />
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
