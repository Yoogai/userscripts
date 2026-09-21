// ==UserScript==
// @name         Ozon → Markdown + ZIP Exporter PRO
// @namespace    https://dwatawolfo.tools/ozon-exporter-pro
// @version      4.2.1
// @description  Экспорт карточки Ozon, отзывов и изображений в Markdown, JSON или ZIP.
// @match        *://www.ozon.ru/product/*
// @match        *://ozon.ru/product/*
// @match        *://m.ozon.ru/product/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      ir.ozone.ru
// @connect      *.ozone.ru
// @connect      ozon.ru
// @connect      www.ozon.ru
// ==/UserScript==

(() => {
  'use strict';

  const UI_ROOT_ID = 'ozmd-root-pro';
  const TOAST_ROOT_ID = 'ozmd-toast-root-pro';
  const SCRIPT_VERSION = '4.2.1';

  const DEFAULTS = {
    mode: 'full',
    reviewRangeMode: 'range',
    rangeFrom: 1,
    rangeTo: 100,
    reviewVariantMode: 'all',
    onlyWithPhotos: false,
    includeProductImages: true,
    includeReviewImages: true,
    maxReviewImages: 500,
    imageSize: 'wc1000'
  };


  const CONFIG = {
    DEBUG: true,
    FETCH_TIMEOUT_MS: 45000,
    ZIP_PROGRESS_THROTTLE_MS: 150,
    MAX_DEBUG_LINES: 1500,
    MAX_PRODUCT_IMAGES: 32,
    REVIEW_API_TIMEOUT_MS: 12000
  };

  const DEBUG_LOG = [];
  let lastZipProgressTs = 0;

  const state = {
    selectedReviewEl: null,
    pickMode: false,
    stopPick: null,
    statusEl: null,
    progressEl: null,
    progressBarEl: null,
    stopButton: null,
    lastActionBtn: null,
    reviewCache: [],
    running: false,
    stopRequested: false
  };

  const S = {
    get(key) {
      try { return GM_getValue(key, DEFAULTS[key]); }
      catch { return DEFAULTS[key]; }
    },
    set(key, value) {
      try { GM_setValue(key, value); }
      catch {}
    }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const norm = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const nowIso = () => new Date().toISOString();
  const ts = () => nowIso().replace(/[:.]/g, '-');

  function slug(value) {
    return norm(value)
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 72) || 'ozon';
  }

  function sanitizeFileName(name) {
    return String(name || 'file')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'file';
  }

  function escapeMd(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/([*_`[\]{}#+\-.!|])/g, '\\$1');
  }

  function escTable(value) {
    return norm(value).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
  }

  function uniqueBy(list, getKey) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const key = getKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  function absUrl(value) {
    if (!value) return '';
    try { return new URL(value, location.href).href; }
    catch { return String(value); }
  }

  function notify(title, text, type = 'info') {
    const root = ensureToastRoot();
    const toast = document.createElement('div');
    toast.className = `ozmd-toast ozmd-toast-${type}`;
    toast.innerHTML = `<strong>${title}</strong><span>${text}</span>`;
    root.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 20);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 220);
    }, 3600);

    try {
      if (typeof GM_notification === 'function' && type === 'error') {
        GM_notification({ title, text, timeout: 4000 });
      }
    } catch {}
  }

  function ensureToastRoot() {
    let root = document.getElementById(TOAST_ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = TOAST_ROOT_ID;
    document.body.appendChild(root);
    return root;
  }

  function setStatus(text, progress = null) {
    if (state.statusEl) state.statusEl.textContent = text;
    if (state.progressEl) {
      state.progressEl.hidden = progress == null;
      if (progress != null && state.progressBarEl) {
        const pct = Math.max(0, Math.min(100, Math.round(progress)));
        state.progressBarEl.style.width = `${pct}%`;
        state.progressEl.setAttribute('aria-valuenow', String(pct));
      }
    }
  }

  function setBusy(button, label = 'Выполняю…') {
    if (!button) return;
    if (!button.dataset.oldText) button.dataset.oldText = button.textContent;
    button.textContent = label;
    button.disabled = true;
    state.lastActionBtn = button;
  }

  function restoreBusy(button = state.lastActionBtn) {
    if (!button) return;
    if (button.dataset.oldText) {
      button.textContent = button.dataset.oldText;
      delete button.dataset.oldText;
    }
    button.disabled = false;
    state.lastActionBtn = null;
  }

  function waitForPaint() {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  function saveBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  async function copyToClipboard(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text);
        return true;
      }
    } catch {}

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  function downloadText(text, filename, mimeType = 'text/markdown;charset=utf-8') {
    saveBlob(filename, new Blob([text], { type: mimeType }));
  }

  function getProductJsonLd() {
    const queue = [];
    for (const script of qa('script[type="application/ld+json"]')) {
      try { queue.push(JSON.parse(script.textContent || '{}')); }
      catch {}
    }

    const seen = new Set();
    while (queue.length) {
      const value = queue.shift();
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
      if (types.some(type => String(type).toLowerCase() === 'product')) return value;
      if (Array.isArray(value)) queue.push(...value);
      else queue.push(...Object.values(value).filter(item => item && typeof item === 'object'));
    }
    return null;
  }

  function getProductTitle() {
    const jsonLd = getProductJsonLd();
    const rawTitle =
      norm(q('[data-widget="webProductHeading"] h1')?.innerText) ||
      norm(q('[data-widget*="ProductHeading"] h1')?.innerText) ||
      norm(q('h1')?.innerText) ||
      norm(jsonLd?.name) ||
      norm(document.title.replace(/\s*\|\s*.*$/g, ''));

    return rawTitle || 'Товар Ozon';
  }

  function getProductId() {
    const pathMatch = location.pathname.match(/\/(?:product|context\/detail)\/(?:[^/]*-)?(\d+)(?:\/|$)/i);
    if (pathMatch) return pathMatch[1];

    const jsonLd = getProductJsonLd();
    const jsonId = norm(jsonLd?.sku || jsonLd?.productID || jsonLd?.mpn);
    if (/^\d{6,}$/.test(jsonId)) return jsonId;
    const skuFromPage = document.documentElement.innerHTML.match(/"(?:sku|productId|id)"\s*:\s*"?(\d{6,})"?/i);
    return skuFromPage?.[1] || '';
  }

  function getProductReviewCount() {
    const jsonLd = getProductJsonLd();
    const aggregate = jsonLd?.aggregateRating || {};
    const fromJson = Number(aggregate.reviewCount || aggregate.ratingCount || 0);
    if (Number.isFinite(fromJson) && fromJson > 0) return fromJson;

    const text = norm(document.body?.innerText);
    const match = text.match(/(\d[\d\s\u00a0]*)\s+отзыв/i);
    return Number((match?.[1] || '').replace(/[\s\u00a0]/g, '')) || 0;
  }

  function getReviewRange() {
    if (S.get('reviewRangeMode') === 'auto') {
      const total = getProductReviewCount();
      return { from: 1, to: total || Number.MAX_SAFE_INTEGER, target: total || Math.max(1, Number(S.get('rangeTo')) || 100), automatic: true };
    }
    const from = Math.max(1, Number(S.get('rangeFrom')) || 1);
    const to = Math.max(from, Number(S.get('rangeTo')) || from);
    return { from, to, target: to, automatic: false };
  }

  function getCanonicalUrl() {
    return q('link[rel="canonical"]')?.href || location.href;
  }

  function getPriceText() {
    const roots = [
      q('[data-widget*="webPrice"]'),
      q('[data-widget*="price"]'),
      q('[data-widget*="webSale"]'),
      document
    ].filter(Boolean);

    const priceSelectors = [
      'span.tsHeadline600Large',
      '[class*="tsHeadline600Large"]',
      '[class*="price"] span',
      '[data-widget*="webPrice"] span'
    ];

    for (const root of roots) {
      for (const selector of priceSelectors) {
        const value = norm(q(selector, root)?.innerText);
        if (value && /₽|руб|\d/.test(value)) {
          const caption = norm(q('span.tsBody400Small, [class*="tsBody400Small"]', root)?.innerText);
          return caption && !value.includes(caption) ? `${value} (${caption})` : value;
        }
      }
    }
    const jsonLd = getProductJsonLd();
    const offer = Array.isArray(jsonLd?.offers) ? jsonLd.offers[0] : jsonLd?.offers;
    const jsonPrice = norm(offer?.price || offer?.lowPrice);
    if (jsonPrice) return `${jsonPrice} ${offer?.priceCurrency === 'RUB' ? '₽' : norm(offer?.priceCurrency)}`.trim();
    return '—';
  }

  function getDescriptionText() {
    const roots = [
      q('[data-widget="webDescription"]'),
      q('[data-widget*="webDescription"]'),
      q('[data-widget*="description"]'),
      q('[id*="description"]')
    ].filter(Boolean);

    for (const root of roots) {
      const clone = root.cloneNode(true);
      clone.querySelectorAll('script, style, button, svg').forEach(node => node.remove());
      const lines = qa('p, li, div', clone)
        .map(el => norm(el.innerText))
        .filter(text => text.length > 25)
        .filter((text, index, arr) => arr.indexOf(text) === index);
      const text = lines.join('\n');
      if (text.length > 40) return text;
    }
    return norm(getProductJsonLd()?.description);
  }

  function getSellerText() {
    const roots = [
      q('[data-widget*="webCurrentSeller"]'),
      q('[data-widget*="seller"]'),
      q('[data-widget*="Seller"]')
    ].filter(Boolean);

    for (const root of roots) {
      const text = norm(root.innerText);
      if (!text || !/продавец|магазин|ozon/i.test(text)) continue;
      const lines = text.split(/(?=Продавец|Магазин|Ozon)/i).map(norm).filter(Boolean);
      return lines[0] || text;
    }
    return '';
  }

  function getCharacteristicsRows() {
    const roots = [
      q('[data-widget="webCharacteristics"]'),
      q('[data-widget*="webCharacteristics"]'),
      q('[data-widget*="characteristics"]'),
      q('[data-widget*="Characteristics"]')
    ].filter(Boolean);

    const rows = [];
    const seen = new Set();

    for (const root of roots.length ? roots : [document]) {
      const dlRows = qa('dl', root)
        .map(dl => {
          const key = norm(q('dt', dl)?.innerText);
          const value = norm(q('dd', dl)?.innerText);
          return key && value ? [key, value] : null;
        })
        .filter(Boolean);

      for (const row of dlRows) {
        const key = row.join('\u0000');
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }

      const tableRows = qa('tr', root)
        .map(tr => {
          const cells = qa('th,td', tr).map(el => norm(el.innerText)).filter(Boolean);
          return cells.length >= 2 ? [cells[0], cells.slice(1).join(' ')] : null;
        })
        .filter(Boolean);

      for (const row of tableRows) {
        const key = row.join('\u0000');
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
    }

    if (!rows.length) {
      const widget = q('[data-widget="webCharacteristics"], [data-widget*="characteristics"], [data-widget*="Characteristics"]');
      const candidates = widget ? qa('div', widget) : [];
      for (const item of candidates) {
        const parts = qa('span, div', item).map(el => norm(el.innerText)).filter(Boolean);
        if (parts.length < 2) continue;
        const key = parts[0];
        const value = parts[1];
        if (key.length > 80 || value.length > 300 || key === value) continue;
        const uniqKey = `${key}\u0000${value}`;
        if (seen.has(uniqKey)) continue;
        seen.add(uniqKey);
        rows.push([key, value]);
      }
    }

    return rows;
  }

  function extractUrlsFromSrcset(srcset) {
    if (!srcset) return [];
    return String(srcset)
      .split(',')
      .map(part => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function normalizeOzonImageUrl(rawUrl, size = S.get('imageSize') || 'wc1000') {
    if (!rawUrl) return '';
    let url = absUrl(rawUrl).split('?')[0];
    if (!/ir\.ozone\.ru\/s3\//i.test(url)) return '';
    if (/\/video-|\/cover\//i.test(url)) return '';
    if (!/\/multimedia[-/]/i.test(url)) return '';

    url = url
      .replace(/\/(?:wc|w|c)\d+\//i, `/${size}/`)
      .replace(/\/(?:preview|small|medium|large)\//i, `/${size}/`);

    return url;
  }

  function imageKey(url) {
    try {
      const pathname = new URL(url).pathname;
      return pathname
        .replace(/\/(?:wc|w|c)\d+\//i, '/')
        .replace(/\/preview\//i, '/')
        .toLowerCase();
    } catch {
      return String(url || '').toLowerCase();
    }
  }

  function isReviewOrPromoImage(img) {
    if (!img) return true;
    const badRoot = img.closest([
      '[data-review-uuid]',
      '[data-widget*="review" i]',
      '[data-widget*="Review" i]',
      '[data-widget*="reviews" i]',
      '[data-widget*="similar" i]',
      '[data-widget*="Similar" i]',
      '[data-widget*="recommend" i]',
      '[data-widget*="Recommend" i]',
      '[data-widget*="also" i]',
      '[data-widget*="Related" i]'
    ].join(','));
    return !!badRoot;
  }

  function collectNormalizedImageUrls(root) {
    if (!root) return [];
    const urls = [];

    for (const img of qa('img', root)) {
      if (isReviewOrPromoImage(img)) continue;
      urls.push(img.currentSrc, img.src, img.getAttribute('src'), img.getAttribute('data-src'));
      for (const item of extractUrlsFromSrcset(img.getAttribute('srcset'))) urls.push(item);
    }

    return uniqueBy(
      urls.map(url => normalizeOzonImageUrl(url)).filter(Boolean),
      imageKey
    );
  }

  function findMainGalleryImage() {
    return (
      q('img[elementtiming*="webGallery"], img[data-lcp-name*="webGallery"]') ||
      q('img[alt*="#1"]') ||
      qa('img').find(img => {
        const url = img.currentSrc || img.src || img.getAttribute('src') || '';
        return /ir\.ozone\.ru\/s3\/multimedia-/i.test(url) && !isReviewOrPromoImage(img);
      }) ||
      null
    );
  }

  function findGalleryRoot() {
    const explicit =
      q('[data-widget*="webGallery"]') ||
      q('[data-widget*="WebGallery"]') ||
      q('[data-widget*="gallery"]') ||
      q('[data-widget*="Gallery"]');

    if (explicit) return explicit;

    const mainImage = findMainGalleryImage();
    if (!mainImage) return null;

    const explicitFromImage = mainImage.closest?.('[data-widget*="webGallery"], [data-widget*="WebGallery"], [data-widget*="gallery"], [data-widget*="Gallery"]');
    if (explicitFromImage) return explicitFromImage;

    let fallback = mainImage.parentElement || mainImage;
    let node = mainImage.parentElement;

    for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
      const urls = collectNormalizedImageUrls(node);
      const indexedUrls = uniqueBy(
        qa('[data-index] img', node)
          .flatMap(img => [
            img.currentSrc,
            img.src,
            img.getAttribute('src'),
            img.getAttribute('data-src'),
            ...extractUrlsFromSrcset(img.getAttribute('srcset'))
          ])
          .map(url => normalizeOzonImageUrl(url))
          .filter(Boolean),
        imageKey
      );

      if (urls.length > 1 || indexedUrls.length > 1) {
        const count = Math.max(urls.length, indexedUrls.length);
        if (count <= CONFIG.MAX_PRODUCT_IMAGES * 2) return node;
        return fallback;
      }

      fallback = node;
      if (node === document.body || node.matches?.('main')) break;
    }

    return fallback;
  }

  function collectProductImages() {
    const candidates = [];
    const push = (url, source = 'dom') => {
      const normalized = normalizeOzonImageUrl(url);
      if (!normalized) return;
      candidates.push({ url: normalized, source });
    };

    push(q('meta[property="og:image"]')?.content, 'og:image');

    const galleryRoot = findGalleryRoot();
    if (galleryRoot) {
      for (const img of qa('img', galleryRoot)) {
        if (isReviewOrPromoImage(img)) continue;
        push(img.currentSrc, 'gallery:currentSrc');
        push(img.src, 'gallery:src');
        push(img.getAttribute('src'), 'gallery:attr-src');
        push(img.getAttribute('data-src'), 'gallery:data-src');
        for (const url of extractUrlsFromSrcset(img.getAttribute('srcset'))) push(url, 'gallery:srcset');
      }

      const html = galleryRoot.outerHTML || '';
      const regex = /https?:\\?\/\\?\/ir\.ozone\.ru\\?\/s3\\?\/multimedia-[^"'\\\s<>]+?\.(?:jpg|jpeg|png|webp)/gi;
      const matches = html.match(regex) || [];
      for (const raw of matches) push(raw.replaceAll('\\/', '/'), 'gallery:html');
    }

    for (const img of qa('img[elementtiming*="webGallery"], img[data-lcp-name*="webGallery"], img[alt*="#"]')) {
      if (isReviewOrPromoImage(img)) continue;
      push(img.currentSrc || img.src || img.getAttribute('src'), 'gallery:main');
      for (const url of extractUrlsFromSrcset(img.getAttribute('srcset'))) push(url, 'gallery:main-srcset');
    }

    const images = uniqueBy(candidates, item => imageKey(item.url))
      .slice(0, CONFIG.MAX_PRODUCT_IMAGES)
      .map((item, index) => ({
        index: index + 1,
        url: item.url,
        source: item.source
      }));

    dbg('images:collected', { count: images.length, urls: images.map(item => item.url) });
    return images;
  }

  function collectProductData() {
    const jsonLd = getProductJsonLd() || {};
    const aggregateRating = jsonLd.aggregateRating || {};
    const jsonImages = (Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image])
      .map(url => normalizeOzonImageUrl(url))
      .filter(Boolean)
      .map((url, index) => ({ url, index: index + 1, source: 'json-ld', candidates: [url] }));
    const images = collectProductImages();
    return {
      platform: 'Ozon',
      title: getProductTitle(),
      productId: getProductId(),
      url: getCanonicalUrl(),
      price: getPriceText(),
      brand: norm(typeof jsonLd.brand === 'object' ? jsonLd.brand?.name : jsonLd.brand),
      rating: norm(aggregateRating.ratingValue),
      reviewsCount: Number(aggregateRating.reviewCount || aggregateRating.ratingCount || 0) || 0,
      seller: getSellerText() || norm(jsonLd.offers?.seller?.name),
      description: getDescriptionText(),
      characteristics: getCharacteristicsRows().map(([key, value]) => ({ key, value })),
      images: images.length ? images : jsonImages,
      exportedAt: nowIso(),
      exporterVersion: SCRIPT_VERSION
    };
  }

  function makeImageFileName(image, usedNames) {
    let ext = 'jpg';
    try {
      const pathname = new URL(image.url).pathname;
      const found = pathname.match(/\.([a-z0-9]{2,6})$/i)?.[1]?.toLowerCase();
      if (found) ext = found === 'jpeg' ? 'jpg' : found;
    } catch {}

    let name = `image_${String(image.index).padStart(2, '0')}.${ext}`;
    let counter = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `image_${String(image.index).padStart(2, '0')}_${counter}.${ext}`;
      counter += 1;
    }
    usedNames.add(name.toLowerCase());
    return name;
  }

  function productToMarkdown(product, options = {}) {
    const localImages = options.localImages || null;
    const lines = [];

    lines.push(`# ${product.title}`);
    lines.push('');
    lines.push(`- URL: ${product.url}`);
    if (product.productId) lines.push(`- ID товара: ${product.productId}`);
    lines.push(`- Цена: ${product.price || '—'}`);
    if (product.brand) lines.push(`- Бренд: ${product.brand}`);
    if (product.rating) lines.push(`- Рейтинг: ${product.rating}`);
    if (product.reviewsCount) lines.push(`- Отзывов: ${product.reviewsCount}`);
    if (product.seller) lines.push(`- Продавец: ${product.seller}`);
    lines.push(`- Собрано: ${product.exportedAt || nowIso()}`);
    lines.push('');

    if (product.images?.length) {
      lines.push('## Изображения карточки');
      lines.push('');
      product.images.forEach((image, index) => {
        const local = localImages?.[image.url];
        if (local) lines.push(`![Фото ${index + 1}](images/${encodeURIComponent(local).replace(/%2F/g, '/')})`);
        else lines.push(`![Фото ${index + 1}](${encodeURI(image.url).replace(/#/g, '%23')})`);
      });
      lines.push('');
    }

    if (product.description) {
      lines.push('## Описание');
      lines.push('');
      lines.push(product.description);
      lines.push('');
    }

    lines.push('## Характеристики');
    lines.push('');

    if (product.characteristics?.length) {
      lines.push('| Параметр | Значение |');
      lines.push('|---|---|');
      product.characteristics.forEach(row => {
        lines.push(`| ${escTable(row.key)} | ${escTable(row.value)} |`);
      });
    } else {
      lines.push('—');
    }

    lines.push('');
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function getAllReviewNodes() {
    return qa('[data-review-uuid]');
  }

  function reviewCacheKey(review) {
    return review.reviewUuid || [review.author, review.publishedISO, review.dateText, review.text].map(norm).join('\u0000');
  }

  function hasUsefulReviewText(review) {
    const text = norm(review?.text);
    if (text.length < 8) return !!review?.rating || !!review?.images?.length;
    if (/^[\d\s.,/\\:;!?\-–—★☆]+$/.test(text)) return false;
    if (/^(достоинства|недостатки|комментарий|оценка|рейтинг|звёзд|звезд)\s*:?$/i.test(text)) return false;
    if (/^(показать полностью|читать полностью|ответить|пожаловаться|полезный отзыв)$/i.test(text)) return false;
    return /[a-zа-яё]/i.test(text);
  }

  function addReviewsToCache(reviews, source = 'reviews') {
    const before = state.reviewCache.length;
    const usefulReviews = reviews.filter(hasUsefulReviewText);
    state.reviewCache = uniqueBy([...state.reviewCache, ...usefulReviews], reviewCacheKey);
    const after = state.reviewCache.length;
    dbg('reviews:cache', {
      source,
      incoming: reviews.length,
      skippedEmpty: reviews.length - usefulReviews.length,
      added: after - before,
      total: after,
      domReviews: getAllReviewNodes().length
    });
    return state.reviewCache;
  }

  function findReviewFromSelection() {
    const sel = window.getSelection?.();
    const node = sel?.anchorNode
      ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)
      : null;
    return node?.closest?.('[data-review-uuid]') || null;
  }

  function countStars(reviewEl) {
    const aria = norm(reviewEl.getAttribute('aria-label'));
    const ariaMatch = aria.match(/(\d+(?:[.,]\d+)?)\s*(?:из|\/|\\)\s*5/);
    if (ariaMatch) return ariaMatch[1].replace(',', '.');

    const explicitStars = qa('[aria-label*="зв"], [title*="зв"]', reviewEl)
      .map(el => norm(el.getAttribute('aria-label') || el.getAttribute('title')))
      .join(' ')
      .match(/(\d+(?:[.,]\d+)?)\s*(?:из|\/|\\)\s*5/);
    if (explicitStars) return explicitStars[1].replace(',', '.');

    const activeStars = qa('svg path[d^="M9.358 6.136"], svg path[d*="9.358 6.136"]', reviewEl);
    return activeStars.length || '';
  }

  function expandReviewTextIfPossible(reviewEl) {
    for (const el of qa('button, a, span, div', reviewEl)) {
      const text = norm(el.innerText);
      if (!text) continue;
      if (/показать полностью|читать полностью|развернуть|ещё|еще/i.test(text)) {
        if (/ответить|пожаловаться|сообщить|продавец|магазин/i.test(text)) continue;
        try { el.click(); } catch {}
      }
    }
  }

  function isHidden(el) {
    if (!el) return true;
    const style = window.getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden';
  }

  function isReviewTextCandidate(el, reviewEl) {
    if (!el || el === reviewEl) return false;
    if (isHidden(el)) return false;
    if (q('[data-review-uuid]', el)) return false;

    const tag = el.tagName?.toLowerCase() || '';
    if (['button', 'input', 'textarea', 'select', 'svg', 'path', 'img', 'video', 'picture'].includes(tag)) return false;

    const text = norm(el.innerText);
    if (!text || text.length < 8) return false;
    if (/^\d+(?:[.,]\d+)?$/.test(text)) return false;
    if (/^(да|нет)$/i.test(text)) return false;
    if (/^(ответить|пожаловаться|сообщить|полезный отзыв|с фото|сначала полезные|по дате)$/i.test(text)) return false;
    if (/^достоинства:?$/i.test(text) || /^недостатки:?$/i.test(text) || /^комментарий:?$/i.test(text)) return false;

    const cls = [el.className, el.getAttribute('data-widget'), el.getAttribute('itemprop')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return !/avatar|author|name|header|footer|rating|stars|button|toolbar|controls|image|photo|gallery/.test(cls);
  }

  function collectReviewText(reviewEl) {
    const preferred = [
      '[itemprop="reviewBody"]',
      '[data-widget*="webReview"] [class*="review"] [class*="text"]',
      '[class*="review"] [class*="body"]',
      '[class*="review"] [class*="text"]',
      '[class*="comment"]',
      'p',
      'span',
      'div'
    ];

    const chunks = [];
    const seen = new Set();

    for (const selector of preferred) {
      for (const el of qa(selector, reviewEl)) {
        if (!isReviewTextCandidate(el, reviewEl)) continue;
        const text = norm(el.innerText);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        chunks.push(text);
      }
      if (chunks.some(text => text.length > 30)) break;
    }

    if (!chunks.length) {
      const tree = document.createTreeWalker(reviewEl, NodeFilter.SHOW_ELEMENT);
      let node;
      while ((node = tree.nextNode())) {
        if (!isReviewTextCandidate(node, reviewEl)) continue;
        const text = norm(node.innerText);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        chunks.push(text);
      }
    }

    return norm(chunks.filter(text => !/^(достоинства|недостатки|комментарий)\s*:?$/i.test(text)).join('\n'));
  }

  function collectReviewImages(reviewEl) {
    const images = [];
    for (const img of qa('img', reviewEl)) {
      const context = norm([
        img.alt,
        img.getAttribute('aria-label'),
        img.className,
        img.parentElement?.className
      ].join(' ')).toLowerCase();
      if (/аватар|avatar|профил|profile|logo|икон/.test(context)) continue;

      const raw = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.currentSrc || img.src;
      if (!raw || !/ozone\.ru|ozonusercontent\.com/i.test(raw)) continue;
      const url = normalizeOzonImageUrl(raw) || absUrl(raw).split('?')[0];
      if (url) images.push({ url, source: 'review:dom' });
    }
    return uniqueBy(images, image => imageKey(image.url));
  }

  function extractReview(reviewEl) {
    expandReviewTextIfPossible(reviewEl);

    const reviewUuid = reviewEl.getAttribute('data-review-uuid') || '';
    const publishedAtSec = parseInt(reviewEl.getAttribute('publishedat') || '', 10);
    const publishedISO = Number.isFinite(publishedAtSec)
      ? new Date(publishedAtSec * 1000).toISOString().slice(0, 10)
      : '';

    const author =
      norm(q('.tsCompactControl500Medium', reviewEl)?.innerText) ||
      norm(q('[class*="tsCompactControl500Medium"]', reviewEl)?.innerText) ||
      norm(q('[class*="author"]', reviewEl)?.innerText);

    const dateText =
      norm(q('time', reviewEl)?.innerText) ||
      norm(q('[datetime]', reviewEl)?.getAttribute('datetime')) ||
      norm(q('[class*="uk7_"], [class*="date"]', reviewEl)?.innerText);

    return {
      reviewUuid,
      publishedISO,
      dateText,
      author,
      rating: countStars(reviewEl),
      text: collectReviewText(reviewEl),
      images: collectReviewImages(reviewEl)
    };
  }

  function findFirstDeep(value, keys) {
    if (!value || typeof value !== 'object') return '';
    const queue = [value];
    const seen = new Set();

    while (queue.length) {
      const item = queue.shift();
      if (!item || typeof item !== 'object' || seen.has(item)) continue;
      seen.add(item);

      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          const found = item[key];
          if (found != null && typeof found !== 'object') return norm(found);
        }
      }

      for (const child of Object.values(item)) {
        if (child && typeof child === 'object') queue.push(child);
      }
    }

    return '';
  }

  function parseApiDate(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'number') {
      const ms = value > 100000000000 ? value : value * 1000;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
    }

    const text = norm(value);
    if (!text) return '';

    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 100000) return parseApiDate(numeric);

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
  }

  function collectApiReviewImages(raw) {
    const images = [];
    const seen = new Set();

    const walk = (value, path = '') => {
      if (value == null || seen.has(value)) return;
      if (typeof value === 'string') {
        if (/avatar|author|user|logo|icon|product|sku|seller|brand/i.test(path)) return;
        if (!/(?:image|photo|media|picture|content)/i.test(path)) return;
        if (!/^https?:\/\//i.test(value) || !/ozone\.ru|ozonusercontent\.com/i.test(value)) return;
        const url = normalizeOzonImageUrl(value) || absUrl(value).split('?')[0];
        if (url) images.push({ url, source: `review:api:${path}` });
        return;
      }
      if (typeof value !== 'object') return;
      seen.add(value);
      if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
      else Object.entries(value).forEach(([key, item]) => walk(item, path ? `${path}.${key}` : key));
    };

    walk(raw);
    return uniqueBy(images, image => imageKey(image.url));
  }

  function normalizeApiReview(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const reviewUuid = findFirstDeep(raw, ['reviewUuid', 'uuid', 'reviewId']);
    const author = findFirstDeep(raw, ['authorName', 'userName', 'displayName', 'nickname']);
    const rating = findFirstDeep(raw, ['rating', 'score', 'stars', 'grade']);
    const sku = findFirstDeep(raw, ['skuId', 'sku', 'productSku', 'offerId']);
    const publishedRaw = findFirstDeep(raw, ['publishedAt', 'published_at', 'createdAt', 'created_at', 'date']);
    const textParts = [
      findFirstDeep(raw, ['text', 'reviewText', 'comment', 'commentText']),
      findFirstDeep(raw, ['advantages', 'pros', 'positive', 'dignity']),
      findFirstDeep(raw, ['disadvantages', 'cons', 'negative', 'limitations'])
    ].filter(Boolean);

    const text = uniqueBy(textParts, item => item).join('\n');
    const images = collectApiReviewImages(raw);
    if ((!text || text.length < 8) && !rating && !images.length) return null;
    if (!reviewUuid && !author && !rating) return null;
    if (/^(показать полностью|ответить|пожаловаться|полезный отзыв)$/i.test(text)) return null;

    return {
      reviewUuid,
      publishedISO: parseApiDate(publishedRaw),
      dateText: parseApiDate(publishedRaw),
      author,
      rating,
      sku,
      text,
      images
    };
  }

  function looksLikeApiReviewObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).join(' ');
    const hasReviewSignal = /reviewUuid|reviewId|publishedAt|reviewText|commentText|advantages|disadvantages/i.test(keys);
    const hasTextSignal = /text|reviewText|comment|commentText|advantages|disadvantages|pros|cons/i.test(keys);
    return hasReviewSignal && hasTextSignal;
  }

  function collectApiReviewsFromValue(value, out = [], seen = new Set()) {
    if (value == null) return out;

    if (typeof value === 'string') {
      const text = value.trim();
      if (!text || !/^\s*[\[{]/.test(text)) return out;
      try {
        collectApiReviewsFromValue(JSON.parse(text), out, seen);
      } catch {}
      return out;
    }

    if (typeof value !== 'object' || seen.has(value)) return out;
    seen.add(value);

    if (looksLikeApiReviewObject(value)) {
      const review = normalizeApiReview(value);
      if (review) out.push(review);
    }

    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      collectApiReviewsFromValue(child, out, seen);
    }

    return out;
  }

  function getReviewApiStartPath() {
    const productId = getProductId();
    if (!productId) throw new Error('Не удалось определить артикул товара Ozon.');
    const params = new URLSearchParams({
      oos_search: 'false',
      reviewsVariantMode: S.get('reviewVariantMode') === 'selected' ? '1' : '2'
    });
    return `/product/${productId}/reviews/pdp-part?${params}`;
  }

  function getReviewApiUrl(pagePath) {
    return new URL(`/api/entrypoint-api.bx/page/json/v2?url=${encodeURIComponent(pagePath)}`, location.origin).href;
  }

  function findReviewPageMeta(value, meta = {}, seen = new Set()) {
    if (value == null || seen.has(value)) return meta;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!/^[{[]/.test(text)) return meta;
      try { return findReviewPageMeta(JSON.parse(text), meta, seen); } catch { return meta; }
    }
    if (typeof value !== 'object') return meta;
    seen.add(value);

    const paging = value.paging;
    if (paging && typeof paging === 'object' && Number.isFinite(Number(paging.total)) && Number.isFinite(Number(paging.commonTotal)) && Number.isFinite(Number(paging.perPage))) {
      meta.total = Number(paging.total);
      meta.page = Number(paging.page) || meta.page || 1;
      meta.perPage = Number(paging.perPage);
    }
    if (typeof value.nextPage === 'string' && /\/reviews\/pdp-part\?/i.test(value.nextPage)) meta.nextPage = norm(value.nextPage);
    if (meta.total && meta.nextPage) return meta;

    for (const child of Object.values(value)) {
      findReviewPageMeta(child, meta, seen);
      if (meta.total && meta.nextPage) break;
    }
    return meta;
  }

  async function fetchReviewApiPage(pagePath) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.REVIEW_API_TIMEOUT_MS);
    const url = getReviewApiUrl(pagePath);
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`API вернул HTTP ${response.status}`);
      const json = await response.json();
      const reviews = uniqueBy(collectApiReviewsFromValue(json), reviewCacheKey);
      const meta = findReviewPageMeta(json);
      dbg('reviews:api-page', { url, reviews: reviews.length, ...meta });
      return { reviews, ...meta };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadReviewsViaApi(targetCount) {
    let pagePath = getReviewApiStartPath();
    let page = 0;
    let available = 0;
    let pagesTotal = Number.MAX_SAFE_INTEGER;

    while (pagePath && page < pagesTotal && state.reviewCache.length < targetCount) {
      if (state.stopRequested) throw new Error('Операция остановлена.');
      page += 1;
      const visibleCount = available ? Math.min(state.reviewCache.length, available) : state.reviewCache.length;
      setStatus(`Загружаю отзывы через API: ${visibleCount}${available ? `/${available}` : ''}, стр. ${page}`);
      const result = await fetchReviewApiPage(pagePath);
      available = result.total || available;
      if (available && result.perPage) pagesTotal = Math.ceil(available / result.perPage);
      addReviewsToCache(result.reviews, `api-page-${page}`);
      if (available && state.reviewCache.length > available) {
        dbg('reviews:cache-trim', { before: state.reviewCache.length, available, page });
        state.reviewCache = state.reviewCache.slice(0, available);
      }
      pagePath = result.nextPage || '';
    }

    dbg('reviews:api:done', { total: state.reviewCache.length, available, pages: page, targetCount });
    return { reviews: state.reviewCache, total: available || state.reviewCache.length };
  }

  function reviewToMarkdown(review, index, options = {}) {
    const localImages = options.localImages || {};
    const lines = [
      `### Отзыв ${index}${review.reviewUuid ? ` (${review.reviewUuid})` : ''}`,
      '',
      `- Автор: ${review.author || '—'}`,
      `- Дата на странице: ${review.dateText || '—'}`,
      `- Дата ISO: ${review.publishedISO || '—'}`,
      `- Оценка: ${review.rating || '—'}`
    ];

    lines.push('', review.text ? `> ${review.text.replace(/\n+/g, '\n> ')}` : '—');
    if (review.images?.length) {
      lines.push('', '**Фотографии:**', '');
      review.images.forEach((image, imageIndex) => {
        const target = localImages[image.url] || image.url;
        lines.push(`![Фото отзыва ${imageIndex + 1}](${encodeURI(target).replace(/#/g, '%23')})`);
      });
    }

    return `${lines.join('\n')}\n`;
  }

  function reviewsToMarkdown(reviews, options = {}) {
    const from = Math.max(1, parseInt(options.rangeFrom, 10) || 1);
    const to = Math.max(from, parseInt(options.rangeTo, 10) || from);
    const sliced = reviews.slice(from - 1, to);

    const lines = [
      '# Отзывы Ozon',
      '',
      `- Товар: ${getProductTitle()}`,
      `- URL: ${getCanonicalUrl()}`,
      `- Всего отзывов собрано: ${reviews.length}`,
      `- Диапазон: ${options.automatic ? 'автоматически: все доступные' : `${from}–${Math.min(to, Math.max(reviews.length, from - 1))}`}`,
      `- Собрано: ${nowIso()}`,
      '',
      '## Отзывы',
      ''
    ];

    if (!sliced.length) {
      lines.push('—');
    } else {
      sliced.forEach((review, idx) => {
        lines.push(reviewToMarkdown(review, from + idx, options));
      });
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  async function collectReviewsForCurrentMode() {
    const mode = S.get('mode');

    if (mode !== 'reviews' && mode !== 'full') return [];

    const range = getReviewRange();
    const target = range.target;
    const loadTarget = range.automatic ? Number.MAX_SAFE_INTEGER : (S.get('onlyWithPhotos') ? Math.min(target * 4, target + 300) : target);
    state.reviewCache = [];
    dbg('reviews:collect:start', { mode, target, loadTarget, onlyWithPhotos: !!S.get('onlyWithPhotos') });
    const api = await loadReviewsViaApi(loadTarget);
    const finalCandidates = api.reviews;
    let reviews = uniqueBy(finalCandidates.filter(hasUsefulReviewText), reviewCacheKey);
    if (S.get('onlyWithPhotos')) reviews = reviews.filter(review => review.images?.length);
    const expected = range.automatic && S.get('onlyWithPhotos') ? reviews.length : (range.automatic ? api.total : target);
    dbg('reviews:collect:done', {
      total: reviews.length,
      target: expected,
      automatic: range.automatic,
      enough: reviews.length >= expected,
      skippedEmpty: finalCandidates.length - reviews.length
    });
    setStatus(
      reviews.length >= expected
        ? `Отзывы собраны: ${reviews.length}/${expected}`
        : `Отзывы собраны не полностью: ${reviews.length}/${expected}`,
      reviews.length >= expected ? 100 : null
    );
    return reviews;
  }

  async function buildMarkdown(mode = S.get('mode')) {
    const product = collectProductData();
    const reviews = await collectReviewsForCurrentMode();
    const { from, to, automatic } = getReviewRange();

    if (mode === 'product') return productToMarkdown(product);
    if (mode === 'reviews') return reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, automatic });

    return [
      productToMarkdown(product).trim(),
      '',
      reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, automatic }).trim()
    ].join('\n\n') + '\n';
  }

  function makeBaseName(mode = S.get('mode')) {
    const id = getProductId();
    const productTag = id || slug(getProductTitle());
    return sanitizeFileName(`ozon_${mode}_${productTag}_${ts()}`);
  }

  function stringifyLogArg(arg) {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack || arg.message || String(arg);
    try { return JSON.stringify(arg); }
    catch { return String(arg); }
  }

  function pushDebugLine(prefix, args) {
    if (!CONFIG.DEBUG) return;
    const line = `[${new Date().toISOString()}] ${prefix} ${Array.from(args).map(stringifyLogArg).join(' ')}`;
    DEBUG_LOG.push(line);
    if (DEBUG_LOG.length > CONFIG.MAX_DEBUG_LINES) DEBUG_LOG.shift();
  }

  function dbg() {
    pushDebugLine('INFO', arguments);
    if (CONFIG.DEBUG) console.log('[Ozon Exporter]', ...arguments);
  }

  function dbgErr() {
    pushDebugLine('ERROR', arguments);
    if (CONFIG.DEBUG) console.error('[Ozon Exporter]', ...arguments);
  }

  function showDebugLogOverlay() {
    const oldOverlay = document.querySelector('.ozmd-log-overlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ozmd-log-overlay';

    const modal = document.createElement('div');
    modal.className = 'ozmd-log-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Журнал Ozon Exporter');

    const head = document.createElement('div');
    head.className = 'ozmd-log-head';

    const title = document.createElement('h3');
    title.textContent = 'Журнал Ozon Exporter';

    const actions = document.createElement('div');
    actions.className = 'ozmd-log-actions';

    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'ozmd-log-btn';
    refresh.textContent = 'Обновить';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ozmd-log-btn';
    close.textContent = 'Закрыть';

    const body = document.createElement('pre');
    body.className = 'ozmd-log-body';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ozmd-log-btn';
    copy.textContent = 'Копировать';

    function renderLog() {
      body.textContent = DEBUG_LOG.length
        ? DEBUG_LOG.join('\n')
        : 'Журнал пока пуст. Если DEBUG выключен, включите CONFIG.DEBUG.';
      body.scrollTop = body.scrollHeight;
    }

    function closeOverlay() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }

    function onKey(event) {
      if (event.key === 'Escape') closeOverlay();
    }

    refresh.addEventListener('click', renderLog);
    copy.addEventListener('click', async () => {
      renderLog();
      const ok = await copyToClipboard(body.textContent);
      copy.textContent = ok ? 'Скопировано' : 'Не скопировано';
      setTimeout(() => { copy.textContent = 'Копировать'; }, 1200);
    });
    close.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeOverlay();
    });
    document.addEventListener('keydown', onKey);

    actions.appendChild(copy);
    actions.appendChild(refresh);
    actions.appendChild(close);
    head.appendChild(title);
    head.appendChild(actions);
    modal.appendChild(head);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    renderLog();
  }

  function parseHeaderValue(headers, name) {
    const re = new RegExp(`^${name}:\\s*([^\\n\\r]+)`, 'im');
    return String(headers || '').match(re)?.[1]?.trim() || '';
  }

  async function fetchBinary(url) {
    dbg('fetchBinary:start', { url });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (/text\/html|application\/json/i.test(contentType)) {
        throw new Error(`unexpected content-type: ${contentType || 'unknown'}`);
      }

      const buffer = new Uint8Array(await response.arrayBuffer());
      if (!buffer.byteLength) {
        throw new Error('empty response');
      }

      dbg('fetchBinary:done', {
        url,
        finalUrl: response.url || url,
        bytes: buffer.byteLength,
        contentType
      });

      return { buffer, contentType, finalUrl: response.url || url, usedUrl: url };
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('fetch timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function gmRequestBinary(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest unavailable'));
        return;
      }

      dbg('gmRequestBinary:start', { url });

      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout: CONFIG.FETCH_TIMEOUT_MS,
        anonymous: true,
        onload(response) {
          try {
            if (response.status < 200 || response.status >= 300) {
              throw new Error(`HTTP ${response.status}`);
            }

            const contentType = parseHeaderValue(response.responseHeaders, 'content-type');
            if (/text\/html|application\/json/i.test(contentType)) {
              throw new Error(`unexpected content-type: ${contentType || 'unknown'}`);
            }

            const raw = response.response;
            const source = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
            const buffer = new Uint8Array(source.byteLength);
            buffer.set(source);
            if (!buffer.byteLength) {
              throw new Error('empty response');
            }

            dbg('gmRequestBinary:done', {
              url,
              finalUrl: response.finalUrl || url,
              bytes: buffer.byteLength,
              contentType
            });

            resolve({ buffer, contentType, finalUrl: response.finalUrl || url, usedUrl: url });
          } catch (error) {
            reject(error);
          }
        },
        ontimeout() { reject(new Error('fetch timeout')); },
        onerror() { reject(new Error('network error')); },
        onabort() { reject(new Error('request aborted')); }
      });
    });
  }

  async function fetchImageBinary(image) {
    const candidates = uniqueBy([
      image.url,
      image.originalUrl,
      normalizeOzonImageUrl(image.url)
    ].filter(Boolean), value => value);

    let lastError = null;

    for (const candidate of candidates) {
      try {
        return await fetchBinary(candidate);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        dbgErr('image:fetch-failed', { url: candidate, error: lastError.message });
      }

      try {
        return await gmRequestBinary(candidate);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        dbgErr('image:gm-failed', { url: candidate, error: lastError.message });
      }
    }

    throw lastError || new Error('Не удалось скачать изображение');
  }

  function guessExtFromUrl(url) {
    try {
      const pathname = new URL(url, location.href).pathname;
      const match = pathname.match(/\.([a-z0-9]{2,6})$/i);
      if (!match) return '';
      const ext = match[1].toLowerCase();
      if (ext === 'jpeg') return 'jpg';
      if (['jpg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return ext;
      return ext;
    } catch {
      return '';
    }
  }

  function extFromContentType(contentType) {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('image/jpeg')) return 'jpg';
    if (ct.includes('image/png')) return 'png';
    if (ct.includes('image/gif')) return 'gif';
    if (ct.includes('image/webp')) return 'webp';
    if (ct.includes('image/svg+xml')) return 'svg';
    if (ct.includes('image/bmp')) return 'bmp';
    if (ct.includes('image/avif')) return 'avif';
    return 'bin';
  }

  function ensureExtension(fileName, contentType, sourceUrl = '') {
    if (/\.[a-z0-9]{2,6}$/i.test(fileName)) return fileName;
    const extFromUrl = guessExtFromUrl(sourceUrl);
    if (extFromUrl) return `${fileName}.${extFromUrl}`;
    return `${fileName}.${extFromContentType(contentType)}`;
  }

  function makeCrc32Table() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  }

  const CRC32_TABLE = makeCrc32Table();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosTime, dosDate };
  }

  function writeUint16(out, value) {
    out.push(value & 0xFF, (value >>> 8) & 0xFF);
  }

  function writeUint32(out, value) {
    out.push(value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF);
  }

  function appendBytes(out, bytes) {
    for (let i = 0; i < bytes.length; i++) out.push(bytes[i]);
  }

  function zipEntryBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return new TextEncoder().encode(String(value));
  }

  function buildStoreZip(entries, onProgress) {
    const out = [];
    const central = [];
    const encoder = new TextEncoder();
    const { dosTime, dosDate } = dosDateTime();
    let offset = 0;

    entries.forEach((entry, index) => {
      const nameBytes = encoder.encode(entry.name);
      const data = zipEntryBytes(entry.data);
      const checksum = crc32(data);
      const localOffset = offset;

      writeUint32(out, 0x04034B50);
      writeUint16(out, 20);
      writeUint16(out, 0x0800);
      writeUint16(out, 0);
      writeUint16(out, dosTime);
      writeUint16(out, dosDate);
      writeUint32(out, checksum);
      writeUint32(out, data.length);
      writeUint32(out, data.length);
      writeUint16(out, nameBytes.length);
      writeUint16(out, 0);
      appendBytes(out, nameBytes);
      appendBytes(out, data);
      offset += 30 + nameBytes.length + data.length;

      writeUint32(central, 0x02014B50);
      writeUint16(central, 20);
      writeUint16(central, 20);
      writeUint16(central, 0x0800);
      writeUint16(central, 0);
      writeUint16(central, dosTime);
      writeUint16(central, dosDate);
      writeUint32(central, checksum);
      writeUint32(central, data.length);
      writeUint32(central, data.length);
      writeUint16(central, nameBytes.length);
      writeUint16(central, 0);
      writeUint16(central, 0);
      writeUint16(central, 0);
      writeUint16(central, 0);
      writeUint32(central, 0);
      writeUint32(central, localOffset);
      appendBytes(central, nameBytes);

      onProgress?.({
        percent: ((index + 1) / Math.max(1, entries.length)) * 100,
        currentFile: entry.name
      });
    });

    const centralOffset = offset;
    const centralSize = central.length;
    out.push(...central);

    writeUint32(out, 0x06054B50);
    writeUint16(out, 0);
    writeUint16(out, 0);
    writeUint16(out, entries.length);
    writeUint16(out, entries.length);
    writeUint32(out, centralSize);
    writeUint32(out, centralOffset);
    writeUint16(out, 0);

    return new Blob([new Uint8Array(out)], { type: 'application/zip' });
  }

  function updateZipProgress(button, meta) {
    const now = Date.now();
    if (now - lastZipProgressTs < CONFIG.ZIP_PROGRESS_THROTTLE_MS && (meta.percent || 0) < 100) return;
    lastZipProgressTs = now;

    const percent = Math.max(0, Math.min(100, Math.round(meta.percent || 0)));
    setBusy(button, percent < 100 ? `ZIP ${percent}%` : 'Сохранение');
    setStatus(percent < 100 ? `Упаковываю ZIP… ${percent}%` : 'Сохраняю ZIP…', 78 + Math.round(percent * 0.2));
  }

  async function exportZip(button) {
    const mode = S.get('mode');
    const includeImages = S.get('includeProductImages');
    const { from, to, automatic } = getReviewRange();

    setBusy(button, 'ZIP…');
    setStatus('Собираю данные…', 4);
    await waitForPaint();

    dbg('zip:start', { mode, includeImages, from, to });

    const product = collectProductData();
    const reviews = await collectReviewsForCurrentMode();
    const zipEntries = [];
    const warnings = [];
    const usedNames = new Set();
    const localImages = {};
    const localReviewImages = {};
    const imagesMeta = [];

    if (includeImages && product.images.length) {
      for (let i = 0; i < product.images.length; i++) {
        if (state.stopRequested) throw new Error('Операция остановлена.');
        const image = product.images[i];
        const baseFileName = makeImageFileName({ ...image, url: '' }, usedNames).replace(/\.[^.]+$/i, '');

        setBusy(button, `${i + 1}/${product.images.length}`);
        setStatus(`Скачиваю изображения: ${i + 1}/${product.images.length}`, 8 + (i / product.images.length) * 62);
        await waitForPaint();

        try {
          const { buffer, contentType, finalUrl, usedUrl } = await fetchImageBinary(image);
          const localName = ensureExtension(baseFileName, contentType, usedUrl || finalUrl || image.url);

          localImages[image.url] = localName;
          imagesMeta.push({
            ...image,
            localName,
            contentType,
            finalUrl,
            downloadUrl: usedUrl || finalUrl || image.url,
            bytes: buffer.byteLength
          });

          dbg('image:add-to-zip', {
            index: image.index,
            file: localName,
            bytes: buffer.byteLength,
            sourceType: Object.prototype.toString.call(buffer)
          });

          zipEntries.push({ name: `images/${localName}`, data: buffer });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push({
            index: image.index,
            url: image.url,
            source: image.source || '',
            error: message
          });
          dbgErr('image:failed', { index: image.index, url: image.url, error: message });
        }
      }
    }

    if (S.get('includeReviewImages') && mode !== 'product') {
      const reviewFrom = Math.max(1, parseInt(from, 10) || 1);
      const reviewTo = Math.max(reviewFrom, parseInt(to, 10) || reviewFrom);
      const maxReviewImages = Math.max(0, parseInt(S.get('maxReviewImages'), 10) || 0);
      const reviewImageJobs = [];

      reviews.slice(reviewFrom - 1, reviewTo).forEach((review, reviewIndex) => {
        (review.images || []).forEach((image, imageIndex) => {
          reviewImageJobs.push({ review, reviewIndex, image, imageIndex });
        });
      });
      const limitedReviewJobs = maxReviewImages ? reviewImageJobs.slice(0, maxReviewImages) : reviewImageJobs;

      for (let i = 0; i < limitedReviewJobs.length; i++) {
        if (state.stopRequested) throw new Error('Операция остановлена.');
        const job = limitedReviewJobs[i];
        const reviewPart = sanitizeFileName(job.review.reviewUuid || `review_${reviewFrom + job.reviewIndex}`).slice(0, 48);
        const baseName = `${reviewPart}_${String(job.imageIndex + 1).padStart(2, '0')}`;
        setBusy(button, `Фото ${i + 1}/${limitedReviewJobs.length}`);
        setStatus(`Скачиваю фото отзывов: ${i + 1}/${limitedReviewJobs.length}`, 45 + (i / Math.max(1, limitedReviewJobs.length)) * 28);
        await waitForPaint();

        try {
          const { buffer, contentType, finalUrl, usedUrl } = await fetchImageBinary({ ...job.image, index: i + 1 });
          const localName = ensureExtension(baseName, contentType, usedUrl || finalUrl || job.image.url);
          const localPath = `images/reviews/${localName}`;
          localReviewImages[job.image.url] = localPath;
          imagesMeta.push({
            ...job.image,
            kind: 'review',
            reviewUuid: job.review.reviewUuid || '',
            localName: localPath,
            contentType,
            finalUrl,
            downloadUrl: usedUrl || finalUrl || job.image.url,
            bytes: buffer.byteLength
          });
          zipEntries.push({ name: localPath, data: buffer });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push({ kind: 'review', reviewUuid: job.review.reviewUuid || '', url: job.image.url, error: message });
          dbgErr('review-image:failed', { url: job.image.url, error: message });
        }
      }
    }

    const productWithImageMeta = {
      ...product,
      images: product.images.map(img => ({
        ...img,
        localName: localImages[img.url] || ''
      }))
    };

    const exportMarkdown = mode === 'reviews'
      ? reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, automatic, localImages: localReviewImages })
      : mode === 'product'
        ? productToMarkdown(productWithImageMeta, { localImages })
        : [
            productToMarkdown(productWithImageMeta, { localImages }).trim(),
            '',
            reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, automatic, localImages: localReviewImages }).trim()
          ].join('\n\n') + '\n';

    zipEntries.push({ name: 'export.md', data: exportMarkdown });
    zipEntries.push({ name: 'product.json', data: JSON.stringify(productWithImageMeta, null, 2) });

    if (mode !== 'reviews') {
      zipEntries.push({ name: 'product.md', data: productToMarkdown(productWithImageMeta, { localImages }) });
    }

    if (mode !== 'product') {
      zipEntries.push({ name: 'reviews.md', data: reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, automatic, localImages: localReviewImages }) });
      zipEntries.push({ name: 'reviews.json', data: JSON.stringify(reviews, null, 2) });
    }

    dbg('zip:files-ready', {
      mode,
      files: zipEntries.length,
      imagesTotal: product.images.length,
      imagesPacked: imagesMeta.length,
      warnings: warnings.length,
      exportMarkdownLength: exportMarkdown.length
    });

    if (imagesMeta.length) zipEntries.push({ name: 'images.json', data: JSON.stringify(imagesMeta, null, 2) });
    if (warnings.length) zipEntries.push({ name: 'warnings.json', data: JSON.stringify(warnings, null, 2) });
    if (CONFIG.DEBUG && DEBUG_LOG.length) zipEntries.push({ name: 'debug.log', data: DEBUG_LOG.join('\n') });

    setBusy(button, 'Упаковка…');
    setStatus('Упаковываю ZIP…', 78);
    await waitForPaint();

    lastZipProgressTs = 0;
    dbg('zip.store-generate:start', { files: zipEntries.map(entry => entry.name) });

    const blob = buildStoreZip(zipEntries, meta => {
      dbg('zip.progress', meta);
      updateZipProgress(button, meta);
    });

    if (!blob.size) throw new Error('ZIP получился пустым.');
    dbg('zip.store-generate:done', { size: blob.size });

    const filename = `${makeBaseName(mode)}.zip`;
    saveBlob(filename, blob);

    dbg('zip:done', { filename, warnings: warnings.length, images: imagesMeta.length, bytes: blob.size });
    setStatus(warnings.length ? `ZIP сохранён, но есть предупреждения: ${warnings.length}` : 'ZIP сохранён.', 100);
    notify(
      'Ozon Exporter',
      warnings.length ? `ZIP готов. Не скачано изображений: ${warnings.length}. Подробности — в warnings.json.` : `ZIP сохранён: ${filename}`,
      warnings.length ? 'warn' : 'ok'
    );
  }

  async function exportMd(button, copy = false) {
    const mode = S.get('mode');
    setBusy(button, copy ? 'Копирую…' : 'MD…');
    setStatus(copy ? 'Готовлю Markdown для буфера…' : 'Готовлю Markdown…', 12);
    await waitForPaint();

    const md = await buildMarkdown(mode);

    if (copy) {
      const ok = await copyToClipboard(md);
      if (!ok) throw new Error('Не удалось скопировать Markdown в буфер обмена.');
      setStatus('Markdown скопирован.', 100);
      notify('Ozon Exporter', 'Markdown скопирован.', 'ok');
      return;
    }

    const filename = `${makeBaseName(mode)}.md`;
    downloadText(md, filename);
    setStatus('Markdown сохранён.', 100);
    notify('Ozon Exporter', `Файл сохранён: ${filename}`, 'ok');
  }

  async function exportJson(button) {
    const mode = S.get('mode');
    setBusy(button, 'JSON…');
    setStatus('Собираю JSON…', 12);
    await waitForPaint();

    const product = collectProductData();
    const reviews = await collectReviewsForCurrentMode();
    const { from, to, automatic } = getReviewRange();
    const payload = {
      platform: 'Ozon',
      exporterVersion: SCRIPT_VERSION,
      exportedAt: nowIso(),
      settings: {
        mode,
        reviewRangeMode: automatic ? 'auto' : 'range',
        rangeFrom: from,
        rangeTo: to,
        onlyWithPhotos: !!S.get('onlyWithPhotos'),
        includeProductImages: !!S.get('includeProductImages'),
        includeReviewImages: !!S.get('includeReviewImages')
      },
      product: mode === 'reviews' ? null : product,
      reviews: mode === 'product' ? [] : reviews.slice(from - 1, to)
    };

    const filename = `${makeBaseName(mode)}.json`;
    downloadText(JSON.stringify(payload, null, 2), filename, 'application/json;charset=utf-8');
    setStatus('JSON сохранён.', 100);
    notify('Ozon Exporter', `Файл сохранён: ${filename}`, 'ok');
  }

  async function exportSelectedReview(button, copy = false) {
    const el = state.selectedReviewEl || findReviewFromSelection();
    if (!el) throw new Error('Сначала выберите отзыв.');

    setBusy(button, copy ? 'Копирую…' : 'Отзыв…');
    const review = extractReview(el);
    const md = [
      '# Отзыв Ozon',
      '',
      `- Товар: ${getProductTitle()}`,
      `- URL: ${getCanonicalUrl()}`,
      '',
      reviewToMarkdown(review, 1),
      '',
      `---\nСобрано: ${nowIso()}`
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';

    if (copy) {
      const ok = await copyToClipboard(md);
      if (!ok) throw new Error('Не удалось скопировать отзыв.');
      notify('Ozon Exporter', 'Выбранный отзыв скопирован.', 'ok');
      return;
    }

    const productId = getProductId() || slug(getProductTitle());
    const shortUuid = review.reviewUuid ? review.reviewUuid.slice(0, 8) : 'noid';
    const filename = sanitizeFileName(`ozon_review_${productId}_${shortUuid}_${ts()}.md`);
    downloadText(md, filename);
    notify('Ozon Exporter', `Отзыв сохранён: ${filename}`, 'ok');
  }

  function startPickMode() {
    stopPickMode();
    state.pickMode = true;
    setStatus('Режим выбора: щёлкните по отзыву. Esc — отмена.');

    const banner = q('.ozmd-pick-banner');
    if (banner) banner.hidden = false;

    const onMove = event => {
      if (!state.pickMode) return;
      const el = event.target?.closest?.('[data-review-uuid]');
      qa('[data-review-uuid].ozmd-pick-outline').forEach(item => item.classList.remove('ozmd-pick-outline'));
      if (el) el.classList.add('ozmd-pick-outline');
    };

    const onClick = event => {
      if (!state.pickMode) return;
      const el = event.target?.closest?.('[data-review-uuid]');
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      state.selectedReviewEl = el;
      stopPickMode();
      setStatus('Отзыв выбран.');
      notify('Ozon Exporter', 'Отзыв выбран.', 'ok');
    };

    const onKey = event => {
      if (event.key === 'Escape') stopPickMode();
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);

    state.stopPick = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      qa('[data-review-uuid].ozmd-pick-outline').forEach(item => item.classList.remove('ozmd-pick-outline'));
      if (banner) banner.hidden = true;
      state.pickMode = false;
    };
  }

  function stopPickMode() {
    if (state.stopPick) state.stopPick();
    state.stopPick = null;
  }

  function useReviewFromSelection() {
    const el = findReviewFromSelection();
    if (!el) throw new Error('Не удалось определить отзыв по выделению. Выделите текст внутри отзыва или используйте «Выбрать».');
    state.selectedReviewEl = el;
    setStatus('Отзыв выбран из выделения.');
    notify('Ozon Exporter', 'Отзыв выбран из выделения.', 'ok');
  }

  function addStyle() {
    if (document.getElementById('ozmd-pro-style')) return;
    GM_addStyle(`
      #${UI_ROOT_ID}, #${UI_ROOT_ID} * { box-sizing: border-box; }
      #${UI_ROOT_ID} {
        --ozmd-blue: var(--textOzon, #005bff);
        --ozmd-blue-dark: #0047c7;
        --ozmd-text: var(--ozBlack, #001a34);
        --ozmd-muted: #6b7a90;
        --ozmd-border: rgba(0, 26, 52, .12);
        --ozmd-soft: var(--layerFloor0, #f5f7fa);
        --ozmd-card: #fff;
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483645;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        color: var(--ozmd-text);
        font: 400 14px/1.35 var(--mainFont, Onest, Arial, sans-serif);
      }
      .ozmd-trigger {
        min-height: 48px;
        min-width: 148px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 0 17px 0 13px;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 15px;
        background: linear-gradient(135deg, var(--ozmd-blue) 0%, #1769ff 100%);
        color: #fff;
        font: 750 14px/1 var(--mainFont, Onest, Arial, sans-serif);
        cursor: pointer;
        box-shadow: 0 9px 18px rgba(0, 91, 255, .20), 0 2px 4px rgba(0, 26, 52, .10);
        transition: transform .16s cubic-bezier(0.2, 0, 0, 1), box-shadow .16s cubic-bezier(0.2, 0, 0, 1), filter .16s cubic-bezier(0.2, 0, 0, 1);
      }
      .ozmd-trigger:hover { filter: saturate(1.08) brightness(1.02); transform: translateY(-2px); box-shadow: 0 14px 26px rgba(0, 91, 255, .27), 0 3px 6px rgba(0, 26, 52, .10); }
      .ozmd-trigger:active { transform: scale(.96); }
      .ozmd-trigger:focus-visible { outline: 3px solid rgba(0,91,255,.28); outline-offset: 3px; }
      .ozmd-trigger-icon { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 9px; background: rgba(255,255,255,.16); }
      .ozmd-trigger-icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
      .ozmd-trigger-chevron { width: 7px; height: 7px; margin-left: 2px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg) translateY(-2px); opacity: .78; transition: transform .16s cubic-bezier(0.2, 0, 0, 1); }
      .ozmd-trigger[aria-expanded="true"] .ozmd-trigger-chevron { transform: rotate(225deg) translate(-1px, -1px); }
      .ozmd-panel {
        width: 392px;
        max-width: calc(100vw - 32px);
        max-height: min(820px, calc(100vh - 84px));
        overflow: hidden;
        display: none;
        border: 1px solid var(--ozmd-border);
        border-radius: 22px;
        background: var(--ozmd-card);
        box-shadow: 0 18px 48px rgba(0, 26, 52, .18);
      }
      .ozmd-panel.open { display: grid; grid-template-rows: auto minmax(0, 1fr); animation: ozmd-pop .16s ease-out; }
      @keyframes ozmd-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      .ozmd-head {
        padding: 16px 18px 14px;
        display: flex;
        justify-content: space-between;
        gap: 14px;
        background: linear-gradient(180deg, #f7faff 0%, #fff 100%);
        border-bottom: 1px solid var(--ozmd-border);
      }
      .ozmd-kicker { margin: 0 0 3px; color: var(--ozmd-blue); font-size: 12px; font-weight: 700; letter-spacing: .02em; }
      .ozmd-title { margin: 0; color: var(--ozmd-text); font-size: 17px; line-height: 22px; font-weight: 800; }
      .ozmd-close {
        width: 32px; height: 32px; border: 0; border-radius: 12px;
        background: #edf3fb; color: var(--ozmd-text); cursor: pointer; font-size: 18px; line-height: 1;
      }
      .ozmd-body { min-height: 0; overflow: auto; padding: 14px; display: grid; gap: 12px; background: #fff; scrollbar-width: thin; }
      .ozmd-summary { padding: 11px 12px; border-left: 4px solid var(--ozmd-blue); border-radius: 0 12px 12px 0; background: #edf4ff; color: #243b57; font-size: 12px; line-height: 17px; }
      .ozmd-block {
        padding: 13px;
        border: 1px solid var(--ozmd-border);
        border-radius: 18px;
        background: var(--ozmd-soft);
        display: grid;
        gap: 11px;
      }
      .ozmd-block-title { margin: 0; color: #53657a; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
      .ozmd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .ozmd-field { display: grid; gap: 6px; }
      .ozmd-field.wide { grid-column: 1 / -1; }
      .ozmd-field.is-disabled { opacity: .48; }
      .ozmd-label { color: #4a5c70; font-size: 12px; font-weight: 700; }
      .ozmd-input, .ozmd-select {
        width: 100%; min-height: 40px; padding: 0 12px;
        border: 1px solid rgba(0,26,52,.16); border-radius: 13px;
        background: #fff; color: var(--ozmd-text); outline: none;
        font: 500 13px/1.2 var(--mainFont, Onest, Arial, sans-serif);
        transition: border-color .15s ease, box-shadow .15s ease;
      }
      .ozmd-input:focus, .ozmd-select:focus { border-color: var(--ozmd-blue); box-shadow: 0 0 0 3px rgba(0,91,255,.12); }
      .ozmd-switch { position: relative; min-height: 46px; padding: 8px 10px; display: flex; align-items: center; gap: 9px; border: 1px solid rgba(0,26,52,.12); border-radius: 13px; background: #fff; color: var(--ozmd-text); font-size: 12px; font-weight: 650; cursor: pointer; user-select: none; transition: border-color .15s, background .15s; }
      .ozmd-switch:hover { border-color: rgba(0,91,255,.35); background: #f8fbff; }
      .ozmd-switch input { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
      .ozmd-switch-track { position: relative; width: 38px; height: 22px; flex: 0 0 auto; border-radius: 999px; background: #d8e0ea; transition: background .18s ease; }
      .ozmd-switch-track::after { content: ""; position: absolute; width: 18px; height: 18px; left: 2px; top: 2px; border-radius: 50%; background: #fff; box-shadow: 0 2px 5px rgba(0,26,52,.25); transition: transform .18s ease; }
      .ozmd-switch input:checked + .ozmd-switch-track { background: var(--ozmd-blue); }
      .ozmd-switch input:checked + .ozmd-switch-track::after { transform: translateX(16px); }
      .ozmd-switch input:focus-visible + .ozmd-switch-track { outline: 3px solid rgba(0,91,255,.25); outline-offset: 2px; }
      .ozmd-switches { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .ozmd-details { border-top: 1px solid var(--ozmd-border); padding-top: 8px; }
      .ozmd-details summary { min-height: 34px; display: flex; align-items: center; cursor: pointer; color: #4a5c70; font-size: 12px; font-weight: 750; }
      .ozmd-details summary:hover { color: var(--ozmd-blue); }
      .ozmd-details[open] summary { margin-bottom: 10px; }
      .ozmd-details-body { display: grid; gap: 10px; }
      .ozmd-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .ozmd-actions.three { grid-template-columns: 1fr 1fr 1fr; }
      .ozmd-actions.four { grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .ozmd-btn {
        min-height: 40px; padding: 0 12px; border: 0; border-radius: 13px;
        cursor: pointer; font: 800 13px/1 var(--mainFont, Onest, Arial, sans-serif);
        transition: transform .15s ease, filter .15s ease, background .15s ease, box-shadow .15s ease;
      }
      .ozmd-btn:hover:not(:disabled) { transform: translateY(-1px); filter: saturate(1.04); }
      .ozmd-btn:active:not(:disabled) { transform: translateY(0); }
      .ozmd-btn:disabled { opacity: .62; cursor: default; }
      .ozmd-btn.primary { background: var(--ozmd-blue); color: #fff; box-shadow: 0 8px 18px rgba(0, 91, 255, .2); }
      .ozmd-btn.secondary { background: #e8f1ff; color: var(--ozmd-blue); }
      .ozmd-btn.neutral { background: #fff; color: var(--ozmd-text); border: 1px solid rgba(0,26,52,.14); }
      .ozmd-btn.zip { background: #001a34; color: #fff; }
      .ozmd-btn.log { background: #f2f5f9; color: #24364a; border: 1px solid rgba(0,26,52,.14); }
      .ozmd-utility { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; }
      .ozmd-status { color: var(--ozmd-muted); font-size: 12px; line-height: 16px; min-height: 16px; }
      .ozmd-progress { height: 4px; overflow: hidden; border-radius: 999px; background: rgba(0,26,52,.08); }
      .ozmd-progress[hidden] { display: none; }
      .ozmd-progress > span { display: block; height: 100%; width: 0%; background: var(--ozmd-blue); transition: width .18s ease; }
      .ozmd-log-overlay {
        position: fixed; inset: 0; z-index: 2147483647;
        display: grid; place-items: center; padding: 22px;
        background: rgba(0, 10, 22, .72);
      }
      .ozmd-log-modal {
        width: min(980px, 100%); max-height: min(760px, calc(100vh - 44px));
        display: grid; grid-template-rows: auto minmax(0, 1fr);
        overflow: hidden; border-radius: 16px; background: #f8fbff; color: #001a34;
        box-shadow: 0 28px 80px rgba(0, 10, 22, .42);
        font-family: var(--mainFont, Onest, Arial, sans-serif);
      }
      .ozmd-log-head {
        display: flex; align-items: center; justify-content: space-between; gap: 14px;
        padding: 14px 16px; border-bottom: 1px solid rgba(0,26,52,.12);
      }
      .ozmd-log-head h3 { margin: 0; font-size: 16px; line-height: 1.25; }
      .ozmd-log-actions { display: flex; gap: 8px; }
      .ozmd-log-btn {
        min-height: 34px; padding: 0 12px; border: 1px solid rgba(0,26,52,.16);
        border-radius: 10px; background: #fff; color: #001a34; cursor: pointer;
        font: 800 12px/1 var(--mainFont, Onest, Arial, sans-serif);
      }
      .ozmd-log-body {
        min-height: 240px; margin: 0; padding: 14px 16px; overflow: auto;
        background: #07111f; color: #d9e7ff;
        font: 12px/1.45 Consolas, "Courier New", monospace;
        white-space: pre-wrap; word-break: break-word;
      }
      .ozmd-pick-banner {
        position: fixed; left: 50%; top: 18px; transform: translateX(-50%);
        z-index: 2147483646; padding: 10px 14px; border-radius: 14px;
        background: rgba(0,26,52,.94); color: #fff;
        box-shadow: 0 16px 36px rgba(0,26,52,.24);
        font: 700 13px/1.35 var(--mainFont, Onest, Arial, sans-serif);
      }
      .ozmd-pick-outline { outline: 3px solid var(--ozmd-blue) !important; outline-offset: 3px !important; border-radius: 14px !important; }
      #${TOAST_ROOT_ID} {
        position: fixed; right: 20px; bottom: 86px; z-index: 2147483647;
        display: grid; gap: 8px; max-width: 360px;
      }
      .ozmd-toast {
        opacity: 0; transform: translateY(6px); transition: opacity .18s ease, transform .18s ease;
        padding: 11px 13px; border-radius: 15px; background: #001a34; color: #fff;
        box-shadow: 0 14px 32px rgba(0,26,52,.22); display: grid; gap: 2px;
        font: 500 13px/1.35 var(--mainFont, Onest, Arial, sans-serif);
      }
      .ozmd-toast.show { opacity: 1; transform: translateY(0); }
      .ozmd-toast strong { font-weight: 800; }
      .ozmd-toast-ok { background: #0a7a44; }
      .ozmd-toast-warn { background: #8a5a00; }
      .ozmd-toast-error { background: #a32020; }
      @media (max-width: 640px) {
        #${UI_ROOT_ID} { left: 12px; right: 12px; align-items: stretch; }
        .ozmd-panel { width: 100%; max-width: none; }
        .ozmd-grid, .ozmd-switches { grid-template-columns: 1fr; }
        .ozmd-actions.four { grid-template-columns: 1fr 1fr; }
        .ozmd-log-overlay { padding: 10px; }
        .ozmd-log-modal { max-height: calc(100vh - 20px); border-radius: 12px; }
        .ozmd-log-head { align-items: flex-start; flex-direction: column; }
        #${TOAST_ROOT_ID} { left: 12px; right: 12px; max-width: none; }
      }
      @media (prefers-reduced-motion: reduce) { #${UI_ROOT_ID} *, #${TOAST_ROOT_ID} * { animation: none !important; transition: none !important; } }
    `);
  }

  function ensureUi() {
    if (document.getElementById(UI_ROOT_ID)) return;
    addStyle();

    const root = document.createElement('div');
    root.id = UI_ROOT_ID;

    const panel = document.createElement('div');
    panel.className = 'ozmd-panel';

    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Экспорт Ozon');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <header class="ozmd-head">
        <div>
          <p class="ozmd-kicker">Ozon exporter · v${SCRIPT_VERSION}</p>
          <h3 class="ozmd-title">Товар, отзывы и медиа</h3>
        </div>
        <button class="ozmd-close" type="button" aria-label="Закрыть панель">×</button>
      </header>
      <main class="ozmd-body">
        <div class="ozmd-summary">Карточка будет проверена перед экспортом.</div>

        <section class="ozmd-block">
          <h4 class="ozmd-block-title">Состав экспорта</h4>
          <div class="ozmd-grid">
            <label class="ozmd-field wide"><span class="ozmd-label">Что сохранить</span><select class="ozmd-select" data-k="mode"><option value="full">Товар + отзывы</option><option value="product">Только товар</option><option value="reviews">Только отзывы</option></select></label>
            <label class="ozmd-field wide"><span class="ozmd-label">Количество отзывов</span><select class="ozmd-select" data-k="reviewRangeMode"><option value="range">Указать диапазон</option><option value="auto">Автоматически: все отзывы</option></select></label>
            <label class="ozmd-field"><span class="ozmd-label">Отзывы с №</span><input class="ozmd-input" data-k="rangeFrom" type="number" min="1" step="1"></label>
            <label class="ozmd-field"><span class="ozmd-label">Отзывы по №</span><input class="ozmd-input" data-k="rangeTo" type="number" min="1" step="1"></label>
            <label class="ozmd-field wide"><span class="ozmd-label">Вариант товара</span><select class="ozmd-select" data-k="reviewVariantMode"><option value="all">Все варианты товара</option><option value="selected">Только выбранный вариант</option></select></label>
          </div>
        </section>

        <section class="ozmd-block">
          <h4 class="ozmd-block-title">Файлы и сбор</h4>
          <div class="ozmd-switches">
            <label class="ozmd-switch"><input data-k="onlyWithPhotos" type="checkbox"><span class="ozmd-switch-track" aria-hidden="true"></span><span>Только отзывы с фото</span></label>
            <label class="ozmd-switch"><input data-k="includeProductImages" type="checkbox"><span class="ozmd-switch-track" aria-hidden="true"></span><span>Фото товара в ZIP</span></label>
            <label class="ozmd-switch"><input data-k="includeReviewImages" type="checkbox"><span class="ozmd-switch-track" aria-hidden="true"></span><span>Фото отзывов в ZIP</span></label>
          </div>
          <details class="ozmd-details">
            <summary>Дополнительные настройки</summary>
            <div class="ozmd-details-body">
              <div class="ozmd-grid">
                <label class="ozmd-field"><span class="ozmd-label">Макс. фото отзывов</span><input class="ozmd-input" data-k="maxReviewImages" type="number" min="0" max="2000" step="10"></label>
                <label class="ozmd-field"><span class="ozmd-label">Размер фото товара</span><select class="ozmd-select" data-k="imageSize"><option value="wc700">До 700 px</option><option value="wc1000">До 1000 px</option><option value="wc1200">До 1200 px</option></select></label>
              </div>
            </div>
          </details>
          <details class="ozmd-details">
            <summary>Инструменты отдельного отзыва</summary>
            <div class="ozmd-details-body">
              <div class="ozmd-actions">
                <button class="ozmd-btn neutral" type="button" data-act="pick">Выбрать на странице</button>
                <button class="ozmd-btn neutral" type="button" data-act="useSelection">Из выделения</button>
              </div>
              <div class="ozmd-actions">
                <button class="ozmd-btn secondary" type="button" data-act="copySelected">Копировать отзыв</button>
                <button class="ozmd-btn secondary" type="button" data-act="downloadSelected">MD отзыва</button>
              </div>
            </div>
          </details>
        </section>

        <section class="ozmd-block">
          <h4 class="ozmd-block-title">Сохранить</h4>
          <div class="ozmd-actions four">
            <button class="ozmd-btn primary" type="button" data-act="copy">Копировать</button>
            <button class="ozmd-btn secondary" type="button" data-act="download">Markdown</button>
            <button class="ozmd-btn neutral" type="button" data-act="json">JSON</button>
            <button class="ozmd-btn zip" type="button" data-act="zip">ZIP</button>
          </div>
          <div class="ozmd-utility">
            <div class="ozmd-status" role="status" aria-live="polite">Готово.</div>
            <button class="ozmd-btn log" type="button" data-act="log">Журнал</button>
            <button class="ozmd-btn neutral" type="button" data-act="stop" disabled>Стоп</button>
          </div>
          <div class="ozmd-progress" role="progressbar" aria-label="Ход экспорта" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><span></span></div>
        </section>
      </main>
    `;

    const trigger = document.createElement('button');
    trigger.className = 'ozmd-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span class="ozmd-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v11"></path><path d="m7 9 5 5 5-5"></path><path d="M5 19h14"></path></svg></span><span>Экспорт</span><span class="ozmd-trigger-chevron" aria-hidden="true"></span>';

    const banner = document.createElement('div');
    banner.className = 'ozmd-pick-banner';
    banner.hidden = true;
    banner.textContent = 'Кликните по отзыву. Esc — отмена.';
    document.body.appendChild(banner);

    root.appendChild(panel);
    root.appendChild(trigger);
    document.body.appendChild(root);

    state.statusEl = q('.ozmd-status', panel);
    state.progressEl = q('.ozmd-progress', panel);
    state.progressBarEl = q('.ozmd-progress > span', panel);
    state.stopButton = q('[data-act="stop"]', panel);

    for (const el of qa('[data-k]', panel)) {
      const value = S.get(el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = String(value);
    }

    const saveSettingElement = el => {
      if (!el?.matches?.('[data-k]')) return;
      const key = el.dataset.k;
      let value = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number') value = Math.max(0, parseInt(value, 10) || 0);
      if (key === 'rangeFrom' || key === 'rangeTo') value = Math.max(1, value || 1);
      S.set(key, value);
      dbg('settings:changed', { key, value });
    };

    const syncSettingsFromUi = () => qa('[data-k]', panel).forEach(saveSettingElement);
    const updateRangeControls = () => {
      const automatic = S.get('reviewRangeMode') === 'auto';
      for (const el of qa('[data-k="rangeFrom"], [data-k="rangeTo"]', panel)) {
        el.disabled = automatic;
        el.closest('.ozmd-field')?.classList.toggle('is-disabled', automatic);
      }
    };
    const updateSummary = () => {
      const summary = q('.ozmd-summary', panel);
      if (!summary) return;
      const productId = getProductId();
      const productImages = qa('[data-widget*="webGallery"] img, [data-widget*="gallery"] img, [data-widget*="Gallery"] img').length;
      const visibleReviews = getAllReviewNodes().length;
      summary.textContent = productId
        ? `Товар ${productId} · ${productImages} фото · ${visibleReviews} отзывов сейчас на странице`
        : 'Откройте карточку товара Ozon перед экспортом.';
    };

    const setPanelOpen = open => {
      panel.classList.toggle('open', open);
      panel.setAttribute('aria-hidden', String(!open));
      trigger.setAttribute('aria-expanded', String(open));
      if (open) {
        updateSummary();
        q('.ozmd-close', panel)?.focus();
      }
    };

    trigger.addEventListener('click', () => setPanelOpen(!panel.classList.contains('open')));
    q('.ozmd-close', panel).addEventListener('click', () => { setPanelOpen(false); trigger.focus(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && panel.classList.contains('open') && !q('.ozmd-log-overlay')) setPanelOpen(false);
    });

    panel.addEventListener('input', event => saveSettingElement(event.target));
    panel.addEventListener('change', event => {
      saveSettingElement(event.target);
      if (event.target?.dataset?.k === 'reviewRangeMode') updateRangeControls();
    });

    panel.addEventListener('click', async event => {
      const button = event.target.closest('button[data-act]');
      if (!button) return;
      const action = button.getAttribute('data-act');

      if (action === 'stop') {
        if (!state.running) return;
        state.stopRequested = true;
        button.disabled = true;
        setStatus('Останавливаю после текущего запроса…');
        return;
      }

      if (action === 'log') {
        showDebugLogOverlay();
        return;
      }

      syncSettingsFromUi();
      if (action === 'pick') { startPickMode(); return; }
      if (action === 'useSelection') { useReviewFromSelection(); return; }
      if (state.running) {
        notify('Ozon Exporter', 'Экспорт уже выполняется. Дождитесь завершения или нажмите «Стоп».', 'warn');
        return;
      }

      state.running = true;
      state.stopRequested = false;
      state.stopButton.disabled = false;

      try {
        if (action === 'copy') await exportMd(button, true);
        else if (action === 'download') await exportMd(button, false);
        else if (action === 'json') await exportJson(button);
        else if (action === 'zip') await exportZip(button);
        else if (action === 'copySelected') await exportSelectedReview(button, true);
        else if (action === 'downloadSelected') await exportSelectedReview(button, false);
      } catch (error) {
        console.error('[Ozon Exporter]', error);
        setStatus('Ошибка. Подробности в консоли.');
        notify('Ozon Exporter', error?.message || String(error), 'error');
      } finally {
        state.running = false;
        state.stopRequested = false;
        state.stopButton.disabled = true;
        restoreBusy(button);
        setTimeout(() => setStatus('Готово.'), 1800);
      }
    });

    updateSummary();
    updateRangeControls();
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Ozon Exporter: ZIP', () => exportZip(null).catch(err => notify('Ozon Exporter', err.message || String(err), 'error')));
    GM_registerMenuCommand('Ozon Exporter: Markdown', () => exportMd(null, false).catch(err => notify('Ozon Exporter', err.message || String(err), 'error')));
    GM_registerMenuCommand('Ozon Exporter: JSON', () => exportJson(null).catch(err => notify('Ozon Exporter', err.message || String(err), 'error')));
    GM_registerMenuCommand('Ozon Exporter: Копировать Markdown', () => exportMd(null, true).catch(err => notify('Ozon Exporter', err.message || String(err), 'error')));
    GM_registerMenuCommand('Ozon Exporter: Открыть журнал', showDebugLogOverlay);
  }

  ensureUi();
})();
