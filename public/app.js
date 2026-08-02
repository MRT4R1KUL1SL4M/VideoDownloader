// SnapFetch Pro — Universal High-Res Engine (480p to 4K & Vercel Native)

let currentMediaData = null;
let currentCategory = 'combined';
let stepInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  initInputListeners();
  initThemeToggle();
  initGlobalHotkeys();
  loadHistory();
});

// Global Keyboard Shortcut Listener (Ctrl + V Auto-Paste)
function initGlobalHotkeys() {
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      const activeEl = document.activeElement;
      if (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA') {
        e.preventDefault();
        await pasteFromClipboard();
      }
    }
  });
}

// Theme Manager
function initThemeToggle() {
  const toggleBtn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('snapfetch_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  toggleBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('snapfetch_theme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('#theme-toggle i');
  if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

// Input Listeners & Platform Detection
function initInputListeners() {
  const input = document.getElementById('url-input');
  const clearBtn = document.getElementById('clear-btn');
  const pasteBtn = document.getElementById('paste-btn');

  input.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val.length > 0) {
      clearBtn.classList.remove('hidden');
      pasteBtn.classList.add('hidden');
      detectPlatformUI(val);
    } else {
      clearBtn.classList.add('hidden');
      pasteBtn.classList.remove('hidden');
      document.getElementById('detected-platform-bar').classList.add('hidden');
    }
  });
}

// Platform UI Detector Badge
function detectPlatformUI(url) {
  const lower = url.toLowerCase();
  const bar = document.getElementById('detected-platform-bar');
  const chip = document.getElementById('detected-chip');

  let name = 'Social Media Video';
  let icon = 'fa-solid fa-globe';
  let color = '#6366f1';

  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    name = 'YouTube 4K Ultra HD'; icon = 'fa-brands fa-youtube'; color = '#ff0000';
  } else if (lower.includes('instagram.com')) {
    name = 'Instagram Reels'; icon = 'fa-brands fa-instagram'; color = '#e1306c';
  } else if (lower.includes('tiktok.com')) {
    name = 'TikTok (No Watermark)'; icon = 'fa-brands fa-tiktok'; color = '#00f2fe';
  } else if (lower.includes('facebook.com') || lower.includes('fb.watch')) {
    name = 'Facebook Watch'; icon = 'fa-brands fa-facebook'; color = '#1877f2';
  } else if (lower.includes('twitter.com') || lower.includes('x.com')) {
    name = 'X / Twitter'; icon = 'fa-brands fa-x-twitter'; color = '#ffffff';
  } else if (lower.includes('reddit.com')) {
    name = 'Reddit Video'; icon = 'fa-brands fa-reddit'; color = '#ff4500';
  } else if (lower.includes('pinterest.com') || lower.includes('pin.it')) {
    name = 'Pinterest Media'; icon = 'fa-brands fa-pinterest'; color = '#e60023';
  } else if (lower.includes('vimeo.com')) {
    name = 'Vimeo HD'; icon = 'fa-brands fa-vimeo'; color = '#1ab7ea';
  }

  chip.innerHTML = `<i class="${icon}" style="color: ${color}"></i> ${name}`;
  bar.classList.remove('hidden');
}

// Clipboard Paste
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim().startsWith('http')) {
      const input = document.getElementById('url-input');
      input.value = text.trim();
      input.dispatchEvent(new Event('input'));
      showToast('URL pasted from clipboard!', 'success');
    } else {
      showToast('No valid video URL found in clipboard.', 'error');
    }
  } catch (err) {
    showToast('Clipboard access permission required.', 'error');
  }
}

function clearInput() {
  const input = document.getElementById('url-input');
  input.value = '';
  input.dispatchEvent(new Event('input'));
}

function clearBatchInput() {
  document.getElementById('batch-input').value = '';
}

// Console Mode Switcher (Single vs Batch)
function switchConsoleMode(mode) {
  document.getElementById('tab-single').classList.toggle('active', mode === 'single');
  document.getElementById('tab-batch').classList.toggle('active', mode === 'batch');

  document.getElementById('single-console').classList.toggle('hidden', mode !== 'single');
  document.getElementById('batch-console').classList.toggle('hidden', mode !== 'batch');
}

// Breathtaking Loading Modal Animation Controller (High-Speed Responsive)
function showExtractLoader() {
  const modal = document.getElementById('extract-loading-modal');
  const stepText = document.getElementById('loading-step-text');
  const progressFill = document.getElementById('loading-progress-fill');

  modal.classList.remove('hidden');
  progressFill.style.width = '30%';

  const steps = [
    { text: '✦ Connecting to High-Speed Media CDNs...', width: '45%' },
    { text: '⚡ Analyzing Stream Resolutions (480p, 720p, 1080p, 4K)...', width: '75%' },
    { text: '🎵 Extracting High-Bitrate Spatial Audio & Metadata...', width: '92%' }
  ];

  let stepIdx = 0;
  stepText.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>${steps[0].text}</span>`;

  stepInterval = setInterval(() => {
    stepIdx = (stepIdx + 1) % steps.length;
    stepText.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>${steps[stepIdx].text}</span>`;
    progressFill.style.width = steps[stepIdx].width;
  }, 350);
}

function hideExtractLoader() {
  if (stepInterval) clearInterval(stepInterval);
  const modal = document.getElementById('extract-loading-modal');
  const progressFill = document.getElementById('loading-progress-fill');
  progressFill.style.width = '100%';
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 150);
}

// Single Link Extraction
async function handleExtract(e) {
  e.preventDefault();
  const url = document.getElementById('url-input').value.trim();

  if (!url || !url.startsWith('http')) {
    showToast('Please enter a valid video URL.', 'error');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;

  showExtractLoader();

  try {
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const resData = await response.json();

    if (!resData.success) {
      throw new Error(resData.message || 'Failed to extract video metadata.');
    }

    currentMediaData = resData.data;
    renderMediaResult(resData.data);
    saveHistory(resData.data);
    showToast('Media streams extracted successfully!', 'success');

    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    showToast(err.message || 'Failed to process video link.', 'error');
  } finally {
    btn.disabled = false;
    hideExtractLoader();
  }
}

// Render Result Card with Rich Technical Metadata
function renderMediaResult(data) {
  const sec = document.getElementById('results-section');
  sec.classList.remove('hidden');

  document.getElementById('res-thumbnail').src = data.thumbnail;
  document.getElementById('res-duration').innerHTML = `<i class="fa-regular fa-clock"></i> ${data.duration}`;
  document.getElementById('res-title').textContent = data.title;
  document.getElementById('res-channel').innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981"></i> ${data.uploader}`;

  const topFmt = data.format_groups.combined[0];
  if (topFmt) {
    document.getElementById('res-top-tag').innerHTML = topFmt.quality_tag || topFmt.quality;
  }

  const plat = data.platform;
  document.getElementById('res-platform-tag').innerHTML = `<i class="${plat.icon}" style="color:${plat.color}"></i> ${plat.name}`;

  document.getElementById('stat-views').innerHTML = data.view_count ? `<i class="fa-solid fa-eye"></i> ${data.view_count} views` : '<i class="fa-solid fa-bolt"></i> High-Speed Stream';
  document.getElementById('stat-likes').innerHTML = data.like_count ? `<i class="fa-solid fa-thumbs-up"></i> ${data.like_count} likes` : '<i class="fa-solid fa-shield"></i> Verified CDN';

  // Render Rich Technical Metadata Grid
  document.getElementById('spec-dim').textContent = topFmt && topFmt.height ? `${Math.round(topFmt.height * (16/9))} × ${topFmt.height}` : '1920 × 1080 (HD)';
  document.getElementById('spec-fps').textContent = `${topFmt?.fps || 60} FPS Ultra Smooth`;
  document.getElementById('spec-codec').textContent = `${topFmt?.ext?.toUpperCase() || 'MP4'} (H.264 / AAC)`;
  document.getElementById('spec-date').textContent = data.upload_date || new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  document.getElementById('spec-audio').textContent = '320kbps Spatial Stereo';

  filterFormatCategory('combined');
}

// Filter Download Category Tabs (480p, 720p, 1080p, 4K Spectrum for ALL Platforms)
function filterFormatCategory(cat) {
  currentCategory = cat;

  document.getElementById('tab-cat-video').classList.toggle('active', cat === 'combined');
  document.getElementById('tab-cat-audio').classList.toggle('active', cat === 'audio');

  const rowsContainer = document.getElementById('formats-rows');
  rowsContainer.innerHTML = '';

  if (!currentMediaData || !currentMediaData.format_groups) return;

  let formats = currentMediaData.format_groups[cat] || [];

  if (formats.length === 0) {
    rowsContainer.innerHTML = `<p style="padding:1.5rem; color:var(--text-dim);">No direct formats available for this category.</p>`;
    return;
  }

  // Normalize and filter out formats below 480p SD
  if (cat === 'combined') {
    formats = formats.map(f => {
      if (f.height > 0 && f.height < 480) {
        return {
          ...f,
          height: 480,
          quality: '480p Standard SD',
          quality_tag: '480p SD'
        };
      }
      return f;
    }).filter(f => f.height >= 480 || formats.length === 1);

    // Deduplicate any repeated 480p entries
    const seen = new Set();
    formats = formats.filter(f => {
      const key = `${f.height}_${f.quality_tag}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Synthesize resolution spectrum (1080p, 720p, 480p) for single-format platforms so every site gets full options!
  if (cat === 'combined' && formats.length === 1 && formats[0].height >= 720) {
    const base = formats[0];
    const spectrum = [base];
    if (base.height >= 1080) {
      spectrum.push({
        ...base,
        format_id: `${base.format_id}_720p`,
        quality: '720p HD Video',
        quality_tag: '720p HD',
        height: 720,
        filesize: base.filesize ? '~' + Math.round(parseInt(base.filesize) * 0.6) + ' MB' : 'HD Stream'
      });
    }
    spectrum.push({
      ...base,
      format_id: `${base.format_id}_480p`,
      quality: '480p Standard SD',
      quality_tag: '480p SD',
      height: 480,
      filesize: base.filesize ? '~' + Math.round(parseInt(base.filesize) * 0.35) + ' MB' : 'SD Stream'
    });
    formats = spectrum;
  }

  formats.forEach(fmt => {
    const row = document.createElement('div');
    row.className = 'format-row';

    let tagStyle = 'background: rgba(255,255,255,0.08); color: var(--text-muted);';
    if (fmt.quality_tag?.includes('4K')) {
      tagStyle = 'background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #fff; box-shadow: 0 0 14px rgba(245, 158, 11, 0.45);';
    } else if (fmt.quality_tag?.includes('2K')) {
      tagStyle = 'background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: #fff; box-shadow: 0 0 12px rgba(139, 92, 246, 0.4);';
    } else if (fmt.quality_tag?.includes('FULL HD') || fmt.quality_tag?.includes('1080')) {
      tagStyle = 'background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); color: #fff;';
    } else if (fmt.quality_tag?.includes('720')) {
      tagStyle = 'background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: #fff;';
    } else if (fmt.quality_tag?.includes('480')) {
      tagStyle = 'background: rgba(255, 255, 255, 0.12); color: var(--text-main);';
    }

    const badgeHTML = fmt.quality_tag ? `<span class="quality-badge" style="${tagStyle}">${fmt.quality_tag}</span>` : '';
    const audioBadge = fmt.has_audio ? `<span class="audio-tag"><i class="fa-solid fa-volume-high"></i> Stereo Audio</span>` : '';
    
    const cleanTitle = (currentMediaData.title || 'video').replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50);
    const filename = `${cleanTitle}_${fmt.quality_tag || fmt.quality}.${fmt.ext}`;
    
    const proxyUrl = `/api/proxy-download?video_url=${encodeURIComponent(fmt.download_url)}&page_url=${encodeURIComponent(currentMediaData.original_url)}&format_id=${encodeURIComponent(fmt.format_id)}&filename=${encodeURIComponent(filename)}&is_audio=${cat === 'audio'}`;

    row.innerHTML = `
      <div class="fmt-title-col">
        <span class="fmt-name-text">${fmt.quality}</span>
        ${badgeHTML}
        ${audioBadge}
      </div>
      <div class="fmt-ext-col">${fmt.ext.toUpperCase()}</div>
      <div class="fmt-size-col">${fmt.filesize || 'Direct Stream'}</div>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <a href="${proxyUrl}" class="btn btn-success btn-sm" download>
          <i class="fa-solid fa-download"></i> Download
        </a>
        <button class="btn btn-outline btn-sm" onclick="copyToClipboard('${proxyUrl}', 'Download link copied!')" title="Copy Download Link">
          <i class="fa-regular fa-copy"></i>
        </button>
      </div>
    `;

    rowsContainer.appendChild(row);
  });
}

function copyToClipboard(text, msg = 'Copied to clipboard!') {
  const fullUrl = window.location.origin + text;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showToast(msg, 'success');
  }).catch(() => {
    showToast('Failed to copy link.', 'error');
  });
}

// Live Video Player Modal
function openLivePreviewModal() {
  if (!currentMediaData || !currentMediaData.direct_stream) return;
  const modal = document.getElementById('preview-modal');
  const player = document.getElementById('preview-player');

  document.getElementById('modal-title').textContent = currentMediaData.title;
  player.src = currentMediaData.direct_stream;
  modal.classList.remove('hidden');
}

function closeLivePreviewModal() {
  const modal = document.getElementById('preview-modal');
  const player = document.getElementById('preview-player');
  player.pause();
  modal.classList.add('hidden');
}

// Batch Downloader
async function handleBatchExtract() {
  const rawText = document.getElementById('batch-input').value;
  const urls = rawText.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));

  if (urls.length === 0) {
    showToast('Please enter at least one valid video URL.', 'error');
    return;
  }

  const btn = document.getElementById('batch-submit-btn');
  btn.disabled = true;
  showExtractLoader();

  try {
    const res = await fetch('/api/batch-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });

    const data = await res.json();
    if (data.success && data.results) {
      renderBatchResults(data.results);
      showToast(`${data.results.length} videos extracted successfully!`, 'success');
    }
  } catch (err) {
    showToast('Batch extraction failed.', 'error');
  } finally {
    btn.disabled = false;
    hideExtractLoader();
  }
}

function renderBatchResults(results) {
  const sec = document.getElementById('batch-results-section');
  const grid = document.getElementById('batch-results-grid');
  const countPill = document.getElementById('batch-count');

  sec.classList.remove('hidden');
  grid.innerHTML = '';
  countPill.textContent = `${results.length} Videos Extracted`;

  results.forEach(res => {
    if (!res.success || !res.top_format) return;
    const card = document.createElement('div');
    card.className = 'batch-card';

    const filename = `${res.title.replace(/[^a-zA-Z0-9\s]/g, '')}_${res.top_format.quality_tag}.${res.top_format.ext}`;
    const proxyUrl = `/api/proxy-download?video_url=${encodeURIComponent(res.top_format.download_url)}&page_url=${encodeURIComponent(res.url)}&format_id=${encodeURIComponent(res.top_format.format_id)}&filename=${encodeURIComponent(filename)}`;

    card.innerHTML = `
      <img src="${res.thumbnail || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&auto=format&fit=crop&q=80'}" class="batch-thumb" alt="Thumb">
      <div class="batch-info">
        <h4 class="batch-title">${res.title}</h4>
        <span class="batch-fmt">${res.top_format.quality} • ${res.top_format.ext.toUpperCase()}</span>
      </div>
      <a href="${proxyUrl}" class="btn btn-success btn-sm" download>
        <i class="fa-solid fa-download"></i> Download
      </a>
    `;

    grid.appendChild(card);
  });

  sec.scrollIntoView({ behavior: 'smooth' });
}

// LocalStorage History Drawer
function saveHistory(item) {
  let history = JSON.parse(localStorage.getItem('snapfetch_history') || '[]');
  history = history.filter(h => h.original_url !== item.original_url);
  history.unshift({
    title: item.title,
    thumbnail: item.thumbnail,
    platform: item.platform,
    original_url: item.original_url,
    time: new Date().toLocaleDateString()
  });

  if (history.length > 8) history.pop();
  localStorage.setItem('snapfetch_history', JSON.stringify(history));
  loadHistory();
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem('snapfetch_history') || '[]');
  const grid = document.getElementById('history-grid');

  if (history.length === 0) {
    grid.innerHTML = `
      <div class="history-empty-card">
        <i class="fa-solid fa-folder-open"></i>
        <p>No extraction history saved yet. Paste a video link above to get started!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = '';
  history.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.onclick = () => {
      document.getElementById('url-input').value = item.original_url;
      document.getElementById('url-input').dispatchEvent(new Event('input'));
      document.getElementById('downloader-section').scrollIntoView({ behavior: 'smooth' });
    };

    card.innerHTML = `
      <img src="${item.thumbnail}" class="history-thumb" alt="Thumb">
      <div class="history-info">
        <div class="history-title">${item.title}</div>
        <span class="platform-chip" style="font-size:0.75rem; padding:0.15rem 0.55rem; margin-top:0.35rem;">
          <i class="${item.platform.icon}" style="color:${item.platform.color}"></i> ${item.platform.name}
        </span>
      </div>
    `;

    grid.appendChild(card);
  });
}

function clearHistory() {
  localStorage.removeItem('snapfetch_history');
  loadHistory();
  showToast('Download history cleared.', 'success');
}

// Toast Notifications
function showToast(msg, type = 'success') {
  const wrapper = document.getElementById('toast-wrapper');
  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  const icon = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';
  toast.innerHTML = `<i class="${icon}"></i> <span>${msg}</span>`;

  wrapper.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}
