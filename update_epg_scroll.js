const fs = require('fs');

let code = fs.readFileSync('apps/web-pc/src/components/epg/EPGGrid.jsx', 'utf8');

// Insert loadMoreLiveChannels
const focusableImport = code.indexOf('const { ref, focused } = useFocusable');
// EPGGrid starts at: const EPGGrid = ({ channels...
const epgGridStart = code.indexOf('const EPGGrid = ({ channels');
const gridRefIndex = code.indexOf('const gridRef = useRef(null);', epgGridStart);

if (gridRefIndex !== -1) {
  code = code.substring(0, gridRefIndex) + `const loadMoreLiveChannels = useAppStore(state => state.loadMoreLiveChannels);\n  ` + code.substring(gridRefIndex);
}

// Update handleScroll
code = code.replace(
  /scrollRafRef\.current = requestAnimationFrame\(\(\) => \{[\s\S]*?setScrollTop\(newScrollTop\);/,
  `scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        setScrollTop(newScrollTop);
        
        // Phase 3 Step 2: Trigger chunk loading when near the bottom (within 1000px)
        if (e.target.scrollHeight - newScrollTop - e.target.clientHeight < 1000) {
           loadMoreLiveChannels();
        }`
);

fs.writeFileSync('apps/web-pc/src/components/epg/EPGGrid.jsx', code);
console.log('EPGGrid infinite scroll added!');
