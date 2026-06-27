import React, { useState } from 'react';
import { X } from 'lucide-react';

const PinPromptModal = ({ onClose, onSuccess, expectedPin }) => {
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (pinInput === expectedPin) {
      onSuccess();
    } else {
      setError('Incorrect PIN');
      setPinInput('');
    }
  };

  return (
    <div className="settings-overlay animate-fade-in" style={{ zIndex: 10000 }} onClick={onClose}>
      <div className="settings-modal" style={{ maxWidth: '400px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <X size={28} />
        </button>
        <h2 style={{ color: 'white', marginTop: '1rem', marginBottom: '0.5rem' }}>Parental Control</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Enter PIN to access restricted content.</p>
        
        <input 
          type="password" 
          maxLength="4" 
          placeholder="****" 
          value={pinInput} 
          onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          autoFocus
          style={{ 
            width: '120px', padding: '10px 14px', borderRadius: '8px', 
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', 
            color: 'white', textAlign: 'center', letterSpacing: '8px', marginBottom: '1rem',
            fontSize: '1.5rem'
          }}
        />
        
        {error && <p style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>{error}</p>}
        
        <button 
          onClick={handleSubmit}
          style={{ width: '100%', padding: '12px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
};

export default PinPromptModal;
