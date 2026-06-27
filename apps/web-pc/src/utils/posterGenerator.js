// Generates a hash from a string to ensure the same title always gets the same colors
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
};

// Generates a beautiful gradient based on the title's hash
export const getProceduralGradient = (title) => {
  if (!title) return 'linear-gradient(135deg, #2d3748, #1a202c)';

  const palettes = [
    ['#1a1a24', '#0d0d12'], // Dark Charcoal
    ['#111827', '#030712'], // Deep Navy
    ['#1c1917', '#0c0a09'], // Dark Stone
    ['#2d1b1b', '#110606'], // Very Dark Crimson
    ['#16202a', '#0a0f14'], // Deep Midnight Blue
    ['#202225', '#131517'], // Slate Gray
    ['#1e1b2e', '#0d0b17'], // Dark Indigo
    ['#1f2937', '#0f172a'], // Cool Gray
  ];

  const hash = Math.abs(hashString(title));
  const paletteIndex = hash % palettes.length;
  const palette = palettes[paletteIndex];

  if (palette.length === 2) {
    return `linear-gradient(135deg, ${palette[0]}, ${palette[1]})`;
  } else {
    return `linear-gradient(135deg, ${palette[0]}, ${palette[1]}, ${palette[2]})`;
  }
};

// Get initials for a clean background element
export const getInitials = (title) => {
  if (!title) return '?';
  const clean = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.substring(0, 2).toUpperCase();
};
