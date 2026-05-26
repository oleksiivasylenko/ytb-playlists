import axios from 'axios';

export type VideoAvailability = 'available' | 'unavailable' | 'unknown';

export type VideoMetadata = {
  title: string;
  thumbnail: string;
  author: string;
  view_count: number;
  published_at: string | null;
  duration: number;
  availability: VideoAvailability;
};

type PlayerResponse = {
  videoDetails?: {
    title?: string;
    author?: string;
    viewCount?: string;
    lengthSeconds?: string;
  };
  microformat?: {
    playerMicroformatRenderer?: {
      publishDate?: string;
    };
  };
  playabilityStatus?: {
    status?: string;
  };
};

export class VideoMetadataFetchError extends Error {
  constructor(videoId: string, message: string) {
    super(`Failed to fetch metadata for ${videoId}: ${message}`);
    this.name = 'VideoMetadataFetchError';
  }
}

function fallbackMetadata(videoId: string, availability: VideoAvailability): VideoMetadata {
  return {
    title: 'Unknown Title',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    author: 'Unknown Author',
    view_count: 0,
    published_at: null,
    duration: 0,
    availability
  };
}

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status ? `HTTP ${status}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function isUnavailableResponse(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 410;
}

function fromPlayerResponse(videoId: string, data: PlayerResponse): VideoMetadata {
  const videoDetails = data.videoDetails || {};
  const microformat = data.microformat?.playerMicroformatRenderer || {};
  const title = videoDetails.title || '';

  if (!title && data.playabilityStatus?.status && data.playabilityStatus.status !== 'OK') {
    return fallbackMetadata(videoId, 'unavailable');
  }

  return {
    title: title || 'Unknown Title',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    author: videoDetails.author || 'Unknown Author',
    view_count: parseInt(videoDetails.viewCount || '0', 10),
    published_at: microformat.publishDate || null,
    duration: parseInt(videoDetails.lengthSeconds || '0', 10),
    availability: title ? 'available' : 'unknown'
  };
}

export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata> {
  let pageError: unknown = null;

  try {
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = String(response.data || '');
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});(?:var|<\/script>)/s);
    if (match && match[1]) return fromPlayerResponse(videoId, JSON.parse(match[1]) as PlayerResponse);
  } catch (error) {
    pageError = error;
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await axios.get(oembedUrl, { timeout: 5000 });

    return {
      title: response.data.title || 'Unknown Title',
      thumbnail: response.data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      author: response.data.author_name || 'Unknown Author',
      view_count: 0,
      published_at: null,
      duration: 0,
      availability: response.data.title ? 'available' : 'unknown'
    };
  } catch (error) {
    if (isUnavailableResponse(pageError) || isUnavailableResponse(error)) {
      return fallbackMetadata(videoId, 'unavailable');
    }

    throw new VideoMetadataFetchError(videoId, errorMessage(error || pageError));
  }
}
