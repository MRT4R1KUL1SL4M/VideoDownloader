/**
 * Instagram Bypass Helper Module
 * Multi-tier engine to extract direct video streams from Instagram Reels & Posts
 */
const https = require('https');
const http = require('http');

function fetchUrl(url, options = {}) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', (e) => resolve({ status: 500, error: e.message, body: '' }));
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function extractInstagramWithBypass(inputUrl) {
  const cleanUrl = inputUrl.trim().split('?')[0];
  const match = cleanUrl.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match ? match[1] : null;

  if (!shortcode) {
    return null;
  }

  // Strategy 1: DDInstagram / VxInstagram relay
  const proxyEndpoints = [
    `https://ddinstagram.com/reel/${shortcode}/`,
    `https://ddinstagram.com/p/${shortcode}/`,
    `https://vxinstagram.com/reel/${shortcode}/`,
    `https://vxinstagram.com/p/${shortcode}/`
  ];

  for (const proxyUrl of proxyEndpoints) {
    try {
      const res = await fetchUrl(proxyUrl, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      const html = res.body || '';

      const ogVideo = html.match(/property="og:video"[^>]+content="([^"]+)"/) || 
                      html.match(/content="([^"]+)"[^>]+property="og:video"/) ||
                      html.match(/content="([^"]+\.mp4[^"]*)"/);
      const ogImage = html.match(/property="og:image"[^>]+content="([^"]+)"/) ||
                      html.match(/content="([^"]+)"[^>]+property="og:image"/);
      const ogTitle = html.match(/property="og:title"[^>]+content="([^"]+)"/);

      if (ogVideo && ogVideo[1]) {
        const videoUrl = ogVideo[1].replace(/&amp;/g, '&');
        return {
          videoUrl,
          thumbnail: ogImage ? ogImage[1].replace(/&amp;/g, '&') : null,
          title: ogTitle ? ogTitle[1] : `Instagram Reel Video (${shortcode})`,
          shortcode
        };
      }
    } catch (e) {
      console.error('Proxy relay error:', e.message);
    }
  }

  // Strategy 2: Mobile Embed Page Scraping with iPhone UA
  const embedUrls = [
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/reel/${shortcode}/embed/captioned/`
  ];

  for (const embedUrl of embedUrls) {
    try {
      const res = await fetchUrl(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      const html = res.body || '';

      const mp4Matches = html.match(/https?:\\?\/\\?\/[^\s"']*(?:cdninstagram|fbcdn)[^\s"']*\.mp4[^\s"']*/g) ||
                         html.match(/https?:\\?\/\\?\/[^\s"']+\.mp4[^\s"']*/g);

      const thumbMatches = html.match(/https?:\\?\/\\?\/[^\s"']*(?:cdninstagram|fbcdn)[^\s"']*\.jpg[^\s"']*/g);

      if (mp4Matches && mp4Matches.length > 0) {
        const videoUrl = mp4Matches[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
        const thumbnail = thumbMatches ? thumbMatches[0].replace(/\\u0026/g, '&').replace(/\\/g, '') : null;

        return {
          videoUrl,
          thumbnail,
          title: `Instagram Reel Video (${shortcode})`,
          shortcode
        };
      }
    } catch (e) {
      console.error('Embed bypass error:', e.message);
    }
  }

  return null;
}

module.exports = { extractInstagramWithBypass };
