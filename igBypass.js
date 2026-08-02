/**
 * Instagram Bypass Helper Module
 * Extracts direct MP4 video streams from Instagram Reels & Posts
 */
async function extractInstagramWithBypass(inputUrl) {
  const cleanUrl = inputUrl.trim().split('?')[0];
  const match = cleanUrl.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match ? match[1] : null;

  if (!shortcode) {
    return null;
  }

  // Strategy 1: Mobile Embed Page Scraping with iPhone UA
  const embedUrls = [
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/reel/${shortcode}/embed/captioned/`
  ];

  for (const embedUrl of embedUrls) {
    try {
      const res = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      const html = await res.text();

      // Search for cdninstagram / fbcdn .mp4 links in embed html
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

  // Strategy 2: DDInstagram / VxInstagram Relay
  const proxyEndpoints = [
    `https://ddinstagram.com/reel/${shortcode}/`,
    `https://ddinstagram.com/p/${shortcode}/`,
    `https://vxinstagram.com/reel/${shortcode}/`
  ];

  for (const proxyUrl of proxyEndpoints) {
    try {
      const res = await fetch(proxyUrl, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
        }
      });
      const html = await res.text();

      const ogVideo = html.match(/property="og:video"[^>]+content="([^"]+)"/) || html.match(/content="([^"]+\.mp4[^"]*)"/);
      const ogImage = html.match(/property="og:image"[^>]+content="([^"]+)"/);

      if (ogVideo && ogVideo[1]) {
        return {
          videoUrl: ogVideo[1],
          thumbnail: ogImage ? ogImage[1] : null,
          title: `Instagram Reel Video (${shortcode})`,
          shortcode
        };
      }
    } catch (e) {
      console.error('Proxy relay error:', e.message);
    }
  }

  return null;
}

module.exports = { extractInstagramWithBypass };
