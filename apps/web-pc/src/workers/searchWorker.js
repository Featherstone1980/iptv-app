import Fuse from 'fuse.js';

const fuseInstances = {};

self.onmessage = (e) => {
  const { type, category, data, options, query } = e.data;

  if (type === 'init') {
    // Build the index in the background thread (takes ~300ms for 20k items, now 100% non-blocking)
    fuseInstances[category] = new Fuse(data, options);
  } else if (type === 'search') {
    const fuse = fuseInstances[category];
    if (fuse) {
      // Execute the heavy string distance math in the background thread
      // Limit to top 100 results to prevent massive structured cloning payloads across the worker boundary
      const results = fuse.search(query, { limit: 100 }).map(res => res.item);
      // Send the results back to React
      self.postMessage({ type: 'search_done', category, results });
    }
  }
};
