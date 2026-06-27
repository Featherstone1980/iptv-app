import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { AVATARS } from '../../hooks/useUserData';
import './ProfileSelectionScreen.css';

const ProfileSelectionScreen = ({ profiles, onSelectProfile, onAddProfile, onLogout, initialAutoLogin = false }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [autoLogin, setAutoLogin] = useState(initialAutoLogin);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (newName.trim()) {
      onAddProfile(newName.trim(), selectedAvatar);
      setIsAdding(false);
      setNewName('');
    }
  };

  const renderAvatar = (avatarValue) => {
    if (avatarValue && avatarValue.startsWith('/')) {
      return <img src={avatarValue} alt="Avatar" className="avatar-img" />;
    }
    return <span className="avatar-emoji">{avatarValue}</span>;
  };

  return (
    <div className="profile-container animate-fade-in">
      <img src="/login_bg.png" alt="Background" className="profile-background-img" />
      <div className="profile-overlay"></div>

      {!isAdding ? (
        <div className="profile-selection-box">
          <h1 className="profile-title">Who's watching?</h1>
          
          <div className="profiles-grid">
            {profiles.map(profile => (
              <button 
                key={profile.id} 
                className="profile-card group"
                onClick={() => onSelectProfile(profile.id, autoLogin)}
              >
                <div className="profile-avatar-wrapper">
                  {renderAvatar(profile.avatar)}
                  <div className="profile-avatar-border"></div>
                </div>
                <div className="profile-name">{profile.name}</div>
              </button>
            ))}

            <button 
              className="profile-card add-profile-btn group"
              onClick={() => setIsAdding(true)}
            >
              <div className="profile-avatar-wrapper add-avatar-wrapper">
                <Plus size={64} className="add-icon" />
                <div className="profile-avatar-border"></div>
              </div>
              <div className="profile-name">Add Profile</div>
            </button>
          </div>

          <div className="profile-options">
            <label className="auto-login-label">
              <input 
                type="checkbox" 
                checked={autoLogin} 
                onChange={(e) => setAutoLogin(e.target.checked)} 
              />
              Auto-login to selected profile next time
            </label>
          </div>

          <button className="logout-provider-btn" onClick={onLogout}>
            Logout of Provider
          </button>
        </div>
      ) : (
        <div className="profile-add-box animate-fade-in">
          <button className="close-add-btn" onClick={() => setIsAdding(false)}>
            <X size={32} />
          </button>
          
          <h2 className="profile-title">Create Profile</h2>
          <p className="profile-subtitle">Choose an avatar and name for the new profile</p>
          
          <form onSubmit={handleAddSubmit} className="add-profile-form">
            <div className="avatar-selection-grid">
              {AVATARS.map((avatar, idx) => (
                <button
                  type="button"
                  key={idx}
                  className={`avatar-choice ${selectedAvatar === avatar ? 'active' : ''}`}
                  onClick={() => setSelectedAvatar(avatar)}
                >
                  <img src={avatar} alt={`Avatar option ${idx + 1}`} className="avatar-choice-img" />
                  <div className="avatar-choice-ring"></div>
                </button>
              ))}
            </div>

            <div className="input-group">
              <input 
                type="text" 
                placeholder="Profile Name" 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                maxLength={15}
                required
              />
            </div>

            <button type="submit" className="login-btn">
              Save Profile
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ProfileSelectionScreen;
