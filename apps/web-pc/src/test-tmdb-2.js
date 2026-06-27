const TMDB_API_KEY = '8eaaebd40c1c19c77e5394722e3a9503';
const BASE_URL = 'https://api.themoviedb.org/3';

async function test() {
  const url = `${BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=Sam%27s+Duty&year=2014`;
  const response = await fetch(url);
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
