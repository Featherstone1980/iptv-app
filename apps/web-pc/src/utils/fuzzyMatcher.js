const normalizeChannelName = (name) => {
  if (!name) return '';
  let str = name.toLowerCase();
  
  // Remove common country prefixes like "US:", "UK |", "CA -"
  str = str.replace(/^[a-z]{2,3}\s*[:|-]\s*/, '');
  
  // Remove quality tags
  str = str.replace(/\b(hd|fhd|sd|4k|8k|uhd)\b/g, '');
  
  // Remove special chars, punctuation, and spaces
  str = str.replace(/[^a-z0-9]/g, '');
  
  return str.trim();
};

const jaccardSim = (a, b) => {
  if (a === b) return 1;
  if (!a || !b || a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s) => {
    const result = new Set();
    for (let i = 0; i < s.length - 1; i++) result.add(s.slice(i, i + 2));
    return result;
  };
  const biA = bigrams(a), biB = bigrams(b);
  let intersection = 0;
  for (const g of biA) { if (biB.has(g)) intersection++; }
  const union = biA.size + biB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

/**
 * Compares two arrays of channels and links them by their normalized names.
 * Runs asynchronously to avoid blocking the main UI thread.
 * @param {Array} primaryChannels - The main channel list
 * @param {Array} backupChannels - The backup channel list
 * @returns {Promise<Object>} fallbackMap - A map of primary_stream_id -> backup_channel_object
 */
export const generateFallbackMap = async (primaryChannels, backupChannels) => {
  if (!primaryChannels?.length || !backupChannels?.length) return {};
  
  console.log(`[FuzzyMatcher] Generating map for ${primaryChannels.length} primary and ${backupChannels.length} backup channels`);
  
  const fallbackMap = {};
  const backupDict = {};

  // Build the fast-lookup dictionary for the backup provider
  for (const backup of backupChannels) {
    const norm = normalizeChannelName(backup.name);
    if (norm && !backupDict[norm]) {
      backupDict[norm] = backup;
    }
  }

  // 1. Exact Match Pass (O(N) fast lookup)
  const unmatchedPrimary = [];
  let matchCount = 0;

  for (const primary of primaryChannels) {
    const norm = normalizeChannelName(primary.name);
    if (norm && backupDict[norm]) {
      fallbackMap[primary.stream_id] = backupDict[norm];
      matchCount++;
    } else {
      unmatchedPrimary.push({ ...primary, norm });
    }
  }

  console.log(`[FuzzyMatcher] Exact matches found: ${matchCount}. Running Jaccard similarity on ${unmatchedPrimary.length} remaining...`);

  // 2. Fuzzy Match Pass (Jaccard similarity) - Chunked to prevent UI freezes
  const backupList = backupChannels.map(b => ({ ...b, norm: normalizeChannelName(b.name) })).filter(b => b.norm.length >= 4);
  
  // Yield to browser every 500 items so the React UI doesn't stutter
  for (let i = 0; i < unmatchedPrimary.length; i++) {
    if (i > 0 && i % 500 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    const primary = unmatchedPrimary[i];
    if (primary.norm.length < 4) continue;

    let bestScore = 0;
    let bestMatch = null;

    for (const backup of backupList) {
      const minBi = Math.min(primary.norm.length, backup.norm.length) - 1;
      const maxBi = Math.max(primary.norm.length, backup.norm.length) - 1;
      
      // Mathematical upper bound optimization: Jaccard cannot exceed min_bigrams / max_bigrams.
      // We skip expensive Set intersections if the lengths make a > 0.70 match impossible.
      if (maxBi > 0 && (minBi / maxBi < 0.70)) continue;

      const minLen = Math.min(primary.norm.length, backup.norm.length);
      if (minLen >= 4 && (primary.norm.includes(backup.norm) || backup.norm.includes(primary.norm))) {
        const score = jaccardSim(primary.norm, backup.norm);
        if (score > bestScore && score > 0.70) {
          bestScore = score;
          bestMatch = backup;
        }
      }
    }

    if (bestMatch) {
      fallbackMap[primary.stream_id] = backupDict[bestMatch.norm] || bestMatch;
      matchCount++;
    }
  }

  console.log(`[FuzzyMatcher] Successfully mapped total ${matchCount} channels!`);
  return fallbackMap;
};
