const fs = require('fs');

let code = fs.readFileSync('apps/web-pc/src/components/epg/EPGGrid.jsx', 'utf8');

// 1. Add imports
code = code.replace(
  /import \{ useAppStore \} from '\.\.\/\.\.\/store\/useAppStore';/,
  `import { useAppStore } from '../../store/useAppStore';\nimport { useLiveQuery } from 'dexie-react-hooks';\nimport { epgDb } from '../../db/epgDatabase';`
);

// 2. Modify Row to useLiveQuery
const rowStartIdx = code.indexOf('const Row = React.memo((props) => {');
if (rowStartIdx !== -1) {
  const channelDeclIdx = code.indexOf('const channel = channels[index];', rowStartIdx);
  if (channelDeclIdx !== -1) {
    const injectionPoint = channelDeclIdx + 'const channel = channels[index];'.length;
    const injection = `
    
    const channelEpgRaw = useLiveQuery(
      () => {
         const cid = String(channel?.id || channel?.stream_id || '');
         if (!cid) return [];
         return epgDb.programs.where('channel_id').equals(cid).toArray();
      },
      [channel?.id, channel?.stream_id],
      []
    );
    
    const channelEpg = useMemo(() => {
       if (!channelEpgRaw || channelEpgRaw.length === 0) return props.channelEpg || []; // Fallback to prop if any
       return channelEpgRaw.map(p => ({
         ...p,
         start: new Date(p.start_timestamp),
         end: new Date(p.stop_timestamp)
       })).sort((a,b) => a.start.getTime() - b.start.getTime());
    }, [channelEpgRaw, props.channelEpg]);
`;
    code = code.substring(0, injectionPoint) + injection + code.substring(injectionPoint);
  }
}

// 3. Fix EPGGrid Initial Focus to not crash on undefined epgData
code = code.replace(
  /const channelEpg = epgData\[firstChannel\.stream_id \|\| firstChannel\.id\] \|\| \[\];[\s\S]*?setFocusedItem\(\{ channel: firstChannel, program: currentProgram \|\| null \}\);\n\s+\}/,
  `setFocusedItem({ channel: firstChannel, program: null });
      }`
);

// Remove epgData from dependencies
code = code.replace(
  /\}, \[channels, epgData, enableCatchup\]\);/,
  `}, [channels, enableCatchup]);`
);


fs.writeFileSync('apps/web-pc/src/components/epg/EPGGrid.jsx', code);
console.log('EPGGrid updated!');
