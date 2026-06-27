const fs = require('fs');

let code = `
              <div style={{ position: 'relative', display: 'flex', flex: 1 }}>
                {showEpgNowLine && timeline.length > 0 && (
                  <div 
                    className="epg-now-line" 
                    style={{ left: getNowLineLeft() }}
                  ></div>
                )}

                {timeline.map((time, idx) => (
                  <div key={idx} className="timeline-slot">
                    {format(time, timeFmt)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="epg-virtual-list" style={{ position: 'relative', height: \`${channels.length * ROW_HEIGHT}px\` }}>
            
            {showEpgNowLine && timeline.length > 0 && (
              <div 
                className="epg-now-line" 
                style={{ left: \`calc(250px + \${getNowLineLeft()})\`, zIndex: 10 }}
              ></div>
            )}

            {visibleChannels.map((channel, i) => {
              const actualIndex = startIndex + i;
              return (
                <Row 
                  key={\`prog-\${channel.id}\`}
                  index={actualIndex}
                  style={{ position: 'absolute', top: \`\${actualIndex * ROW_HEIGHT}px\`, height: \`\${ROW_HEIGHT}px\`, width: '100%' }}
                  channels={channels}
                  epgData={epgData}
                  timeline={timeline}
                  currentTime={currentTime}
                  scrollLeftState={scrollLeftState}
                  onPlay={onPlay}
                  handleFocus={handleFocus}
                  onHoverChannel={onHoverChannel}
                  calculateWidth={calculateWidth}
                  calculateLeft={calculateLeft}
                  timeFormat={timeFormat}
                  isFavoritesCategory={isFavoritesCategory}
                  draggedIdx={draggedIdx}
                  dragOverIdx={dragOverIdx}
                  onDragStart={handleDragStart}
                  onDragEnter={handleDragEnter}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                  enableMultiView={enableMultiView}
                  showEpgProgressFill={showEpgProgressFill}
                />
              );
            })}
          </div>
        </div>
      </div>
      {/* Floating Action Bar for Multi-View Select Mode */}
      {isMultiViewSelectMode && (
        <div className="animate-fade-in" style={{ position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(20, 20, 25, 0.95)', backdropFilter: 'blur(20px)', padding: '1rem 2rem', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', gap: '2rem', zIndex: 999999 }}>
          <div style={{ color: 'white', fontSize: '1.1rem' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}>{multiViewSelectionQueue.length}/4</span> Channels Selected
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={() => setMultiViewSelectMode(false)}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Cancel
            </button>
            <button 
              disabled={multiViewSelectionQueue.length === 0}
              onClick={() => launchMultiViewGrid()}
              style={{ background: 'var(--accent-primary)', border: 'none', color: 'white', padding: '0.75rem 2rem', borderRadius: '16px', cursor: multiViewSelectionQueue.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', opacity: multiViewSelectionQueue.length > 0 ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Grid size={18} /> Launch Grid
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Bar for Catchup TV */}
      {enableCatchup && (
        <div className="animate-fade-in" style={{ position: 'absolute', bottom: '30px', right: '30px', zIndex: 200, display: 'flex', gap: '8px', background: 'rgba(20,20,25,0.9)', backdropFilter: 'blur(12px)', borderRadius: '30px', padding: '10px 16px', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 10px 30px rgba(0,0,0,0.7)', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem', marginRight: '8px', opacity: 0.8 }}>TIME TRAVEL</span>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', marginRight: '4px' }}></div>
          <button onClick={() => jumpToTime(-72)} style={{ padding: '6px 14px', borderRadius: '16px', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.target.style.color='white'} onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.7)'}>3 Days Ago</button>
          <button onClick={() => jumpToTime(-48)} style={{ padding: '6px 14px', borderRadius: '16px', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.target.style.color='white'} onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.7)'}>2 Days Ago</button>
          <button onClick={() => jumpToTime(-24)} style={{ padding: '6px 14px', borderRadius: '16px', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.target.style.color='white'} onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.7)'}>Yesterday</button>
          <button onClick={() => jumpToTime(0)} style={{ padding: '6px 14px', borderRadius: '16px', background: 'var(--accent-primary)', color: 'white', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.2s', marginLeft: '4px' }}>LIVE</button>
        </div>
      )}
    </div>
  );
};
`;

let orig = fs.readFileSync('src/components/epg/EpgGrid.jsx', 'utf8');
let lines = orig.split('\n');

// Find start of replacement: line 352 (0-indexed: 351)
// Wait, I am viewing lines 350-390, which means 353 is `<div style={{ position: 'relative', display: 'flex', flex: 1 }}>`
// We need to replace from line 353 to line 381 (which is the end of the EPGGrid component)
let startIdx = 352;
let endIdx = 381;

// Wait, we also need to remove the bad pill between line 278 and 290
// Lines 278 to 289 contain the bad pill. We should just replace line 278 to 290 with:
let topReplacement = `      </div>
    );
  };`;

// So let's splice lines
let newLines = [];
for (let i = 0; i < 277; i++) {
  newLines.push(lines[i]);
}
newLines.push(topReplacement);
for (let i = 292; i < 352; i++) {
  newLines.push(lines[i]);
}
newLines.push(code.trim());
for (let i = 381; i < lines.length; i++) {
  newLines.push(lines[i]);
}

fs.writeFileSync('src/components/epg/EpgGrid.jsx', newLines.join('\n'));
console.log('Fixed everything');
