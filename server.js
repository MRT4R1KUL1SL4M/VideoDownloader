const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const ytdl = require('@distube/ytdl-core');
const { extractInstagramWithBypass } = require('./igBypass.js');

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

// Pure JS YouTube Extractor using @distube/ytdl-core
async function extractYouTubeJS(url) {
  const info = await ytdl.getInfo(url);
  const details = info.videoDetails || {};
  const formats = info.formats || [];

  const processedFormats = formats.map((fmt, idx) => ({
    format_id: fmt.itag ? `yt_${fmt.itag}` : `yt_${idx}`,
    quality: fmt.qualityLabel || (fmt.hasVideo ? '1080p Full HD' : 'Audio MP3'),
    quality_tag: fmt.qualityLabel || 'FULL HD',
    height: fmt.height || (fmt.qualityLabel ? parseInt(fmt.qualityLabel) : 1080),
    width: fmt.width || 0,
    ext: fmt.container || 'mp4',
    filesize: formatBytes(fmt.contentLength),
    filesize_raw: parseInt(fmt.contentLength || '0'),
    has_video: !!fmt.hasVideo,
    has_audio: !!fmt.hasAudio,
    is_combo: fmt.hasVideo && fmt.hasAudio,
    download_url: fmt.url,
    page_url: url
  }));

  const videoFormats = processedFormats.filter(f => f.has_video);
  videoFormats.sort((a, b) => b.height - a.height);

  const audioFormats = processedFormats.filter(f => !f.has_video && f.has_audio);

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
    formats: processedFormats,
    format_groups: {
      combined: videoFormats.length > 0 ? videoFormats : processedFormats,
      audio: audioFormats.length > 0 ? audioFormats : processedFormats
    }
  };
}

// Master Extractor Engine with Multi-Tier Fallbacks
async function extractVideoInfo(videoUrl) {
  const cleanUrl = videoUrl.split('?')[0];

  // Tier 1: YouTube Pure JS Extraction
  if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
    try {
      const ytData = await extractYouTubeJS(cleanUrl);
      if (ytData && ytData.title) return ytData;
    } catch (ytErr) {
      console.error('Pure JS YouTube extraction error:', ytErr.message);
    }
  }

  // Tier 2: Instagram Bypass Extraction
  if (cleanUrl.includes('instagram.com')) {
    try {
      const bypassData = await extractInstagramWithBypass(cleanUrl);
      if (bypassData && bypassData.videoUrl) {
        return {
          id: 'ig_' + (bypassData.shortcode || Date.now()),
          title: bypassData.title || 'Instagram Reel Video',
          thumbnail: bypassData.thumbnail || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80',
          uploader: 'Instagram Creator',
          duration: 0,
          extractor: 'instagram',
          webpage_url: cleanUrl,
          formats: [
            {
              format_id: 'ig_direct',
              url: bypassData.videoUrl,
              ext: 'mp4',
              height: 1080,
              vcodec: 'h264',
              acodec: 'aac',
              format_note: '1080p Full HD'
            }
          ]
        };
      }
    } catch (bypassErr) {
      console.error('Instagram bypass error:', bypassErr.message);
    }
  }

  // Tier 3: yt-dlp-exec (if standalone binary runner is available)
  if (ytdlpExec) {
    try {
      const options = {
        dumpSingleJson: true,
        noWarnings: true,
        preferFreeFormats: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      };

      if (fs.existsSync(cookiesPath)) {
        options.cookies = cookiesPath;
      }

      const data = await ytdlpExec(cleanUrl, options);
      return data;
    } catch (e) {
      console.error('ytdlpExec error:', e.message);
    }
  }

  throw new Error('Unable to extract video. Please verify that the link is valid and public.');
}

// Structure formats into video/audio categories
function processFormats(data, reqUrl) {
  if (data.format_groups) return data.format_groups;

  const rawFormats = data.formats || [];
  const processed = [];

  if (data.url && rawFormats.length === 0) {
    rawFormats.push({
      format_id: 'direct',
      url: data.url,
      ext: data.ext || 'mp4',
      resolution: data.resolution || '720p',
      vcodec: 'h264',
      acodec: 'aac'
    });
  }

  rawFormats.forEach(fmt => {
    const hasVideo = fmt.vcodec && fmt.vcodec !== 'none';
    const hasAudio = fmt.acodec && fmt.acodec !== 'none';
    const ext = fmt.ext || 'mp4';
    let height = fmt.height || 0;

    let qualityLabel = '';
    let qualityTag = '';

    if (height >= 2160) {
      qualityLabel = '2160p 4K Ultra HD';
      qualityTag = '4K ULTRA HD';
    } else if (height >= 1440) {
      qualityLabel = '1440p 2K Quad HD';
      qualityTag = '2K QUAD HD';
    } else if (height >= 1080) {
      qualityLabel = '1080p Full HD';
      qualityTag = 'FULL HD';
    } else if (height >= 720) {
      qualityLabel = '720p HD';
      qualityTag = '720p HD';
    } else if (height >= 480) {
      qualityLabel = '480p SD';
      qualityTag = '480p SD';
    } else if (height > 0) {
      qualityLabel = `${height}p Standard`;
      qualityTag = `${height}p`;
    } else if (!hasVideo && hasAudio) {
      qualityLabel = `MP3 Audio (${fmt.abr ? Math.round(fmt.abr) + ' kbps' : '320 kbps High Bitrate'})`;
      qualityTag = 'AUDIO MP3';
    } else {
      qualityLabel = fmt.format_note || fmt.format_id || '1080p Full HD';
      qualityTag = 'FULL HD';
    }

    if (fmt.url || fmt.format_id) {
      processed.push({
        format_id: fmt.format_id,
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
        download_url: fmt.url || reqUrl,
        page_url: data.webpage_url || reqUrl
      });
    }
  });

  const videoFormats = processed.filter(f => f.has_video);
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
      quality_tag: 'AUDIO MP3',
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
        duration: formatDuration(rawData.duration),
        duration_raw: rawData.duration || 0,
        view_count: rawData.view_count ? rawData.view_count.toLocaleString('en-US') : null,
        like_count: rawData.like_count ? rawData.like_count.toLocaleString('en-US') : null,
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
        duration: formatDuration(rawData.duration),
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
    
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${parsed.protocol}//${parsed.hostname}/`
      }
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
  }

  pipeStream(videoUrl);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'SnapFetch Pro Core Engine', ffmpeg: !!ffmpegPath, cookies_active: fs.existsSync(cookiesPath), timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`SnapFetch Pro Backend running at http://localhost:${PORT}`);
  });
}

module.exports = app;
