import React, { useState } from 'react';
import { Tv, Key, Globe, LogIn } from 'lucide-react';
import './LoginScreen.css';

const LoginScreen = ({ onLogin }) => {
  const [url, setUrl] = useState('http://kytv.xyz');
  const [username, setUsername] = useState('Shane1980!');
  const [password, setPassword] = useState('Frozen14');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url || !username || !password) {
      setError("Please fill in all fields.");
      return;
    }
    
    setError(null);
    setIsLoading(true);

    try {
      let cleanUrl = url.trim();
      if (cleanUrl.endsWith('/')) {
        cleanUrl = cleanUrl.slice(0, -1);
      }

      setTimeout(() => {
        onLogin(cleanUrl, username.trim(), password.trim(), rememberMe);
      }, 800);
      
    } catch (err) {
      setError("Failed to connect to the server.");
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <img src="/login_bg.png" alt="Background" className="login-background-img" />
      <div className="login-overlay"></div>
      
      <div className="login-content animate-fade-in">
        <div className="login-left-panel">
          <div className="brand-header">
            <Tv size={48} className="brand-icon" />
            <h1 className="brand-title">StreamPro</h1>
          </div>
          <div className="brand-tagline">
            <h2>The ultimate cinematic<br/>IPTV experience.</h2>
            <p>Connect your provider and unlock thousands of channels, movies, and series with premium viewing modes.</p>
          </div>
        </div>

        <div className="login-right-panel">
          <div className="login-box">
            <h2 className="login-box-title">Welcome Back</h2>
            <p className="login-box-subtitle">Enter your subscription details to continue</p>

            {error && <div className="login-error animate-fade-in">{error}</div>}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="input-wrapper">
                <Globe size={20} className="input-icon" />
                <input 
                  type="url" 
                  placeholder="Provider URL" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              <div className="input-wrapper">
                <Tv size={20} className="input-icon" />
                <input 
                  type="text" 
                  placeholder="Username" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="input-wrapper">
                <Key size={20} className="input-icon" />
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="login-options">
                <label className="remember-me">
                  <input 
                    type="checkbox" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
              </div>

              <button type="submit" className="login-btn" disabled={isLoading}>
                {isLoading ? <span className="spinner"></span> : <><LogIn size={20} /> Sign In</>}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
