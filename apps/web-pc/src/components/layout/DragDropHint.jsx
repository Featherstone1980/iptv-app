import React from 'react';
import { X, Hand } from 'lucide-react';

const DragDropHint = ({ onDismiss }) => {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(79,70,229,0.95))',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      boxShadow: '0 8px 32px rgba(79,70,229,0.4)',
      border: '1px solid rgba(255,255,255,0.2)',
      marginBottom: '20px',
      backdropFilter: 'blur(10px)',
      animation: 'slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    }}>
      <style>{`
        @keyframes slideDown {
          0% { opacity: 0; transform: translateY(-20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Hand size={24} style={{ color: '#fbbf24' }} />
        <div>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Did you know?</h4>
          <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
            You can drag and drop any of your saved channels or posters to create your own custom order!
          </p>
        </div>
      </div>
      <button 
        onClick={onDismiss}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
      >
        Got it! <X size={16} />
      </button>
    </div>
  );
};

export default DragDropHint;
