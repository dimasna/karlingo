// YouTube Search Service
// Uses YouTube Data API v3

const YOUTUBE_API_KEY = 'AIzaSyALLf3O13IQ0abAJGTVO2mEFuGQ34BJZxI';
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const MAX_RESULTS = 5;

// Popular karaoke songs for initial display
export const popularKaraokeSongs = [
  {
    id: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up - Karaoke',
    channel: 'Karaoke Channel',
    duration: '3:33'
  },
  {
    id: 'fJ9rUzIMcZQ',
    title: 'Bohemian Rhapsody - Sing Along',
    channel: 'Queen Karaoke',
    duration: '5:55'
  },
  {
    id: 'hTWKbfoikeg',
    title: 'Smells Like Teen Spirit - Karaoke',
    channel: 'Rock Karaoke',
    duration: '5:01'
  },
  {
    id: 'kJQP7kiw5Fk',
    title: 'Despacito - Karaoke Version',
    channel: 'Latin Karaoke',
    duration: '4:42'
  },
  {
    id: '9bZkp7q19f0',
    title: 'Gangnam Style - Sing Along',
    channel: 'K-Pop Karaoke',
    duration: '4:13'
  }
];

/**
 * Format ISO 8601 duration to readable format (e.g., PT4M13S -> 4:13)
 */
function formatDuration(isoDuration) {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '--:--';
  
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Search YouTube for karaoke videos using YouTube Data API v3
 * @param {string} query - Search query
 * @returns {Promise<Array>} - Array of video results (max 5)
 */
export async function searchYouTube(query) {
  // Add "karaoke" to search query for better results
  const searchQuery = `${query}`;

  try {
    // Step 1: Search for videos
    const searchUrl = new URL(YOUTUBE_API_URL);
    searchUrl.searchParams.append('part', 'snippet');
    searchUrl.searchParams.append('q', searchQuery);
    searchUrl.searchParams.append('type', 'video');
    searchUrl.searchParams.append('videoCaption', 'closedCaption');
    searchUrl.searchParams.append('videoEmbeddable', 'true');
    searchUrl.searchParams.append('maxResults', MAX_RESULTS.toString());
    searchUrl.searchParams.append('key', YOUTUBE_API_KEY);

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      throw new Error(`YouTube API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.items || searchData.items.length === 0) {
      console.warn('No results found');
      return [];
    }

    // Step 2: Get video details (including duration)
    const videoIds = searchData.items.map(item => item.id.videoId).join(',');
    const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    detailsUrl.searchParams.append('part', 'contentDetails');
    detailsUrl.searchParams.append('id', videoIds);
    detailsUrl.searchParams.append('key', YOUTUBE_API_KEY);

    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json();

    // Combine search results with video details
    const videos = searchData.items.map((item, index) => {
      const details = detailsData.items?.[index];
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        duration: details ? formatDuration(details.contentDetails.duration) : '--:--',
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url
      };
    });

    console.log(`Found ${videos.length} videos for "${query}"`);
    return videos;

  } catch (error) {
    console.error('YouTube search failed:', error);
    throw error;
  }
}

/**
 * Get YouTube video embed URL
 * @param {string} videoId - YouTube video ID
 * @param {boolean} autoplay - Whether to autoplay the video (default: false)
 */
export function getEmbedUrl(videoId, autoplay = false) {
  return `https://www.youtube.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&enablejsapi=1&cc_load_policy=1`;
}

/**
 * Get YouTube thumbnail URL
 */
export function getThumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

/**
 * Fetch YouTube video subtitles/captions using Botly Captions API
 * @param {string} videoId - YouTube video ID
 * @param {string} lang - Language code (default: 'en')
 * @returns {Promise<Array>} - Array of subtitle objects with start, dur, and text
 */
export async function fetchYouTubeSubtitles(videoId, lang = 'en') {
  try {
    const apiUrl = 'https://youtube-caption-extractor-production.up.railway.app/api/captions';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoInput: videoId,
        lang: lang
      })
    });

    const data = await response.json();

    if (!data.success || !data.data?.subtitles) {
      console.warn('No captions found for video:', videoId);
      return null;
    }

    // Convert to our format with numeric values
    const subtitles = data.data.subtitles.map((sub) => {
      const start = parseFloat(sub.start);
      const dur = parseFloat(sub.dur);
      return {
        start,
        dur,
        end: start + dur,
        text: sub.text.replace(/\n/g, ' ').trim() // Replace newlines with spaces
      };
    });

    console.log(`Fetched ${subtitles.length} subtitle entries for "${data.data.title}"`);
    return subtitles;
  } catch (error) {
    console.error('Failed to fetch subtitles:', error);
    return null;
  }
}
