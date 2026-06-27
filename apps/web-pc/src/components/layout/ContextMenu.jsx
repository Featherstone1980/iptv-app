import React, { useEffect, useRef } from 'react';
import { Play, Grid, Heart, X } from 'lucide-react';
import { useAppStore } from "../../store/useAppStore";

const ContextMenu = ({ userData }) => {
  const { contextMenu, closeContextMenu, addMultiViewPlayer, activePlayers } = useAppStore();
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        closeContextMenu();
      }
    };
    
    // Also close on scroll to prevent detached menus
    const handleScroll = () => {
      if (contextMenu.isOpen) closeContextMenu();
    };

    if (contextMenu.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu.isOpen, closeContextMenu]);

  if (!contextMenu.isOpen || !contextMenu.item) return null;

  const isFavorite = userData?.liveFavorites?.includes(contextMenu.item.stream_id || contextMenu.item.id);
  const isMultiViewFull = activePlayers?.length >= 4;
  
  // Calculate position to prevent overflowing off-screen
  let top = contextMenu.y;
  let left = contextMenu.x;
  
  // Simple boundary check (assuming max menu height ~200px and width ~250px)
  if (top > window.innerHeight - 200) top = window.innerHeight - 200;
  if (left > window.innerWidth - 250) left = window.innerWidth - 250;

  return (
    <div 
      ref={menuRef}
      className="context-menu animate-fade-in"
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        background: 'rgba(20, 20, 25, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding: '0.5rem',
        zIndex: 999999,
        boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: '220px'
      }}
      onContextMenu={(e) => e.preventDefault()} // Prevent native menu from opening OVER this one
    >
      <div style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
        <h4 style={{ margin: 0, color: 'white', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {contextMenu.item.name || contextMenu.item.title || 'Channel'}
        </h4>
      </div>

      <button 
        className="context-menu-item"
        onClick={() => {
          // Play logic usually handled by a prop or global player state, but for now we'll just close it 
          // because a proper play event needs the EPG callbacks. Actually, we can dispatch to activePlayers!
          useAppStore.getState().setActivePlayer({
            url: contextMenu.item.url || `http://localhost:3001/live/${contextMenu.item.stream_id}.m3u8`,
            item: contextMenu.item
          });
          closeContextMenu();
        }}
        style={{ background: 'transparent', border: 'none', color: 'white', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', borderRadius: '8px', textAlign: 'left', transition: 'background 0.2s' }}
        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <Play size={18} /> <span style={{ fontWeight: '500' }}>Play Channel</span>
      </button>

      <button 
        className="context-menu-item"
        onClick={() => {
          if (isMultiViewFull) return;
          addMultiViewPlayer({
            url: contextMenu.item.url || `http://localhost:3001/live/${contextMenu.item.stream_id}.m3u8`,
            item: contextMenu.item
          });
          closeContextMenu();
        }}
        style={{ background: 'transparent', border: 'none', color: isMultiViewFull ? 'rgba(255,255,255,0.3)' : 'white', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: isMultiViewFull ? 'not-allowed' : 'pointer', borderRadius: '8px', textAlign: 'left', transition: 'background 0.2s' }}
        onMouseOver={(e) => { if(!isMultiViewFull) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        disabled={isMultiViewFull}
      >
        <Grid size={18} /> <span style={{ fontWeight: '500' }}>Add to Multi-View {isMultiViewFull && '(Full)'}</span>
      </button>


      <button 
        className="context-menu-item"
        onClick={() => {
          if (isFavorite) {
            userData?.removeLiveFavorite(contextMenu.item.stream_id || contextMenu.item.id);
          } else {
            userData?.addLiveFavorite(contextMenu.item.stream_id || contextMenu.item.id);
          }
          closeContextMenu();
        }}
        style={{ background: 'transparent', border: 'none', color: 'white', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', borderRadius: '8px', textAlign: 'left', transition: 'background 0.2s' }}
        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <Heart size={18} fill={isFavorite ? 'var(--accent-primary)' : 'none'} color={isFavorite ? 'var(--accent-primary)' : 'white'} /> 
        <span style={{ fontWeight: '500' }}>{isFavorite ? 'Remove Favorite' : 'Add to Favorites'}</span>
      </button>

    </div>
  );
};

export default ContextMenu;
