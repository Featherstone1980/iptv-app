import React, { useEffect } from 'react';
import { Home, Tv, Film, Settings, ListVideo, Search, Heart, Users, Video } from 'lucide-react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import './Sidebar.css';

const NavItem = ({ item, activeTab, setActiveTab, onOpenSearch }) => {
  const { ref, focused } = useFocusable({
    onEnterPress: () => {
      if (item.id === 'search' && onOpenSearch) onOpenSearch();
      else setActiveTab(item.id);
    }
  });

  return (
    <button
      ref={ref}
      className={`nav-item ${activeTab === item.id ? 'active' : ''} ${focused ? 'focused' : ''}`}
      onClick={(e) => {
        if (item.id === 'search' && onOpenSearch) onOpenSearch();
        else setActiveTab(item.id);
        e.currentTarget.blur();
      }}
    >
      {item.icon}
      <span>{item.label}</span>
    </button>
  );
};

const Sidebar = ({ activeTab, setActiveTab, onOpenSearch, onOpenSettings, onLogout, activeProfile }) => {
  const { ref, focusKey, focusSelf } = useFocusable({
    focusable: true,
    saveLastFocusedChild: false,
    trackChildren: true,
    autoRestoreFocus: true,
    isFocusBoundary: true
  });

  useEffect(() => {
    focusSelf();
  }, [focusSelf]);

  const navItems = [
    { id: 'search', icon: <Search size={24} />, label: 'Search' },
    { id: 'home', icon: <Home size={24} />, label: 'Home' },
    { id: 'live', icon: <Tv size={24} />, label: 'Live TV' },
    { id: 'movies', icon: <Film size={24} />, label: 'Movies' },
    { id: 'series', icon: <ListVideo size={24} />, label: 'Series' },
    { id: 'library', icon: <Heart size={24} />, label: 'My Library' },
    { id: 'recordings', icon: <Video size={24} />, label: 'DVR & Schedules' },
  ];

  return (
    <aside ref={ref} className="sidebar glass-panel flex flex-col justify-between group/sidebar">
      <div className="flex flex-col gap-6 w-full">
          
          {/* Active Profile Avatar */}
          {activeProfile && (
            <div 
              className="sidebar-brand mb-6 flex flex-col items-center cursor-pointer group"
              onClick={(e) => {
                if (onOpenSettings) onOpenSettings();
                e.currentTarget.blur();
              }}
              title="Edit Profile"
            >
              <div 
                className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mb-2 shadow-lg group-hover:scale-105 group-hover:border-white/30 transition-all overflow-hidden bg-white/5"
              >
                {activeProfile.avatar && activeProfile.avatar.includes('/avatars/') ? (
                  <img src={activeProfile.avatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl">{activeProfile.avatar}</span>
                )}
              </div>
              <span className="sidebar-brand-name text-xs uppercase tracking-widest font-bold text-[var(--accent-primary)] group-hover:text-white text-center px-1">
                {activeProfile.name}
              </span>
            </div>
          )}

          <nav className="flex flex-col gap-2 w-full">
            {navItems.map((item) => (
              <NavItem key={item.id} item={item} activeTab={activeTab} setActiveTab={setActiveTab} onOpenSearch={onOpenSearch} />
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2 mb-4 w-full">
          <button 
            className="nav-item"
            onClick={(e) => {
              if (onOpenSettings) onOpenSettings();
              e.currentTarget.blur();
            }}
          >
            <Settings size={24} />
            <span>Settings</span>
          </button>
          <button 
            className="nav-item text-white/50 hover:text-white mt-4"
            onClick={(e) => {
              if (onLogout) onLogout();
              e.currentTarget.blur();
            }}
          >
            <Users size={24} />
            <span>Switch Profile</span>
          </button>
      </div>
    </aside>
  );
};

export default Sidebar;
