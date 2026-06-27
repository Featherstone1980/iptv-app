export const mockCategories = [
  { id: 'live', name: 'Live TV' },
  { id: 'movies', name: 'Movies' },
  { id: 'series', name: 'TV Series' }
];

export const mockChannels = [
  { id: 'ch1', name: 'HBO HD', group: 'Entertainment', logo: 'https://upload.wikimedia.org/wikipedia/commons/d/de/HBO_logo.svg', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'ch2', name: 'ESPN', group: 'Sports', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'ch3', name: 'CNN', group: 'News', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/CNN.svg', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'ch4', name: 'National Geographic', group: 'Documentary', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/30/NatGeo_logo.svg', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'ch5', name: 'Disney Channel', group: 'Kids', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Disney_Channel_logo_2014.svg', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'ch6', name: 'AMC', group: 'Entertainment', logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/AMC_logo.svg', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'ch7', name: 'Fox News', group: 'News', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/67/Fox_News_Channel_logo.svg', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'ch8', name: 'Sky Sports', group: 'Sports', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Sky_Sports_logo_2020.svg', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }
];

// Generate mock EPG data spanning from -2 hours to +4 hours from now
const generateEPG = () => {
  const epg = {};
  const now = new Date();
  // Round down to the nearest hour
  const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 2, 0, 0);

  mockChannels.forEach(channel => {
    epg[channel.id] = [];
    let currentTime = new Date(startTime);
    for (let i = 0; i < 10; i++) {
      const duration = (Math.floor(Math.random() * 2) + 1) * 30 * 60 * 1000; // 30 or 60 mins
      const endTime = new Date(currentTime.getTime() + duration);
      epg[channel.id].push({
        id: `${channel.id}-${i}`,
        title: `Program ${i + 1} on ${channel.name}`,
        description: `This is a great program to watch on ${channel.name}. Enjoy the show!`,
        start: new Date(currentTime),
        end: new Date(endTime)
      });
      currentTime = endTime;
    }
  });
  return epg;
};

export const mockEPG = generateEPG();

export const mockVOD = [
  { id: 'vod1', title: 'The Matrix', type: 'movie', year: 1999, poster: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg' },
  { id: 'vod2', title: 'Inception', type: 'movie', year: 2010, poster: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQQsV5AC5.jpg' },
  { id: 'vod3', title: 'Interstellar', type: 'movie', year: 2014, poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
  { id: 'vod4', title: 'Stranger Things', type: 'series', year: 2016, poster: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8Os2w4A2s.jpg' },
  { id: 'vod5', title: 'Breaking Bad', type: 'series', year: 2008, poster: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGTn.jpg' },
];
