import { useState, useRef, useEffect, useDeferredValue } from 'react'
import axios from 'axios'
import './index.css'

const API_BASE = 'http://localhost:3002/api';

// These files are very large and will take 10-15 minutes to stream & parse.
// They are NOT blocked — the line-by-line streaming architecture can handle them —
// but the user should know what they're signing up for.
const LARGE_FILE_WARNINGS = {
  'US_LOCALS1': { size: '536 MB', time: '~10-15 min', note: 'Adds ~2,000 local US channels' },
};

const getLargeFileWarning = (url) => {
  const key = Object.keys(LARGE_FILE_WARNINGS).find(k => url.toUpperCase().includes(k));
  return key ? LARGE_FILE_WARNINGS[key] : null;
};

function App() {
  const [step, setStep] = useState(1);
  const [visibleCount, setVisibleCount] = useState(100);
  const [channels, setChannels] = useState([]);
  const [communityChannels, setCommunityChannels] = useState([]);
  const [searchModalChannelId, setSearchModalChannelId] = useState(null);
  const [epgSearchQuery, setEpgSearchQuery] = useState('');
  const [mappings, setMappings] = useState({});
  const [deadOverrides, setDeadOverrides] = useState([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [progressLogs, setProgressLogs] = useState([]);
  const [progressPercent, setProgressPercent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
  const [hideJunk, setHideJunk] = useState(false);
  // Bug Fix: Default was 'US_LOCALS1.xml.gz' (536MB) which locked the event loop for 30s
  // and caused the OS to drop all TCP connections. Auto-suggest handles selection instead.
  const [selectedEpgUrls, setSelectedEpgUrls] = useState([]);
  const [xtreamUrl, setXtreamUrl] = useState('http://kytv.xyz');
  const [xtreamUser, setXtreamUser] = useState('Shane1980!');
  const [xtreamPass, setXtreamPass] = useState('Frozen14');

  const [discoveredEpgs, setDiscoveredEpgs] = useState([]);
  const [recommendedEpgUrls, setRecommendedEpgUrls] = useState([]);
  const [customIcons, setCustomIcons] = useState({});
  const deferredEpgSearchQuery = useDeferredValue(epgSearchQuery);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (step === 2) {
      // Auto-discover EPGs
      axios.get(`${API_BASE}/discover-epgs`)
        .then(res => {
          if (res.data.success) {
            const files = res.data.files;
            setDiscoveredEpgs(files);

            // Auto-Suggest logic
            let hasUS = false, hasUK = false, hasCA = false, hasSports = false, hasAU = false, hasLatin = false;
            channels.forEach(ch => {
              const name = ch.name.toUpperCase();
              if (name.match(/\b(US|USA)\b/)) hasUS = true;
              if (name.match(/\b(UK|GB|ENGLAND)\b/)) hasUK = true;
              if (name.match(/\b(CA|CANADA)\b/)) hasCA = true;
              if (name.match(/\b(AU|AUS|AUSTRALIA)\b/)) hasAU = true;
              if (name.match(/\b(SPORTS|ESPN|NBA|NFL|NHL|MLB|PPV)\b/)) hasSports = true;
              if (name.match(/\b(LATINO|LATIN|SPANISH|MX|AR|ES)\b/)) hasLatin = true;
            });

            const suggestions = new Set();
            // The user explicitly requested to keep the Master EPG auto-selected for maximum coverage,
            // relying on the Event Loop breather fix in server.js to prevent lockups.
            const masterFile = files.find(f => f.url.toLowerCase().includes('all_sources1.xml.gz'));
            if (masterFile) suggestions.add(masterFile.url);

            const usLocals = files.find(f => f.url.toLowerCase().includes('us_locals1.xml.gz'));
            if (usLocals) suggestions.add(usLocals.url);

            const usSports = files.find(f => f.url.toLowerCase().includes('us_sports1.xml.gz'));
            if (usSports) suggestions.add(usSports.url);

            files.forEach(epg => {
              const url = epg.url.toLowerCase();
              if (hasUS && (url.includes('us2.xml') || url.includes('us1.xml') || url.includes('us_sports1') || url.includes('us_locals1'))) suggestions.add(epg.url);
              if (hasUK && (url.includes('uk1.xml') || url.includes('uk_locals1') || url.includes('uk_sports1'))) suggestions.add(epg.url);
              if (hasCA && (url.includes('ca1.xml') || url.includes('ca2.xml') || url.includes('ca_locals1'))) suggestions.add(epg.url);
              if (hasAU && url.includes('au1.xml')) suggestions.add(epg.url);
              if (hasLatin && (url.includes('mx1.xml') || url.includes('ar1.xml') || url.includes('es1.xml') || url.includes('co1.xml') || url.includes('cl1.xml') || url.includes('pr1.xml'))) suggestions.add(epg.url);
            });

            if (suggestions.size > 0) {
              const suggestionArr = Array.from(suggestions);
              setRecommendedEpgUrls(suggestionArr);
              setSelectedEpgUrls(suggestionArr);
            }
          }
        })
        .catch(err => console.error('Failed to discover', err));
    }
  }, [step, channels]);

  const [parseStats, setParseStats] = useState(null);

  const handleM3uUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('m3u', file);

    setLoading('Parsing M3U Playlist...');
    setParseStats(null);
    try {
      const res = await axios.post(`${API_BASE}/upload-m3u`, formData);
      setChannels(res.data.channels);
      if (res.data.skippedVod > 0) {
        setParseStats({ live: res.data.channels.length, skipped: res.data.skippedVod });
      }
      setStep(2);
    } catch (err) {
      setError('Failed to parse M3U. Is the backend running?');
    } finally {
      setLoading('');
    }
  };

  const handleXtreamLogin = async (e) => {
    e.preventDefault();
    if (!xtreamUrl || !xtreamUser || !xtreamPass) {
      setError('Please fill out all Xtream fields.');
      return;
    }

    setLoading('Fetching channels from Xtream Provider...');
    try {
      const res = await axios.post(`${API_BASE}/fetch-xtream`, {
        url: xtreamUrl,
        username: xtreamUser,
        password: xtreamPass
      });
      setChannels(res.data.channels);
      setStep(2);
    } catch (err) {
      setError('Failed to login to provider. Check credentials.');
    } finally {
      setLoading('');
    }
  };

  const handleFetchCommunityEpg = async () => {
    if (selectedEpgUrls.length === 0) {
      setError('Please select at least one EPG source.');
      return;
    }

    setProgressLogs([]);
    setProgressPercent(null);

    const evtSource = new EventSource(`${API_BASE}/progress`);
    evtSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          if (data.message.includes('|DONE')) {
            const cleanMsg = data.message.replace('|DONE', '');
            setLoading('Auto-Mapping 150,000 Channels via Jaccard Engine (This takes 30 seconds)...');
            try {
              const mapRes = await axios.post(`${API_BASE}/auto-map`);
              setMappings(mapRes.data.mappings || {});
              setDeadOverrides(mapRes.data.deadOverrides || []);
              const commRes = await axios.get(`${API_BASE}/community-channels`);
              setCommunityChannels(commRes.data);
              setStep(3);
            } catch (err) {
              setError('Failed to auto-map channels. Backend might have crashed.');
            }
            evtSource.close();
            setLoading('');
          } else {
            setLoading(data.message);
            setProgressLogs(prev => {
              const next = [...prev, data.message];
              return next.length > 8 ? next.slice(next.length - 8) : next;
            });
            const match = data.message.match(/\(([\d,]+)\s*\/\s*([\d,]+)\)/);
            if (match) {
              const current = parseInt(match[1].replace(/,/g, ''), 10);
              const total = parseInt(match[2].replace(/,/g, ''), 10);
              if (total > 0) setProgressPercent((current / total) * 100);
            } else if (data.message.includes('Saved')) {
              setProgressPercent('indeterminate');
            } else {
              setProgressPercent(null);
            }
          }
        }
      } catch (e) {
        console.error('SSE Error', e);
      }
    };

    setLoading(`Initializing download engine...`);
    try {
      await axios.post(`${API_BASE}/fetch-community-epg`, { urls: selectedEpgUrls });
      // DO NOT await auto-map here! The backend XHR promise will resolve immediately.
      // We rely entirely on the SSE Event `|DONE` to trigger the auto-map.
    } catch (err) {
      setError('Failed to start community EPG download. Check the console.');
      evtSource.close();
      setLoading('');
    }
  };

  const handleCheckboxChange = (url) => {
    setSelectedEpgUrls(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  const handleExport = async () => {
    setLoading('Exporting tiny XML...');
    try {
      const res = await axios.post(`${API_BASE}/export-xml`, {
        mappings,
        customIcons,
        m3uChannels: channels
      });
      alert(`Success! Saved to ${res.data.path}`);
    } catch (err) {
      setError('Export failed.');
    } finally {
      setLoading('');
    }
  };

  const handleMappingChange = (channelId, newEpgId) => {
    setMappings(prev => ({
      ...prev,
      [channelId]: newEpgId
    }));
  };

  const handleIconChange = (channelId, iconUrl) => {
    setCustomIcons(prev => ({
      ...prev,
      [channelId]: iconUrl
    }));
  };

  const handleFilterJunk = () => {
    setHideJunk(prev => !prev);
  };

  const handleRestart = () => {
    setStep(1);
    setChannels([]);
    setCommunityChannels([]);
    setMappings({});
    setSearchQuery('');
    setEpgSearchQuery('');
    setSelectedEpgUrls([]);
    setParseStats(null);
    setProgressLogs([]);
    setProgressPercent(null);
    setCustomIcons({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="app-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>StreamPro EPG Editor</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            Standalone mapping engine to build tiny EPGs and avoid app crashes.
          </p>
        </div>
        {step > 1 && (
          <button 
            className="btn-primary" 
            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: 'white', marginTop: '1rem' }}
            onClick={handleRestart}
          >
            ↻ Start Over
          </button>
        )}
      </div>

      <div className="stepper">
        <div className={`step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
          <div className="step-circle">1</div> Upload M3U
        </div>
        <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
          <div className="step-circle">2</div> Download Master EPG
        </div>
        <div className={`step ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>
          <div className="step-circle">3</div> Map Channels
        </div>
        <div className={`step ${step >= 4 ? 'active' : ''}`}>
          <div className="step-circle">4</div> Export Tiny XML
        </div>
      </div>

      {error && (
        <div className="glass-card" style={{ borderColor: 'red', background: 'rgba(255,0,0,0.1)' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="glass-card" style={{ textAlign: 'center', borderColor: 'var(--primary)' }}>
          {(progressPercent === 'indeterminate' || progressPercent === null) && (
            <div className="spinner"></div>
          )}
          <h3>{loading}</h3>
          
          {typeof progressPercent === 'number' && (
            <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden', height: '10px' }}>
              <div style={{ background: 'var(--primary)', height: '100%', width: `${progressPercent}%`, transition: 'width 0.2s ease-out' }}></div>
            </div>
          )}

          {progressLogs.length > 0 && (
            <div style={{ marginTop: '1.5rem', background: '#0f172a', borderRadius: '8px', padding: '1rem', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.85rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)' }}>
              {progressLogs.map((log, i) => {
                const isWarning = log.includes('dropped') || log.includes('Failed') || log.includes('Error') || log.includes('waiting');
                return (
                  <div key={i} style={{ color: isWarning ? '#fbbf24' : '#94a3b8', padding: '2px 0' }}>
                    {isWarning && '⚠️ '}{log}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loading && step === 1 && (
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div className="glass-card text-center" style={{ flex: '1 1 45%' }}>
            <h2>Option A: Upload .m3u File</h2>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>We'll extract all your Live TV channels to prepare for mapping.</p>
            <input
              type="file"
              accept=".m3u,.m3u8"
              className="input-file"
              onChange={handleM3uUpload}
              ref={fileInputRef}
            />
          </div>

          <div className="glass-card text-center" style={{ flex: '1 1 45%' }}>
            <h2>Option B: Login via Xtream</h2>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Pull your channel list directly from your provider.</p>
            <form onSubmit={handleXtreamLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input type="text" placeholder="Server URL (http://...)" value={xtreamUrl} onChange={e => setXtreamUrl(e.target.value)} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--border)' }} />
              <input type="text" placeholder="Username" value={xtreamUser} onChange={e => setXtreamUser(e.target.value)} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--border)' }} />
              <input type="password" placeholder="Password" value={xtreamPass} onChange={e => setXtreamPass(e.target.value)} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--border)' }} />
              <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>Connect & Fetch</button>
            </form>
          </div>
        </div>
      )}

      {!loading && step === 2 && (
        <div className="glass-card">
          <h2>Select Community EPG Sources</h2>

          {parseStats && (
            <div style={{
              marginBottom: '1rem', padding: '0.75rem 1rem',
              borderRadius: '8px', background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.3)', fontSize: '0.875rem'
            }}>
              ✅ <strong>{parseStats.live.toLocaleString()} Live TV channels</strong> loaded &mdash; stripped <strong>{parseStats.skipped.toLocaleString()} VOD/Series</strong> entries automatically.
            </div>
          )}

          <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
            Choose one or more regions from the community database.
            {recommendedEpgUrls.length > 0 && <span style={{ color: 'var(--accent)', marginLeft: '0.5rem' }}>✨ We pre-selected the best matches based on your channel names!</span>}
          </p>


          {discoveredEpgs.length > 0 ? (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  className="btn-primary"
                  style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.4rem 0.8rem', fontSize: '0.85rem', border: '1px solid rgba(16, 185, 129, 0.4)' }}
                  onClick={() => setSelectedEpgUrls(recommendedEpgUrls)}
                >
                  Use Recommended (Faster)
                </button>
                <button
                  className="btn-primary"
                  style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '0.4rem 0.8rem', fontSize: '0.85rem', border: '1px solid rgba(239, 68, 68, 0.4)' }}
                  onClick={() => {
                    const allSrc = discoveredEpgs.find(e => e.name.toUpperCase() === 'ALL_SOURCES1');
                    if (allSrc) setSelectedEpgUrls([allSrc.url]);
                  }}
                >
                  Use Master EPG (1GB)
                </button>
                <button
                  className="btn-primary"
                  style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                  onClick={() => setSelectedEpgUrls([])}
                >
                  Clear All
                </button>
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                {discoveredEpgs.map(epg => {
                  const isRecommended = recommendedEpgUrls.includes(epg.url);
                  const warning = getLargeFileWarning(epg.url);
                  const isSelected = selectedEpgUrls.includes(epg.url);

                  return (
                    <label key={epg.url} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                      marginBottom: '0.5rem', cursor: 'pointer',
                      background: isRecommended ? 'rgba(16, 185, 129, 0.1)' : warning ? 'rgba(251,191,36,0.05)' : 'transparent',
                      padding: '0.3rem 0.5rem',
                      borderRadius: '4px',
                      border: warning && isSelected ? '1px solid rgba(251,191,36,0.4)' : '1px solid transparent'
                    }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleCheckboxChange(epg.url)}
                        style={{ marginTop: '2px', flexShrink: 0 }}
                      />
                      <div>
                        <span style={{ fontWeight: isRecommended ? '600' : '400', color: isRecommended ? 'var(--accent)' : 'inherit' }}>
                          {epg.name} {isRecommended && '✨'}
                        </span>
                        {warning && (
                          <div style={{ fontSize: '0.75rem', color: 'rgba(251,191,36,0.85)', marginTop: '1px' }}>
                            ⏱ {warning.size} &mdash; {warning.time} to process &mdash; {warning.note}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <input
              type="text"
              value={selectedEpgUrls[0] || ''}
              onChange={(e) => setSelectedEpgUrls([e.target.value])}
              placeholder="https://..."
              style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--border)' }}
            />
          )}

          <button className="btn-primary" onClick={handleFetchCommunityEpg}>Download & Parse Selected ({selectedEpgUrls.length})</button>
        </div>
      )}

      {!loading && step === 3 && (() => {
        // Derive filtered channel list from search query + unmatched toggle.
        const q = searchQuery.trim().toLowerCase();
        let filteredChannels = q
          ? channels.filter(ch =>
            ch.name.toLowerCase().includes(q) ||
            (ch.tvgId && ch.tvgId.toLowerCase().includes(q))
          )
          : channels;
        if (showUnmatchedOnly) {
          filteredChannels = filteredChannels.filter(ch => !mappings[ch.id]);
        }
        if (hideJunk) {
          const isJunk = (name) => {
            const lower = name.toLowerCase();
            return lower.includes('radio') || lower.includes('adult') || lower.includes('xxx') || lower.includes('24/7');
          };
          filteredChannels = filteredChannels.filter(ch => !isJunk(ch.name));
        }
        const matchedCount = Object.values(mappings).filter(Boolean).length;
        const unmatchedCount = channels.length - matchedCount;

        // Calculate Heuristic Confidence Score
        let perfect = 0;
        let probable = 0;
        if (matchedCount > 0) {
          channels.filter(ch => mappings[ch.id]).forEach(ch => {
            const name = ch.name;
            const mappedTo = mappings[ch.id];
            const source = name.toLowerCase()
              .replace(/\b(usa|uk|ca|au|nz|za|ie|hd|fhd|uhd|4k|1080p|720p|hevc|h265|vip|local|east|west|pacific|lhd|catchup|vod)\b/g, '')
              .replace(/[^a-z0-9]/g, '');
            const target = mappedTo.toLowerCase()
              .replace(/\.(us|uk|ca|au|nz|za|ie|us2|uk2|ca2|plex|pluto|samsung|xumo|roku)$/, '')
              .replace(/[^a-z0-9]/g, '');
            
            if (source === target) {
              perfect++;
            } else if (source.includes(target) || target.includes(source)) {
              probable++;
            } else {
              const sWords = new Set(name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2));
              const tWords = new Set(mappedTo.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2));
              let intersection = 0;
              for(let w of sWords) { if(tWords.has(w)) intersection++; }
              if (intersection > 0 && intersection / Math.min(sWords.size, tWords.size) >= 0.5) {
                probable++;
              }
            }
          });
        }
        const highConfidence = perfect + probable;
        const confidencePct = matchedCount > 0 ? ((highConfidence / matchedCount) * 100).toFixed(1) : 0;


        return (
          <div className="glass-card" style={{ padding: '0' }}>
            {/* Header row: title + action buttons */}
            <div style={{ padding: '1.5rem 2rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>Map Channels</h2>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{matchedCount}</span> of{' '}
                  <span style={{ fontWeight: 700 }}>{channels.length}</span> channels auto-matched
                  {matchedCount > 0 && (
                    <span style={{ marginLeft: '1rem', paddingLeft: '1rem', borderLeft: '1px solid var(--border)', color: '#10b981', fontWeight: 600 }}>
                      ✨ {confidencePct}% Match Confidence
                    </span>
                  )}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setShowUnmatchedOnly(v => !v); setVisibleCount(100); }}
                  style={{
                    padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap',
                    background: showUnmatchedOnly ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
                    border: showUnmatchedOnly ? '1px solid rgba(239,68,68,0.6)' : '1px solid var(--border)',
                    color: showUnmatchedOnly ? 'rgba(239,68,68,0.95)' : 'var(--text-muted)'
                  }}
                >
                  {showUnmatchedOnly ? `✕ Showing ${unmatchedCount} Unmatched` : `⚠ Show Unmatched Only (${unmatchedCount})`}
                </button>
                <button
                  className="btn-primary" 
                  onClick={handleFilterJunk} 
                  style={{ 
                    background: hideJunk ? 'rgba(239,68,68,0.2)' : 'var(--accent)', 
                    border: hideJunk ? '1px solid rgba(239,68,68,0.6)' : '1px solid transparent', 
                    color: hideJunk ? 'rgba(239,68,68,0.95)' : 'white' 
                  }}
                >
                  {hideJunk ? '✕ Showing Non-Junk' : 'Filter Junk (XXX/Radio)'}
                </button>
                <button
                  className="btn-primary"
                  style={{ background: 'rgba(255,255,255,0.1)' }}
                  onClick={async () => {
                    const report = {
                      matched: channels.filter(ch => mappings[ch.id]).map(ch => ({
                        name: ch.name,
                        originalTvgId: ch.tvgId,
                        mappedTo: mappings[ch.id]
                      })),
                      unmatched: channels.filter(ch => !mappings[ch.id]).map(ch => ({
                        name: ch.name,
                        tvgId: ch.tvgId
                      })),
                      stats: {
                        totalChannels: channels.length,
                        matchedCount: matchedCount,
                        unmatchedCount: unmatchedCount,
                        overallMatchRate: ((matchedCount / channels.length) * 100).toFixed(1) + '%',
                        highConfidenceMatches: highConfidence,
                        confidenceScore: confidencePct + '%'
                      }
                    };
                    try {
                      await axios.post(`${API_BASE}/save-diagnostic-report`, report);
                      alert('Saved to diagnostic-report.json in project root! The AI agent can read this directly.');
                    } catch (err) {
                      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'diagnostic-report.json';
                      a.click();
                    }
                  }}
                >
                  Export Diagnostic Report
                </button>
                <button className="btn-primary btn-success" onClick={handleExport}>Export Tiny XML</button>
              </div>
            </div>

            {/* Search/filter bar */}
            <div style={{ padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{
                  position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', fontSize: '1rem', pointerEvents: 'none'
                }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search by channel name or EPG ID..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setVisibleCount(100); // Reset pagination on new search
                  }}
                  style={{
                    width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.5rem',
                    borderRadius: '8px', background: 'rgba(0,0,0,0.35)',
                    color: 'white', border: '1px solid var(--border)',
                    fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>
              {q && (
                <span style={{
                  background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)',
                  borderRadius: '20px', padding: '0.35rem 0.9rem',
                  color: 'var(--primary)', fontSize: '0.8rem', whiteSpace: 'nowrap'
                }}>
                  {filteredChannels.length} result{filteredChannels.length !== 1 ? 's' : ''}
                </span>
              )}
              {q && (
                <button
                  onClick={() => { setSearchQuery(''); setVisibleCount(100); }}
                  style={{
                    padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                    cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap'
                  }}
                >✕ Clear</button>
              )}
            </div>

            {/* Mapping table */}
            <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '0 2rem 2rem' }}>
              {filteredChannels.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                    {showUnmatchedOnly ? '🎉' : '🔍'}
                  </div>
                  <p>
                    {showUnmatchedOnly
                      ? <><strong>All channels are matched!</strong> Nothing left to fix.</>
                      : <>No channels match "<strong>{searchQuery}</strong>"</>}
                  </p>
                </div>
              ) : (
                <>
                  <table className="mapping-table">
                    <thead>
                      <tr>
                        <th>Channel Name</th>
                        <th>Assigned EPG Source</th>
                        <th>Custom Logo URL (Optional)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredChannels.slice(0, visibleCount).map(ch => (
                        <tr key={ch.id} style={{ background: mappings[ch.id] ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
                          <td>
                            <div style={{ fontWeight: 600 }}>
                              {ch.name}
                              {deadOverrides.includes(ch.name) && (
                                <span style={{ marginLeft: '0.5rem', color: '#ef4444', fontSize: '0.8rem' }}>
                                  ⚠️ Dead Manual Override (Update or Delete)
                                </span>
                              )}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>ID: {ch.tvgId || 'None'}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <input
                                type="text"
                                placeholder="EPG ID (e.g. ESPN.us)"
                                value={mappings[ch.id] || ''}
                                onChange={(e) => handleMappingChange(ch.id, e.target.value)}
                                style={{
                                  flex: 1, padding: '0.5rem', borderRadius: '6px',
                                  background: mappings[ch.id] ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.3)',
                                  color: 'white', border: `1px solid ${mappings[ch.id] ? 'rgba(16,185,129,0.5)' : 'var(--border)'}`
                                }}
                              />
                              <button
                                onClick={() => { setSearchModalChannelId(ch.id); setEpgSearchQuery(''); }}
                                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.5rem', color: 'white', cursor: 'pointer' }}
                              >🔍 Search</button>
                              <button
                                onClick={() => handleMappingChange(ch.id, '')}
                                style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px', padding: '0.5rem', color: 'white', cursor: 'pointer' }}
                                title="Clear Mapping"
                              >✕ Clear</button>
                              <button
                                onClick={async () => {
                                  try {
                                     await axios.post(`${API_BASE}/override`, { channelName: ch.name, epgId: mappings[ch.id] });
                                     alert('Override saved permanently! It will load automatically on the next boot.');
                                  } catch (e) {
                                     alert('Failed to save override');
                                  }
                                }}
                                style={{ background: 'var(--accent)', border: 'none', borderRadius: '4px', padding: '0.5rem', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                                title="Save as a permanent AI Override"
                              >💾 Save Override</button>
                            </div>
                          </td>
                          <td>
                            <input
                              type="text"
                              placeholder="https://...png"
                              value={customIcons[ch.id] || ''}
                              onChange={(e) => handleIconChange(ch.id, e.target.value)}
                              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--border)' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visibleCount < filteredChannels.length && (
                    <div style={{ textAlign: 'center', marginTop: '1rem', paddingBottom: '1rem' }}>
                      <button className="btn-primary" onClick={() => setVisibleCount(prev => prev + 100)}>
                        Load 100 More ({filteredChannels.length - visibleCount} remaining)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {searchModalChannelId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e1e2e', padding: '2rem', borderRadius: '12px', width: '600px', maxWidth: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3>Search Master EPG Library</h3>
              <button onClick={() => setSearchModalChannelId(null)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <input
              type="text"
              autoFocus
              placeholder="Search e.g. ESPN..."
              value={epgSearchQuery}
              onChange={e => setEpgSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)', color: 'white', marginBottom: '1rem' }}
            />
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--border)', borderRadius: '8px' }}>
              {communityChannels
                .filter(c => c.name.toLowerCase().includes(deferredEpgSearchQuery.toLowerCase()) || c.id.toLowerCase().includes(deferredEpgSearchQuery.toLowerCase()))
                .slice(0, 100)
                .map(c => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setMappings(prev => ({ ...prev, [searchModalChannelId]: c.id }));
                      setSearchModalChannelId(null);
                    }}
                    style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.id}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App
