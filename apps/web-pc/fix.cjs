const fs = require('fs');
let code = fs.readFileSync('src/components/epg/EpgGrid.jsx', 'utf8');

// Find all occurrences of {enableCatchup && (
let index = code.indexOf('{enableCatchup && (');
while (index !== -1) {
  // Find the closing )}; or )} for this block
  let endText = '</button>\n        </div>\n      )}';
  let endText2 = '</button>\n          </div>\n        )}';
  
  let endIndex = code.indexOf(endText, index);
  let endIndex2 = code.indexOf(endText2, index);
  
  let actualEnd = -1;
  let len = 0;
  if (endIndex !== -1 && (endIndex2 === -1 || endIndex < endIndex2)) {
    actualEnd = endIndex;
    len = endText.length;
  } else if (endIndex2 !== -1) {
    actualEnd = endIndex2;
    len = endText2.length;
  }
  
  if (actualEnd !== -1) {
    code = code.substring(0, index) + code.substring(actualEnd + len);
  } else {
    // try finding just )}
    let fallback = code.indexOf(')}', index);
    if (fallback !== -1) {
      code = code.substring(0, index) + code.substring(fallback + 2);
    } else {
      break;
    }
  }
  
  index = code.indexOf('{enableCatchup && (');
}

// Remove any lingering floating action bar comments
code = code.replace(/\s*\{\/\* Floating Action Bar for Catchup TV \*\/\}/g, '');

const newPill = `
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

code = code.replace(/    <\/div>\s*\);\s*\};/g, newPill);

fs.writeFileSync('src/components/epg/EpgGrid.jsx', code);
console.log('Fixed file completely');
