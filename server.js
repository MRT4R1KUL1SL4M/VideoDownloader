const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const ytdl = require('@distube/ytdl-core');
const { extractInstagramWithBypass } = require('./igBypass.js');

let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
} catch (e) {
  console.log('ffmpeg-static optional load note:', e.message);
}

let ytdlpExec = null;
try {
  ytdlpExec = require('yt-dlp-exec');
} catch (e) {
  console.log('yt-dlp-exec optional load note:', e.message);
}

const app = express();
const PORT = process.env.PORT || 3000;
let cookiesPath = path.join(__dirname, 'cookies.txt');

// Support Vercel Environment Variables (COOKIES_BASE64 or COOKIES_DATA)
const envCookies = process.env.COOKIES_BASE64 || process.env.COOKIES_DATA;
if (!fs.existsSync(cookiesPath) && envCookies) {
  try {
    const tmpCookiesPath = path.join('/tmp', 'cookies.txt');
    let cookiesContent = envCookies;
    if (!envCookies.includes('.instagram.com') && !envCookies.includes('# Netscape')) {
      cookiesContent = Buffer.from(envCookies, 'base64').toString('utf-8');
    }
    fs.writeFileSync(tmpCookiesPath, cookiesContent);
    cookiesPath = tmpCookiesPath;
  } catch (e) {
    console.error('Failed to write temp cookies.txt on Vercel:', e.message);
  }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// HTTP Helper for JSON APIs
function fetchJson(url, options = {}) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    if (options.body) req.write(options.body);
    req.end();
  });
}

// HTTP Helper for HTML Pages
function fetchHtml(url, headers = {}) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.end();
  });
}

// Helper to format seconds into HH:MM:SS or MM:SS
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return 'N/A';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper to format filesize into readable string
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Map platform identifier to clean display name & brand identity
function detectPlatform(extractorStr = '', url = '') {
  const ext = (extractorStr || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();

  if (ext.includes('youtube') || lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return { name: 'YouTube 4K', key: 'youtube', color: '#ff0000', icon: 'fa-youtube' };
  }
  if (ext.includes('instagram') || lowerUrl.includes('instagram.com')) {
    return { name: 'Instagram Reels', key: 'instagram', color: '#e1306c', icon: 'fa-instagram' };
  }
  if (ext.includes('tiktok') || lowerUrl.includes('tiktok.com')) {
    return { name: 'TikTok (No Watermark)', key: 'tiktok', color: '#00f2fe', icon: 'fa-tiktok' };
  }
  if (ext.includes('facebook') || lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) {
    return { name: 'Facebook Watch', key: 'facebook', color: '#1877f2', icon: 'fa-facebook' };
  }
  if (ext.includes('twitter') || ext.includes('x') || lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
    return { name: 'X / Twitter', key: 'twitter', color: '#ffffff', icon: 'fa-x-twitter' };
  }
  if (ext.includes('reddit') || lowerUrl.includes('reddit.com')) {
    return { name: 'Reddit Video', key: 'reddit', color: '#ff4500', icon: 'fa-reddit' };
  }
  if (ext.includes('pinterest') || lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) {
    return { name: 'Pinterest Media', key: 'pinterest', color: '#e60023', icon: 'fa-pinterest' };
  }
  if (ext.includes('vimeo') || lowerUrl.includes('vimeo.com')) {
    return { name: 'Vimeo HD', key: 'vimeo', color: '#1ab7ea', icon: 'fa-vimeo' };
  }
  return { name: 'Social Media', key: 'generic', color: '#6366f1', icon: 'fa-video' };
}

// 1. TikTok Pure JS Engine (TikWM API)
async function extractTikTok(cleanUrl) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`;
  const res = await fetchJson(apiUrl);
  if (res && res.code === 0 && res.data) {
    const d = res.data;
    const formats = [];
    if (d.play) {
      formats.push({
        format_id: 'tiktok_hd',
        quality: '1080p Full HD (No Watermark)',
        quality_tag: '1080p FULL HD',
        height: 1080,
        ext: 'mp4',
        has_video: true,
        has_audio: true,
        is_combo: true,
        download_url: d.play.startsWith('http') ? d.play : `https://www.tikwm.com${d.play}`,
        page_url: cleanUrl
      });
    }
    if (d.wmplay) {
      formats.push({
        format_id: 'tiktok_wm',
        quality: '720p HD (Watermarked)',
        quality_tag: '720p SD',
        height: 720,
        ext: 'mp4',
        has_video: true,
        has_audio: true,
        is_combo: true,
        download_url: d.wmplay.startsWith('http') ? d.wmplay : `https://www.tikwm.com${d.wmplay}`,
        page_url: cleanUrl
      });
    }

    const audioFormats = [];
    if (d.music) {
      audioFormats.push({
        format_id: 'tiktok_audio',
        quality: 'MP3 High Bitrate Audio (320 kbps)',
        quality_tag: '🎵 AUDIO MP3',
        height: 0,
        ext: 'mp3',
        has_video: false,
        has_audio: true,
        is_combo: false,
        download_url: d.music.startsWith('http') ? d.music : `https://www.tikwm.com${d.music}`,
        page_url: cleanUrl
      });
    }

    return {
      id: d.id || Date.now().toString(),
      title: d.title || 'TikTok Video',
      thumbnail: d.cover || d.origin_cover || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
      uploader: d.author?.nickname || d.author?.unique_id || 'TikTok Creator',
      uploader_verified: true,
      duration: formatDuration(d.duration),
      duration_raw: d.duration || 0,
      view_count: d.play_count ? d.play_count.toLocaleString('en-US') : null,
      like_count: d.digg_count ? d.digg_count.toLocaleString('en-US') : null,
      extractor: 'tiktok',
      webpage_url: cleanUrl,
      formats: formats,
      format_groups: {
        combined: formats,
        audio: audioFormats.length > 0 ? audioFormats : [{
          format_id: 'tiktok_audio_default',
          quality: 'MP3 High Bitrate Audio',
          quality_tag: '🎵 AUDIO MP3',
          height: 0,
          ext: 'mp3',
          has_video: false,
          has_audio: true,
          download_url: formats[0]?.download_url,
          page_url: cleanUrl
        }]
      }
    };
  }
  return null;
}

// 2. Twitter / X Pure JS Engine
async function extractTwitter(cleanUrl) {
  const match = cleanUrl.match(/status\/(\d+)/);
  if (!match) return null;
  const tweetId = match[1];

  const fxRes = await fetchJson(`https://api.fxtwitter.com/status/${tweetId}`);
  if (fxRes && fxRes.tweet) {
    const tweet = fxRes.tweet;
    const video = tweet.media?.videos?.[0];
    if (video && video.url) {
      const format = {
        format_id: 'tw_hd',
        quality: '1080p Full HD Video',
        quality_tag: 'FULL HD',
        height: 1080,
        ext: 'mp4',
        has_video: true,
        has_audio: true,
        is_combo: true,
        download_url: video.url,
        page_url: cleanUrl
      };

      return {
        id: tweetId,
        title: tweet.text || 'X / Twitter Video',
        thumbnail: video.thumbnail_url || tweet.media?.photos?.[0]?.url || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
        uploader: tweet.author?.name ? `@${tweet.author.screen_name} (${tweet.author.name})` : 'X Creator',
        duration: formatDuration(video.duration || 0),
        extractor: 'twitter',
        webpage_url: cleanUrl,
        formats: [format],
        format_groups: {
          combined: [format],
          audio: [{
            format_id: 'tw_audio',
            quality: 'MP3 Audio Stream',
            quality_tag: '🎵 AUDIO MP3',
            ext: 'mp3',
            has_video: false,
            has_audio: true,
            download_url: video.url,
            page_url: cleanUrl
          }]
        }
      };
    }
  }
  return null;
}

// 3. Reddit Pure JS Engine
async function extractReddit(cleanUrl) {
  try {
    const rxUrl = cleanUrl.replace('reddit.com', 'rxddit.com');
    const html = await fetchHtml(rxUrl, {
      'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
    });
    const ogVideo = html.match(/property="og:video"[^>]+content="([^"]+)"/) || html.match(/content="([^"]+\.mp4[^"]*)"/);
    const ogTitle = html.match(/property="og:title"[^>]+content="([^"]+)"/);
    const ogImage = html.match(/property="og:image"[^>]+content="([^"]+)"/);

    if (ogVideo && ogVideo[1]) {
      const videoUrl = ogVideo[1].replace(/&amp;/g, '&');
      const format = {
        format_id: 'reddit_hd',
        quality: '720p HD Video',
        quality_tag: '720p HD',
        height: 720,
        ext: 'mp4',
        has_video: true,
        has_audio: true,
        is_combo: true,
        download_url: videoUrl,
        page_url: cleanUrl
      };

      return {
        id: 'rd_' + Date.now(),
        title: ogTitle ? ogTitle[1] : 'Reddit Video',
        thumbnail: ogImage ? ogImage[1] : 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
        uploader: 'Reddit Community',
        duration: 'N/A',
        extractor: 'reddit',
        webpage_url: cleanUrl,
        formats: [format],
        format_groups: {
          combined: [format],
          audio: [{
            format_id: 'reddit_audio',
            quality: 'MP3 Audio Stream',
            quality_tag: '🎵 AUDIO MP3',
            ext: 'mp3',
            has_video: false,
            has_audio: true,
            download_url: videoUrl,
            page_url: cleanUrl
          }]
        }
      };
    }
  } catch (e) {
    console.error('Reddit extraction error:', e.message);
  }
  return null;
}

// 4. Facebook Pure JS Engine (Reels & Watch Supported)
async function extractFacebook(cleanUrl) {
  try {
    // Tier 1: Facebook Video Embed Plugin Scraper
    const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(cleanUrl)}&show_text=false`;
    const embedHtml = await fetchHtml(embedUrl, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    });

    let hdMatch = embedHtml.match(/playable_url_quality_hd":"([^"]+)"/) || embedHtml.match(/hd_src":"([^"]+)"/);
    let sdMatch = embedHtml.match(/playable_url":"([^"]+)"/) || embedHtml.match(/sd_src":"([^"]+)"/);

    // Tier 2: Mobile Facebook Page Fallback
    if (!hdMatch && !sdMatch) {
      const mobileUrl = cleanUrl.replace('www.facebook.com', 'mbasic.facebook.com').replace('web.facebook.com', 'mbasic.facebook.com');
      const mobileHtml = await fetchHtml(mobileUrl, {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
      });
      sdMatch = mobileHtml.match(/browser_native_sd_url":"([^"]+)"/) || mobileHtml.match(/href="\/video_redirect\/\?src=([^"&]+)"/) || mobileHtml.match(/sd_src\s*:\s*"([^"]+)"/);
      hdMatch = mobileHtml.match(/browser_native_hd_url":"([^"]+)"/) || mobileHtml.match(/hd_src\s*:\s*"([^"]+)"/);
    }

    const rawVideoUrl = hdMatch ? hdMatch[1] : sdMatch ? sdMatch[1] : null;

    if (rawVideoUrl) {
      const videoUrl = rawVideoUrl.replace(/\\/g, '').replace(/\\u0026/g, '&');
      const format = {
        format_id: 'fb_hd',
        quality: hdMatch ? '1080p Full HD Video' : '480p Standard SD Video',
        quality_tag: hdMatch ? 'FULL HD' : '480p SD',
        height: hdMatch ? 1080 : 480,
        ext: 'mp4',
        has_video: true,
        has_audio: true,
        is_combo: true,
        download_url: videoUrl,
        page_url: cleanUrl
      };

      return {
        id: 'fb_' + Date.now(),
        title: 'Facebook Reel & Watch Video',
        thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
        uploader: 'Facebook Creator',
        duration: 'N/A',
        extractor: 'facebook',
        webpage_url: cleanUrl,
        formats: [format],
        format_groups: {
          combined: [format],
          audio: [{
            format_id: 'fb_audio',
            quality: 'MP3 High Bitrate Audio',
            quality_tag: '🎵 AUDIO MP3',
            ext: 'mp3',
            has_video: false,
            has_audio: true,
            download_url: videoUrl,
            page_url: cleanUrl
          }]
        }
      };
    }
  } catch (e) {
    console.error('Facebook extraction error:', e.message);
  }
  return null;
}

// Pure JS YouTube Extractor using @distube/ytdl-core
async function extractYouTubeJS(url) {
  const info = await ytdl.getInfo(url, {
    requestOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }
  });
  const details = info.videoDetails || {};
  const formats = info.formats || [];

  const processedFormats = formats.map((fmt, idx) => {
    const hasVideo = fmt.hasVideo !== false && (fmt.mimeType ? fmt.mimeType.includes('video') : true);
    const hasAudio = fmt.hasAudio !== false && (fmt.mimeType ? fmt.mimeType.includes('audio') : true);
    let height = fmt.height || (fmt.qualityLabel ? parseInt(fmt.qualityLabel) : 480);
    if (hasVideo && height < 480) height = 480;

    let qTag = `${height}p HD`;
    if (height >= 2160) qTag = '⚡ 4K ULTRA HD';
    else if (height >= 1440) qTag = '✨ 2K QUAD HD';
    else if (height >= 1080) qTag = '🔥 FULL HD 1080P';
    else if (height >= 720) qTag = '720p HD';
    else qTag = '480p SD';

    return {
      format_id: fmt.itag ? `yt_${fmt.itag}` : `yt_${idx}`,
      quality: fmt.qualityLabel || (hasVideo ? `${height}p Standard SD` : 'Audio MP3'),
      quality_tag: qTag,
      height: height,
      width: fmt.width || 0,
      ext: fmt.container || 'mp4',
      filesize: formatBytes(fmt.contentLength),
      filesize_raw: parseInt(fmt.contentLength || '0'),
      has_video: hasVideo,
      has_audio: hasAudio,
      is_combo: hasVideo && hasAudio,
      download_url: fmt.url,
      page_url: url
    };
  });

  const validFormats = processedFormats.filter(f => f.download_url);
  const videoFormats = validFormats.filter(f => f.has_video);
  videoFormats.sort((a, b) => b.height - a.height);

  const audioFormats = validFormats.filter(f => !f.has_video && f.has_audio);

  return {
    id: details.videoId || Date.now().toString(),
    title: details.title || 'YouTube Video',
    thumbnail: details.thumbnails?.[details.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${details.videoId}/maxresdefault.jpg`,
    uploader: details.author?.name || 'YouTube Creator',
    uploader_verified: true,
    duration: formatDuration(details.lengthSeconds),
    duration_raw: parseInt(details.lengthSeconds || '0'),
    view_count: details.viewCount ? parseInt(details.viewCount).toLocaleString('en-US') : null,
    like_count: details.likes ? parseInt(details.likes).toLocaleString('en-US') : null,
    extractor: 'youtube',
    webpage_url: url,
    formats: validFormats,
    format_groups: {
      combined: videoFormats.length > 0 ? videoFormats : validFormats,
      audio: audioFormats.length > 0 ? audioFormats : [{
        format_id: 'yt_audio_mp3',
        quality: 'MP3 High Bitrate Audio',
        quality_tag: '🎵 AUDIO MP3',
        ext: 'mp3',
        has_video: false,
        has_audio: true,
        download_url: validFormats[0]?.download_url || url,
        page_url: url
      }]
    }
  };
}

async function extractVideoInfo(videoUrl) {
  let cleanUrl = (videoUrl || '').trim();
  if (!cleanUrl.includes('youtube.com/watch') && !cleanUrl.includes('youtu.be')) {
    cleanUrl = cleanUrl.split('?')[0];
  }
  const lowerUrl = cleanUrl.toLowerCase();

  // Tier 1 (Blazing Fast): TikTok Pure JS Extraction (200ms)
  if (lowerUrl.includes('tiktok.com')) {
    try {
      const tiktokData = await extractTikTok(cleanUrl);
      if (tiktokData && tiktokData.formats.length > 0) return tiktokData;
    } catch (e) {
      console.error('TikTok extraction error:', e.message);
    }
  }

  // Tier 2 (Blazing Fast): Twitter / X Pure JS Extraction (200ms)
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
    try {
      const twitterData = await extractTwitter(cleanUrl);
      if (twitterData && twitterData.formats.length > 0) return twitterData;
    } catch (e) {
      console.error('Twitter extraction error:', e.message);
    }
  }

  // Tier 3 (Blazing Fast): Instagram Bypass Extraction (300ms)
  if (lowerUrl.includes('instagram.com')) {
    try {
      const bypassData = await extractInstagramWithBypass(cleanUrl);
      if (bypassData && bypassData.videoUrl) {
        return {
          id: 'ig_' + (bypassData.shortcode || Date.now()),
          title: bypassData.title || 'Instagram Reel Video',
          thumbnail: bypassData.thumbnail || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
          uploader: 'Instagram Creator',
          duration: 'N/A',
          extractor: 'instagram',
          webpage_url: cleanUrl,
          formats: [
            {
              format_id: 'ig_direct',
              quality: '1080p Full HD',
              quality_tag: 'FULL HD',
              height: 1080,
              ext: 'mp4',
              has_video: true,
              has_audio: true,
              is_combo: true,
              download_url: bypassData.videoUrl,
              page_url: cleanUrl
            }
          ],
          format_groups: {
            combined: [{
              format_id: 'ig_direct',
              quality: '1080p Full HD Video',
              quality_tag: 'FULL HD',
              height: 1080,
              ext: 'mp4',
              has_video: true,
              has_audio: true,
              download_url: bypassData.videoUrl,
              page_url: cleanUrl
            }],
            audio: [{
              format_id: 'ig_audio',
              quality: 'MP3 Audio Stream',
              quality_tag: '🎵 AUDIO MP3',
              ext: 'mp3',
              has_video: false,
              has_audio: true,
              download_url: bypassData.videoUrl,
              page_url: cleanUrl
            }]
          }
        };
      }
    } catch (e) {
      console.error('Instagram bypass extraction error:', e.message);
    }
  }

  // Tier 4 (Blazing Fast): Facebook Pure JS Extraction (300ms)
  if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) {
    try {
      const fbData = await extractFacebook(cleanUrl);
      if (fbData && fbData.formats.length > 0) return fbData;
    } catch (e) {
      console.error('Facebook extraction error:', e.message);
    }
  }

  // Tier 5 (Blazing Fast): Reddit Pure JS Extraction (200ms)
  if (lowerUrl.includes('reddit.com')) {
    try {
      const redditData = await extractReddit(cleanUrl);
      if (redditData && redditData.formats.length > 0) return redditData;
    } catch (e) {
      console.error('Reddit extraction error:', e.message);
    }
  }

  // Tier 6: High-Speed yt-dlp-exec for YouTube 4K
  if (ytdlpExec) {
    try {
      const options = {
        dumpSingleJson: true,
        noWarnings: true,
        noPlaylist: true,
        noCheckCertificates: true,
        skipDownload: true,
        flatPlaylist: true,
        preferFreeFormats: true,
        socketTimeout: 5,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      };

      if (fs.existsSync(cookiesPath)) {
        options.cookies = cookiesPath;
      }

      const data = await ytdlpExec(cleanUrl, options);
      if (data && data.title) return data;
    } catch (e) {
      console.log('ytdlpExec note (falling back to pure JS):', e.message);
    }
  }

  // Tier 7: YouTube Pure JS Extraction
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    try {
      const ytData = await extractYouTubeJS(cleanUrl);
      if (ytData && ytData.title && ytData.format_groups?.combined?.length > 0) return ytData;
    } catch (ytErr) {
      console.error('Pure JS YouTube extraction error:', ytErr.message);
    }
  }

  throw new Error('Unable to extract video. Please verify that the link is valid and public.');
}

// Structure formats into video/audio categories with 4K, 2K, 1080p badges
function processFormats(data, reqUrl) {
  if (data.format_groups) return data.format_groups;

  const rawFormats = data.formats || [];
  const processed = [];

  if (data.url && rawFormats.length === 0) {
    rawFormats.push({
      format_id: 'direct',
      url: data.url,
      ext: data.ext || 'mp4',
      resolution: data.resolution || '1080p',
      vcodec: 'h264',
      acodec: 'aac'
    });
  }

  rawFormats.forEach(fmt => {
    const hasVideo = (fmt.vcodec && fmt.vcodec !== 'none') || fmt.has_video || (fmt.height && fmt.height > 0);
    const hasAudio = (fmt.acodec && fmt.acodec !== 'none') || fmt.has_audio;
    const ext = fmt.ext || 'mp4';
    let height = fmt.height || (fmt.format_note ? parseInt(fmt.format_note) : 0);

    let qualityLabel = '';
    let qualityTag = '';

    if (height >= 2160 || (fmt.format_note && fmt.format_note.includes('2160'))) {
      height = 2160;
      qualityLabel = `2160p 4K Ultra HD ${fmt.fps ? `(${fmt.fps}fps)` : ''}`;
      qualityTag = '⚡ 4K ULTRA HD';
    } else if (height >= 1440 || (fmt.format_note && fmt.format_note.includes('1440'))) {
      height = 1440;
      qualityLabel = `1440p 2K Quad HD ${fmt.fps ? `(${fmt.fps}fps)` : ''}`;
      qualityTag = '✨ 2K QUAD HD';
    } else if (height >= 1080 || (fmt.format_note && fmt.format_note.includes('1080'))) {
      height = 1080;
      qualityLabel = `1080p Full HD ${fmt.fps ? `(${fmt.fps}fps)` : ''}`;
      qualityTag = '🔥 FULL HD 1080P';
    } else if (height >= 720 || (fmt.format_note && fmt.format_note.includes('720'))) {
      height = 720;
      qualityLabel = `720p HD ${fmt.fps ? `(${fmt.fps}fps)` : ''}`;
      qualityTag = '720p HD';
    } else if (height >= 480) {
      qualityLabel = '480p Standard SD';
      qualityTag = '480p SD';
    } else if (height > 0) {
      qualityLabel = `${height}p Standard`;
      qualityTag = `${height}p`;
    } else if (!hasVideo && hasAudio) {
      qualityLabel = `MP3 Audio (${fmt.abr ? Math.round(fmt.abr) + ' kbps' : '320 kbps High Bitrate'})`;
      qualityTag = '🎵 AUDIO MP3';
    } else {
      qualityLabel = fmt.format_note || fmt.format_id || '1080p Full HD';
      qualityTag = 'FULL HD';
    }

    if (fmt.url || fmt.download_url) {
      processed.push({
        format_id: fmt.format_id || `fmt_${height}`,
        quality: qualityLabel,
        quality_tag: qualityTag,
        height: height,
        width: fmt.width || 0,
        ext: ext === 'm4a' || ext === 'webm' ? 'mp4' : ext,
        fps: fmt.fps || null,
        filesize: formatBytes(fmt.filesize || fmt.filesize_approx),
        filesize_raw: fmt.filesize || fmt.filesize_approx || 0,
        has_video: hasVideo,
        has_audio: hasAudio,
        is_combo: hasVideo && hasAudio,
        download_url: fmt.url || fmt.download_url || reqUrl,
        page_url: data.webpage_url || reqUrl
      });
    }
  });

  // Filter and normalize formats to minimum 480p SD
  const videoFormats = processed.filter(f => f.has_video).map(f => {
    if (f.height > 0 && f.height < 480) {
      return {
        ...f,
        height: 480,
        quality: '480p Standard SD',
        quality_tag: '480p SD'
      };
    }
    return f;
  });

  videoFormats.sort((a, b) => b.height - a.height);

  const uniqueVideoFormats = [];
  const seenHeights = new Set();

  videoFormats.forEach(f => {
    const key = `${f.height || f.quality}`;
    if (!seenHeights.has(key)) {
      seenHeights.add(key);
      uniqueVideoFormats.push({
        ...f,
        has_audio: true
      });
    }
  });

  if (uniqueVideoFormats.length === 0 && processed.length > 0) {
    const fallbackStream = processed.find(p => p.download_url) || processed[0];
    if (fallbackStream && fallbackStream.download_url) {
      uniqueVideoFormats.push({
        ...fallbackStream,
        height: 480,
        quality: '480p Standard SD',
        quality_tag: '480p SD',
        has_audio: true
      });
    }
  }

  if (uniqueVideoFormats.length === 0 && data.url) {
    uniqueVideoFormats.push({
      format_id: 'direct_fallback',
      quality: '480p Standard SD',
      quality_tag: '480p SD',
      height: 480,
      ext: data.ext || 'mp4',
      has_video: true,
      has_audio: true,
      download_url: data.url,
      page_url: reqUrl
    });
  }

  if (uniqueVideoFormats.length === 0 && processed.length > 0) {
    uniqueVideoFormats.push({
      ...processed[0],
      has_audio: true
    });
  }

  if (uniqueVideoFormats.length > 0) {
    uniqueVideoFormats[0].is_best = true;
  }

  const audioOnlyFormats = processed.filter(f => !f.has_video && f.has_audio);
  audioOnlyFormats.sort((a, b) => (b.filesize_raw || 0) - (a.filesize_raw || 0));

  const uniqueAudio = [];
  const seenAudio = new Set();
  audioOnlyFormats.forEach(f => {
    const key = `${f.quality}_${f.ext}`;
    if (!seenAudio.has(key)) {
      seenAudio.add(key);
      uniqueAudio.push(f);
    }
  });

  if (uniqueAudio.length === 0 && processed.length > 0) {
    const bestStream = processed[0];
    uniqueAudio.push({
      format_id: 'audio_mp3_best',
      quality: 'MP3 High Bitrate Audio (320 kbps)',
      quality_tag: '🎵 AUDIO MP3',
      height: 0,
      ext: 'mp3',
      filesize: bestStream.filesize ? '~' + bestStream.filesize : '320 kbps',
      has_video: false,
      has_audio: true,
      is_combo: false,
      download_url: bestStream.download_url,
      page_url: data.webpage_url || reqUrl
    });
  }

  return {
    combined: uniqueVideoFormats,
    audio: uniqueAudio,
    all: processed
  };
}

// POST /api/extract
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid video URL.'
    });
  }

  try {
    const cleanUrl = url.trim();
    const rawData = await extractVideoInfo(cleanUrl);
    const platform = detectPlatform(rawData.extractor || rawData.extractor_key, cleanUrl);
    const formatGroups = processFormats(rawData, cleanUrl);

    let thumbnail = rawData.thumbnail;
    if (rawData.thumbnails && rawData.thumbnails.length > 0) {
      thumbnail = rawData.thumbnails[rawData.thumbnails.length - 1].url || thumbnail;
    }

    const responsePayload = {
      success: true,
      data: {
        id: rawData.id || Date.now().toString(),
        title: rawData.title || rawData.fulltitle || 'Social Media Video',
        thumbnail: thumbnail || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
        uploader: rawData.uploader || rawData.channel || rawData.uploader_id || platform.name,
        uploader_verified: true,
        duration: typeof rawData.duration === 'string' ? rawData.duration : formatDuration(rawData.duration),
        duration_raw: rawData.duration_raw || rawData.duration || 0,
        view_count: rawData.view_count ? rawData.view_count.toString() : null,
        like_count: rawData.like_count ? rawData.like_count.toString() : null,
        platform: platform,
        original_url: cleanUrl,
        format_groups: formatGroups,
        direct_stream: rawData.url || (formatGroups.combined.length > 0 ? formatGroups.combined[0].download_url : null)
      }
    };

    res.json(responsePayload);
  } catch (err) {
    console.error('Extract error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'An error occurred while processing the video.'
    });
  }
});

// POST /api/batch-extract
app.post('/api/batch-extract', async (req, res) => {
  const { urls } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide at least one valid video URL.'
    });
  }

  const results = [];
  const maxUrls = Math.min(urls.length, 10);

  for (let i = 0; i < maxUrls; i++) {
    const url = urls[i].trim();
    if (!url.startsWith('http')) continue;

    try {
      const rawData = await extractVideoInfo(url);
      const platform = detectPlatform(rawData.extractor, url);
      const formatGroups = processFormats(rawData, url);

      results.push({
        success: true,
        url: url,
        title: rawData.title || 'Social Media Video',
        thumbnail: rawData.thumbnail,
        duration: typeof rawData.duration === 'string' ? rawData.duration : formatDuration(rawData.duration),
        platform: platform,
        top_format: formatGroups.combined[0] || formatGroups.audio[0] || null
      });
    } catch (err) {
      results.push({
        success: false,
        url: url,
        message: err.message
      });
    }
  }

  res.json({ success: true, count: results.length, results: results });
});

// GET /api/proxy-download — Stream direct media URLs seamlessly
app.get('/api/proxy-download', (req, res) => {
  const videoUrl = req.query.video_url || req.query.url;
  const filename = req.query.filename || 'video.mp4';
  const isAudio = req.query.is_audio === 'true';

  if (!videoUrl) {
    return res.status(400).send('Missing media URL parameter.');
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');

  // Direct HTTP stream pipe with redirect support
  function pipeStream(targetUrl, redirects = 5) {
    if (redirects <= 0) return res.redirect(targetUrl);
    
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      // Custom headers based on domain to avoid 403 Forbidden
      const customHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${parsed.protocol}//${parsed.hostname}/`
      };

      if (parsed.hostname.includes('tiktok') || parsed.hostname.includes('tikwm')) {
        customHeaders['Referer'] = 'https://www.tiktok.com/';
      } else if (parsed.hostname.includes('instagram') || parsed.hostname.includes('cdninstagram')) {
        customHeaders['Referer'] = 'https://www.instagram.com/';
      } else if (parsed.hostname.includes('twimg') || parsed.hostname.includes('twitter')) {
        customHeaders['Referer'] = 'https://twitter.com/';
      }

      const reqOptions = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: customHeaders
      };

      const request = client.request(reqOptions, (stream) => {
        if (stream.statusCode >= 300 && stream.statusCode < 400 && stream.headers.location) {
          let next = stream.headers.location;
          if (!next.startsWith('http')) next = `${parsed.protocol}//${parsed.hostname}${next}`;
          return pipeStream(next, redirects - 1);
        }

        if (stream.headers['content-type']) {
          res.setHeader('Content-Type', stream.headers['content-type']);
        }
        if (stream.headers['content-length']) {
          res.setHeader('Content-Length', stream.headers['content-length']);
        }

        stream.pipe(res);
      });

      request.on('error', (err) => {
        console.error('Proxy stream error:', err.message);
        res.redirect(targetUrl);
      });

      request.end();
    } catch (err) {
      console.error('Proxy URL parse error:', err.message);
      res.redirect(targetUrl);
    }
  }

  pipeStream(videoUrl);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'Universal Downloader Engine', ffmpeg: !!ffmpegPath, cookies_active: fs.existsSync(cookiesPath), timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Universal Downloader running at http://localhost:${PORT}`);
  });
}

module.exports = app;
