import React, { useEffect, useState } from 'react';
import { Play, Trash2, VideoOff, Clock, Plus, X, Pencil, Square } from 'lucide-react';
import { useAppStore } from "../../store/useAppStore";

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTime = (dateStr) => {
  return new Date(dateStr).toLocaleString();
};

const EditScheduleModal = ({ schedule, onClose, onSave }) => {
  const [startTime, setStartTime] = useState(new Date(schedule.startTime).toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState(new Date(schedule.endTime).toISOString().slice(0, 16));
  const [recurrence, setRecurrence] = useState(schedule.recurrence || 'none');
  const [retention, setRetention] = useState(schedule.retention || 'unlimited');

  const handleSave = () => {
    onSave({
      ...schedule,
      startTime: new Date(startTime).getTime(),
      endTime: new Date(endTime).getTime(),
      recurrence,
      retention
    });
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#1a1a2e', borderRadius: '16px', padding: '2rem', width: '90%', maxWidth: '500px', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: 'white' }}>Edit Schedule</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>Start Time</label>
            <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }} />
          </div>
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>End Time</label>
            <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }} />
          </div>

          {schedule._isRecord && (
            <>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>Recurrence</label>
                <select value={recurrence} onChange={e => setRecurrence(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <option value="none">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays (Mon-Fri)</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>Retention Policy</label>
                <select value={retention} onChange={e => setRetention(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <option value="unlimited">Keep All Episodes</option>
                  <option value="last_1">Keep Last 1 Episode</option>
                  <option value="last_3">Keep Last 3 Episodes</option>
                  <option value="last_5">Keep Last 5 Episodes</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', backgroundColor: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
};

const RecordingsTab = () => {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [recordingsSort, setRecordingsSort] = useState('newest');
  
  // Manual Timer State
  const [manualChannelId, setManualChannelId] = useState('');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');

  const { 
    handlePlay, 
    dvrSchedules, 
    fetchDvrSchedules, 
    removeDvrSchedule, 
    addDvrSchedule, 
    updateDvrSchedule,
    liveChannels,
    reminders,
    removeReminder,
    activeRecordings,
    stopRecording
  } = useAppStore();

  const allSchedules = [
    ...(dvrSchedules || []).map(s => ({...s, _isRecord: true})),
    ...(reminders || []).map(r => ({...r, _isReminder: true, title: r.programTitle ? `${r.channel?.name} - ${r.programTitle}` : r.title}))
  ].sort((a,b) => a.startTime - b.startTime);

  const sortedRecordings = [...recordings].sort((a, b) => {
    if (recordingsSort === 'newest') return b.createdAt - a.createdAt;
    if (recordingsSort === 'oldest') return a.createdAt - b.createdAt;
    if (recordingsSort === 'a-z') return a.title.localeCompare(b.title);
    return 0;
  });

  const fetchRecordings = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/recordings/list');
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } catch (err) {
      console.error('Failed to fetch recordings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
    fetchDvrSchedules();
    const interval = setInterval(() => {
      fetchRecordings();
      fetchDvrSchedules();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this recording?')) return;
    setRecordings(prev => prev.filter(r => r.id !== fileId));
    try {
      const res = await fetch('http://localhost:3001/api/recordings/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId })
      });
      if (!res.ok) fetchRecordings();
    } catch (err) {
      console.error('Failed to delete recording:', err);
      fetchRecordings();
    }
  };

  const handleManualSchedule = () => {
    if (!manualChannelId || !manualStartTime || !manualEndTime) {
      alert('Please fill out all fields.');
      return;
    }
    
    const startObj = new Date(manualStartTime);
    const endObj = new Date(manualEndTime);
    
    if (endObj <= startObj) {
      alert('End time must be after start time.');
      return;
    }
    
    if (startObj < new Date()) {
      alert('Start time cannot be in the past.');
      return;
    }

    const channel = liveChannels.find(c => c.id === manualChannelId || c.stream_id.toString() === manualChannelId);
    if (!channel) return;

    const url = channel.url || `http://localhost:3001/proxy/stream/live/${channel.stream_id}?extension=m3u8`;

    addDvrSchedule({
      url,
      title: `${channel.name} - Manual Recording`,
      startTime: startObj.getTime(),
      endTime: endObj.getTime()
    });

    setIsManualModalOpen(false);
    setManualChannelId('');
    setManualStartTime('');
    setManualEndTime('');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><h3>Loading Recordings...</h3></div>;
  }

  return (
    <div className="content-container animate-fade-in flex-col h-full" style={{ paddingLeft: '112px', paddingRight: '2rem', paddingTop: '2rem', overflowY: 'auto', paddingBottom: '4rem' }}>
      
      <div className="flex justify-between items-center mb-8">
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>My Recordings</h2>
        <button 
          onClick={() => setIsManualModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={20} />
          Manual Timer
        </button>
      </div>

      {/* Active Recordings Section */}
      {activeRecordings && activeRecordings.length > 0 && (
        <div style={{ marginBottom: '3rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#ef4444', borderRadius: '50%', boxShadow: '0 0 10px #ef4444' }}></span>
            Currently Recording
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeRecordings.map(rec => (
              <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', padding: '1rem', borderRadius: '12px' }}>
                <div>
                  <h4 style={{ fontWeight: 'bold', fontSize: '1.125rem', margin: 0, color: 'white' }}>{rec.title}</h4>
                  <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.5rem' }}>
                    Started at {formatTime(rec.startTime)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => {
                      if(window.confirm(`Stop recording ${rec.title}?`)) {
                        stopRecording(rec.id);
                      }
                    }}
                    className="hover:bg-red-600 hover:text-white"
                    style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Square size={16} fill="currentColor" />
                    Stop
                  </button>
                  <button 
                    onClick={() => {
                      if (!rec.url) return alert('Stream URL missing for this recording.');
                      const channel = liveChannels.find(c => rec.url.includes(`/${c.stream_id}.`) || rec.url.includes(`/${c.stream_id}`));
                      if (channel) {
                        handlePlay(channel);
                      } else {
                        alert('Could not locate the original channel in your playlist.');
                      }
                    }}
                    className="hover:bg-red-500 hover:text-white"
                    style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Play size={16} fill="currentColor" />
                    Watch Live
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Recordings Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)' }}>Saved Recordings</h3>
        {recordings.length > 0 && (
          <select 
            value={recordingsSort} 
            onChange={(e) => setRecordingsSort(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', outline: 'none' }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="a-z">Alphabetical (A-Z)</option>
          </select>
        )}
      </div>
      
      {recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-white/50" style={{ marginTop: '5vh', marginBottom: '5vh' }}>
          <VideoOff size={64} style={{ marginBottom: '1rem' }} />
          <h3>No recordings found.</h3>
          <p>Use the DVR button while watching Live TV, or schedule a recording.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
          {sortedRecordings.map((rec) => (
            <div key={rec.id} className="recording-card group relative" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', transition: 'all 0.2s', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div 
                className="recording-thumbnail" 
                style={{ 
                  height: '140px', 
                  background: rec.thumbnail ? `url(${rec.thumbnail}) center/cover no-repeat` : 'rgba(0,0,0,0.5)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  position: 'relative' 
                }}
              >
                {!rec.thumbnail ? (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', zIndex: 3, padding: '20px', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.9)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Processing Video...</span>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>This will be available shortly</span>
                  </div>
                ) : (
                  <button 
                    className="play-btn absolute"
                    style={{ 
                      opacity: 0, 
                      transition: 'all 0.2s', 
                      background: 'var(--accent-primary)', 
                      borderRadius: '50%', 
                      padding: '16px',
                      zIndex: 2,
                      boxShadow: '0 4px 15px rgba(229, 9, 20, 0.5)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      handlePlay({
                        id: rec.id,
                        name: rec.title,
                        type: 'vod',
                        stream_url: rec.url,
                        url: rec.url,
                        extension: 'mp4',
                        poster: rec.thumbnail,
                        cover: rec.thumbnail
                      });
                    }}
                  >
                    <Play fill="white" size={24} />
                  </button>
                )}
              </div>
              <div style={{ padding: '1rem' }}>
                <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={rec.title}>
                  {rec.title}
                </h4>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{formatTime(rec.createdAt)}</span>
                  <span>{formatBytes(rec.size)}</span>
                </div>
              </div>
              <button 
                className="delete-btn"
                style={{ 
                  position: 'absolute', 
                  top: '8px', 
                  right: '8px', 
                  padding: '8px', 
                  borderRadius: '50%', 
                  background: 'rgba(0,0,0,0.8)',
                  opacity: 1, 
                  cursor: 'pointer', 
                  border: '2px solid rgba(255,0,0,0.5)', 
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(rec.id);
                }}
                title="Delete Recording"
              >
                <Trash2 size={18} color="#ff4444" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming Schedules Section */}
      {allSchedules.length > 0 && (
        <div style={{ marginBottom: '3rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={20} /> Upcoming Schedules
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {allSchedules.map(schedule => (
              <div key={schedule.id} style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} className="hover:border-white/20 hover:bg-white/5">
                <div style={{ padding: '1.25rem', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px', backgroundColor: schedule._isRecord ? 'rgba(239,68,68,0.2)' : schedule.type === 'autotune' ? 'rgba(139,92,246,0.2)' : 'rgba(59,130,246,0.2)', color: schedule._isRecord ? '#f87171' : schedule.type === 'autotune' ? '#a78bfa' : '#60a5fa' }}>
                        {schedule._isRecord ? 'RECORDING' : schedule.type === 'autotune' ? 'AUTO-TUNE' : 'REMINDER'}
                      </span>
                      {schedule._isRecord && schedule.recurrence && schedule.recurrence !== 'none' && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
                          🔁 {schedule.recurrence === 'weekdays' ? 'Weekdays' : schedule.recurrence.charAt(0).toUpperCase() + schedule.recurrence.slice(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <h4 style={{ fontWeight: 'bold', fontSize: '1.125rem', margin: '0 0 0.5rem 0', color: 'white', lineHeight: '1.4' }}>{schedule.title}</h4>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                    <Clock size={14} />
                    {schedule._isRecord 
                      ? `${formatTime(schedule.startTime)} - ${formatTime(schedule.endTime)}`
                      : `Trigger at ${formatTime(schedule.startTime)}`
                    }
                  </div>
                </div>

                <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                  <button 
                    onClick={() => setEditingSchedule(schedule)}
                    style={{ flex: 1, padding: '0.75rem', backgroundColor: 'transparent', color: 'rgba(255,255,255,0.7)', border: 'none', borderRight: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s' }}
                    className="hover:text-blue-400 hover:bg-white/5"
                  >
                    <Pencil size={16} /> Edit
                  </button>
                  <button 
                    onClick={() => {
                      if(window.confirm('Cancel this scheduled action?')) {
                        if (schedule._isRecord) {
                          removeDvrSchedule(schedule.id);
                        } else {
                          removeReminder(schedule.id);
                        }
                      }
                    }}
                    style={{ flex: 1, padding: '0.75rem', backgroundColor: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s' }}
                    className="hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingSchedule && (
        <EditScheduleModal 
          schedule={editingSchedule} 
          onClose={() => setEditingSchedule(null)} 
          onSave={(updated) => {
            if (updated._isRecord) {
              updateDvrSchedule(updated);
            }
            setEditingSchedule(null);
          }} 
        />
      )}



      {/* Manual Timer Modal */}
      {isManualModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(10px)' }}>
          <div style={{ backgroundColor: '#1a1b26', padding: '2rem', borderRadius: '12px', maxWidth: '400px', width: '100%', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white', margin: 0 }}>Manual Timer</h2>
              <button 
                onClick={() => setIsManualModalOpen(false)} 
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>Channel</label>
                <select 
                  value={manualChannelId} 
                  onChange={(e) => setManualChannelId(e.target.value)}
                  style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.75rem', color: 'white', outline: 'none' }}
                >
                  <option value="">Select a channel...</option>
                  {liveChannels.map(ch => (
                    <option key={ch.id} value={ch.id || ch.stream_id}>{ch.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>Start Time</label>
                <input 
                  type="datetime-local" 
                  value={manualStartTime} 
                  onChange={(e) => setManualStartTime(e.target.value)}
                  style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.75rem', color: 'white', outline: 'none', colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>End Time</label>
                <input 
                  type="datetime-local" 
                  value={manualEndTime} 
                  onChange={(e) => setManualEndTime(e.target.value)}
                  style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.75rem', color: 'white', outline: 'none', colorScheme: 'dark' }}
                />
              </div>
            </div>

            <button 
              onClick={handleManualSchedule} 
              style={{ width: '100%', padding: '0.75rem 1rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}
            >
              Set Timer
            </button>
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .recording-card:hover {
          transform: translateY(-5px);
          border-color: var(--accent-primary);
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .recording-card:hover .play-btn { opacity: 1; }
        .recording-card:hover .delete-btn { opacity: 1; }
        .recording-card .play-btn:hover { transform: scale(1.1); }
      `}} />
    </div>
  );
};

export default RecordingsTab;
