// ==UserScript==
// @name         Yandex Market → Markdown Card Copier
// @namespace    https://dwatawolfo.tools/
// @version      2.0.0
// @description  Экспорт карточек и API-отзывов Яндекс Маркета в Markdown, CSV, JSON или ZIP.
// @homepageURL  https://github.com/Yoogai/userscripts
// @downloadURL  https://raw.githubusercontent.com/Yoogai/userscripts/main/yandex-market-card-copier.user.js
// @updateURL    https://raw.githubusercontent.com/Yoogai/userscripts/main/yandex-market-card-copier.user.js
// @match        *://market.yandex.ru/card/*
// @match        *://market.yandex.ru/product/*
// @match        *://market.yandex.ru/*/card/*
// @match        *://market.yandex.ru/compare/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      avatars.mds.yandex.net
// @connect      market.yandex.ru
// @connect      *.yandex.net
// ==/UserScript==

(function () {
  'use strict';

  const UI_ROOT_ID = 'ymmd-root';
  const TOAST_ROOT_ID = 'ymmd-toast-root';
  const PENDING_EXPORT_KEY = 'ymmd-pending-reviews-export';

  const DEFAULTS = {
    mode: 'full',
    reviewRangeMode: 'range',
    rangeFrom: 1,
    rangeTo: 100,
    onlyWithPhotos: false,
    autoOpenReviewsPage: true,
    includeImages: true,
    includeProductImages: true,
    includeReviewImages: true,
    includeDescription: true,
    includeSpecs: true,
    includeDocuments: true,
    maxImages: 30,
    maxReviewImages: 100,
  };

  const CONFIG = {
    FETCH_TIMEOUT_MS: 45000,
    ZIP_PROGRESS_THROTTLE_MS: 150,
    MAX_REVIEW_PAGES: 500,
  };

  let lastZipProgressTs = 0;

  const state = {
    statusEl: null,
    progressEl: null,
    progressBarEl: null,
    lastActionBtn: null,
    reviewCache: [],
    abortController: null,
    stopButton: null,
  };

  const S = {
    get(key) {
      try { return GM_getValue(key, DEFAULTS[key]); }
      catch (_) { return DEFAULTS[key]; }
    },
    set(key, value) {
      try { GM_setValue(key, value); }
      catch (_) {}
    },
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const norm = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t\r\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const nowIso = () => new Date().toISOString();
  const ts = () => nowIso().replace(/[:.]/g, '-');

  function slug(value) {
    return norm(value)
      .toLowerCase()
      .replace(/ё/g, 'e')
      .replace(/[^a-zа-я0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'yandex-market';
  }

  function sanitizeFileName(name) {
    return String(name || 'yandex-market')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160) || 'yandex-market';
  }

  function escapeMd(value) {
    return String(value ?? '').replace(/([\\`*_{}\[\]()#+.!|-])/g, '\\$1');
  }

  function escTable(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, '<br>');
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
    try { return new URL(String(value).replace(/\\\//g, '/'), location.href).href; }
    catch (_) { return ''; }
  }

  function notify(title, text, type = 'info') {
    const root = ensureToastRoot();
    const toast = document.createElement('div');
    toast.className = `ymmd-toast ${type}`;
    toast.textContent = `${title}: ${text}`;
    root.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
    if (typeof GM_notification === 'function' && type === 'error') {
      GM_notification({ title, text, timeout: 4000 });
    }
  }

  function ensureToastRoot() {
    let root = document.getElementById(TOAST_ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = TOAST_ROOT_ID;
      document.documentElement.appendChild(root);
    }
    return root;
  }

  function setStatus(text, progress = null) {
    if (state.statusEl) state.statusEl.textContent = text || '';
    if (state.progressEl && state.progressBarEl) {
      if (progress == null) {
        state.progressEl.hidden = true;
      } else {
        const pct = Math.max(0, Math.min(100, Math.round(progress)));
        state.progressEl.hidden = false;
        state.progressBarEl.style.width = `${pct}%`;
      }
    }
  }

  function setBusy(button, label = 'Выполняю...') {
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
  }

  function beginAbortableExport() {
    state.abortController = new AbortController();
    if (state.stopButton) state.stopButton.disabled = false;
  }

  function endAbortableExport() {
    if (state.stopButton) state.stopButton.disabled = true;
    state.abortController = null;
  }

  function waitForPaint() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function saveBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function saveText(filename, text, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type });
    saveBlob(filename, blob);
  }

  function parseHeaderValue(headers, name) {
    const re = new RegExp(`^${name}:\\s*([^\\n\\r]+)`, 'im');
    return String(headers || '').match(re)?.[1]?.trim() || '';
  }

  async function fetchBinary(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (/text\/html|application\/json/i.test(contentType)) {
        throw new Error(`unexpected content-type: ${contentType || 'unknown'}`);
      }
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (!buffer.byteLength) throw new Error('empty response');
      return { buffer, contentType, finalUrl: response.url || url, usedUrl: url };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('fetch timeout');
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
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout: CONFIG.FETCH_TIMEOUT_MS,
        anonymous: true,
        onload(response) {
          try {
            if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
            const contentType = parseHeaderValue(response.responseHeaders, 'content-type');
            if (/text\/html|application\/json/i.test(contentType)) {
              throw new Error(`unexpected content-type: ${contentType || 'unknown'}`);
            }
            const buffer = new Uint8Array(response.response);
            if (!buffer.byteLength) throw new Error('empty response');
            resolve({ buffer, contentType, finalUrl: response.finalUrl || url, usedUrl: url });
          } catch (error) {
            reject(error);
          }
        },
        ontimeout() { reject(new Error('fetch timeout')); },
        onerror() { reject(new Error('network error')); },
        onabort() { reject(new Error('request aborted')); },
      });
    });
  }

  function normalizeMarketImageUrl(rawUrl) {
    const url = absUrl(rawUrl).replace(/\/(?:\d+x\d+(?:_[a-z]+)?|optimize|orig)($|\?)/i, '/orig$1');
    return /^https:\/\/avatars\.mds\.yandex\.net\/get-(?:mpic|marketpic)\//i.test(url) ? url : '';
  }

  async function fetchImageBinary(image) {
    const candidates = uniqueBy([
      normalizeMarketImageUrl(image.url),
      image.url,
    ].filter(Boolean), value => value);
    let lastError = null;
    for (const candidate of candidates) {
      try { return await fetchBinary(candidate); }
      catch (error) { lastError = error instanceof Error ? error : new Error(String(error)); }
      try { return await gmRequestBinary(candidate); }
      catch (error) { lastError = error instanceof Error ? error : new Error(String(error)); }
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
    } catch (_) {
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
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    return table;
  }

  const CRC32_TABLE = makeCrc32Table();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
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
        currentFile: entry.name,
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

  async function copyToClipboard(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
        return true;
      }
    } catch (_) {}

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  function parseJsonLoose(text) {
    if (!text) return null;
    try { return JSON.parse(text); }
    catch (_) { return null; }
  }

  function getJsonLdItems() {
    const items = [];
    for (const script of qa('script[type="application/ld+json"]')) {
      const data = parseJsonLoose(script.textContent);
      if (!data) continue;
      if (Array.isArray(data)) items.push(...data);
      else if (Array.isArray(data['@graph'])) items.push(...data['@graph']);
      else items.push(data);
    }
    return items;
  }

  function getJsonLdProduct() {
    return getJsonLdItems().find(item => {
      const type = item?.['@type'];
      return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
    }) || {};
  }

  function getJsonLdBreadcrumbs() {
    const list = getJsonLdItems().find(item => item?.['@type'] === 'BreadcrumbList');
    return (list?.itemListElement || [])
      .map(item => norm(item?.item?.name || item?.name))
      .filter(Boolean);
  }

  function getApiaryPatches(root = document) {
    return qa('noframes[data-apiary="patch"]', root)
      .map(node => parseJsonLoose(node.textContent))
      .filter(Boolean);
  }

  function collectionEntries(patches, name) {
    const entries = [];
    for (const patch of patches) {
      const collection = patch?.collections?.[name];
      if (!collection || typeof collection !== 'object') continue;
      for (const [key, value] of Object.entries(collection)) entries.push({ key, value });
    }
    return entries;
  }

  function widgetEntries(patches, name) {
    const entries = [];
    for (const patch of patches) {
      const widgets = patch?.widgets?.[name];
      if (!widgets || typeof widgets !== 'object') continue;
      for (const [key, value] of Object.entries(widgets)) entries.push({ key, value });
    }
    return entries;
  }

  function getMainComposeId(patches) {
    for (const entry of widgetEntries(patches, '@card/MediaViewerManager')) {
      if (entry.value?.composeId) return String(entry.value.composeId);
    }
    const share = collectionEntries(patches, 'share').find(entry => entry.value?.link || entry.value?.picture);
    if (share) return String(share.key);
    const snippets = collectionEntries(patches, 'productServiceSnippets');
    if (snippets[0]?.key) return String(snippets[0].key);
    return '';
  }

  function collectionValue(patches, name, composeId) {
    const entries = collectionEntries(patches, name);
    if (composeId) {
      const exact = entries.find(entry => String(entry.key) === String(composeId));
      if (exact) return exact.value;
    }
    return entries[0]?.value || null;
  }

  function findDeep(root, predicate, out = [], seen = new WeakSet()) {
    if (!root || typeof root !== 'object' || seen.has(root)) return out;
    seen.add(root);
    if (predicate(root)) out.push(root);
    if (Array.isArray(root)) {
      for (const item of root) findDeep(item, predicate, out, seen);
    } else {
      for (const value of Object.values(root)) findDeep(value, predicate, out, seen);
    }
    return out;
  }

  function getUrlProductId() {
    const match = location.pathname.match(/\/(?:card|product)\/[^/]+\/(\d+)(?:\/|$)/i);
    return match?.[1] || '';
  }

  function moneyValue(value) {
    if (!value) return '';
    if (typeof value === 'object') {
      if (value.valueFmt) return String(value.valueFmt);
      if (value.amount?.intPart) return String(value.amount.intPart);
      if (value.price?.value != null) return moneyValue(value.price);
      if (value.value != null) return moneyValue(value.value);
    }
    return String(value);
  }

  function formatMoney(price, currency = 'RUR') {
    const raw = moneyValue(price);
    if (!raw) return '';
    const number = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
    const label = currency === 'RUR' || currency === 'RUB' ? '₽' : currency || '';
    if (!Number.isFinite(number)) return norm(`${raw} ${label}`);
    return `${new Intl.NumberFormat('ru-RU').format(number)} ${label}`.trim();
  }

  function formatRating(value) {
    const text = norm(value).replace(',', '.');
    if (!text) return '';
    const number = Number(text);
    if (!Number.isFinite(number)) return norm(value);
    return String(Math.round(number * 10) / 10).replace('.', ',');
  }

  function selectBestBuyOption(patches, title, productId) {
    const entries = collectionEntries(patches, 'buyOption').map(entry => entry.value).filter(Boolean);
    if (!entries.length) return null;
    const titleNorm = norm(title).toLowerCase();
    const byTitle = entries.find(item => titleNorm && norm(item.title).toLowerCase() === titleNorm);
    if (byTitle) return byTitle;
    const byProduct = entries.find(item => productId && String(item.productId) === String(productId));
    if (byProduct) return byProduct;
    return entries.find(item => item.offerId && item.price && item.title) || entries[0];
  }

  function extractApiaryData() {
    const patches = getApiaryPatches();
    const composeId = getMainComposeId(patches);
    const titleCollection = collectionValue(patches, 'title', composeId);
    const serviceSnippet = collectionValue(patches, 'productServiceSnippets', composeId);
    const share = collectionValue(patches, 'share', composeId);
    const priceCollection = collectionValue(patches, 'price', composeId);
    const mediaViewer = widgetEntries(patches, '@card/MediaViewerManager')[0]?.value || null;
    const ecommerceProducts = findDeep(patches, node => Array.isArray(node?.detail?.products))
      .flatMap(node => node.detail.products);
    const ecommerce = ecommerceProducts[0] || {};

    const title =
      norm(titleCollection?.raw || titleCollection?.value || titleCollection) ||
      norm(mediaViewer?.title) ||
      norm(share?.title) ||
      norm(ecommerce.name);

    const buyOption = selectBestBuyOption(patches, title, ecommerce.id);
    const productPayload = serviceSnippet?.productSnippet?.productPayload || {};
    const articleSpec = widgetEntries(patches, '@card/ProductSpec')
      .map(entry => entry.value?.spec)
      .find(spec => /артикул маркета/i.test(spec?.name || ''));

    const imageIds = Array.isArray(mediaViewer?.mediaItemIds) ? mediaViewer.mediaItemIds.map(String) : [];
    const mediaItems = collectionEntries(patches, 'mediaItem')
      .filter(entry => !imageIds.length || imageIds.includes(String(entry.key)))
      .map(entry => entry.value)
      .filter(item => item?.origUrl || item?.url || item?.picture?.baseUrl)
      .map((item, index) => ({
        index: index + 1,
        url: absUrl(item.origUrl || item.url || `${item.picture?.baseUrl || ''}orig`),
        width: item.width || item.picture?.width || null,
        height: item.height || item.picture?.height || null,
        title: norm(item.title || item.picture?.title || title),
      }));

    const fallbackPictures = findDeep(patches, node => node?.picture?.baseUrl || node?.picture || node?.imageMeta)
      .map((node, index) => {
        const picture = node.picture || {};
        const imageMeta = node.imageMeta || {};
        const url = picture.baseUrl
          ? `${picture.baseUrl}orig`
          : typeof picture === 'string'
            ? picture
            : imageMeta.namespace && imageMeta.groupId && imageMeta.key
              ? `https://avatars.mds.yandex.net/get-${imageMeta.namespace}/${imageMeta.groupId}/${imageMeta.key}/orig`
              : '';
        return {
          index: index + 1,
          url: absUrl(url),
          width: picture.width || null,
          height: picture.height || null,
          title: norm(picture.title || node.title || title),
        };
      })
      .filter(item => item.url && (!title || !item.title || item.title === title));

    const docs = (collectionValue(patches, 'documentsInfo', composeId)?.documents || [])
      .flatMap(group => (group.documentBlock || []).map(doc => ({
        title: norm(doc.name || doc.title),
        type: norm(doc.type),
        size: norm(doc.size),
        url: absUrl(doc.downloadUrl || doc.url),
      })))
      .filter(doc => doc.title || doc.url);

    const ratingWidget = widgetEntries(patches, '@card/ReviewBlockBusinessReviewsRating')[0]?.value || {};

    return {
      composeId,
      title,
      productId: String(buyOption?.productId || ecommerce.id || productPayload.modelId || '').trim(),
      skuId: String(buyOption?.skuId || productPayload.skuId || productPayload.mskuId || '').trim(),
      oskuId: String(buyOption?.oskuId || productPayload.oskuId || articleSpec?.value || getUrlProductId() || '').trim(),
      offerId: String(buyOption?.offerId || productPayload.offerId || '').trim(),
      categoryId: String(buyOption?.categoryId || ecommerce.categoryId || productPayload.categoryId || '').trim(),
      brand: norm(ecommerce.brand || productPayload.vendorName || ''),
      seller: norm(buyOption?.supplierName || buyOption?.businessName || productPayload.supplierName || ''),
      price: formatMoney(priceCollection?.mainPrice?.price || buyOption?.price || ecommerce.price, buyOption?.price?.currency || 'RUR'),
      oldPrice: formatMoney(priceCollection?.oldPrices?.[0]?.price || buyOption?.basePrice || buyOption?.oldPrice || ecommerce.oldPrice, buyOption?.price?.currency || 'RUR'),
      rating: ratingWidget.ratingValue || productPayload.productRating?.rating || '',
      ratingCount: ratingWidget.ratingCount || productPayload.productRating?.descriptionList?.[0] || '',
      reviewCount: ratingWidget.reviewCount || '',
      boughtCount: productPayload.productRating?.descriptionList?.[1] || '',
      description: norm(productPayload.description || ''),
      images: uniqueBy([...mediaItems, ...fallbackPictures], item => item.url),
      documents: docs,
    };
  }

  function getCanonicalUrl(jsonProduct) {
    return absUrl(q('link[rel="canonical"]')?.href || jsonProduct.url || location.href).replace(/[?#].*$/, '');
  }

  function getDomTitle(jsonProduct, apiary) {
    return norm(apiary.title)
      || norm(q('h1')?.innerText)
      || norm(q('meta[itemprop="name"]')?.content)
      || norm(jsonProduct.name)
      || norm(document.title.replace(/\s+—\s+купить.*$/i, ''));
  }

  function getDomDescription(jsonProduct, apiary) {
    const root = q('[data-auto="product-description"] [data-zone-name="description"], [data-zone-name="marketProductDescription"] [data-zone-name="description"]');
    if (root) {
      const clone = root.cloneNode(true);
      clone.querySelectorAll('script, style, button, svg').forEach(node => node.remove());
      const parts = qa('p, li, div', clone)
        .filter(el => !qa('p, li, div', el).some(child => child !== el && norm(child.innerText || child.textContent)))
        .map(el => norm(el.innerText).replace(/^ㅤ$/, ''))
        .filter(Boolean);
      const text = uniqueBy(parts, item => item).join('\n\n');
      if (text) return text;
    }
    return norm(apiary.description)
      || norm(jsonProduct.description)
      || norm(q('meta[name="description"], meta[itemprop="description"]')?.content);
  }

  function getDomPrice(apiary, jsonProduct) {
    if (apiary.price) return apiary.price;
    const offer = jsonProduct.offers || {};
    if (offer.price) return formatMoney(offer.price, offer.priceCurrency);
    const hidden = qa('.ds-visuallyHidden, [aria-label]')
      .map(el => norm(el.innerText || el.getAttribute('aria-label')))
      .find(text => /^Цена\s+[\d\s.,]+/i.test(text));
    return hidden ? hidden.replace(/^Цена\s+/i, '') : '';
  }

  function cleanSpecValue(label, value) {
    let out = norm(value)
      .replace(/\bПоказать полностью\b/gi, '')
      .replace(/\bВсе характеристики\b/gi, '')
      .replace(/\bКопировать\b/gi, '')
      .trim();
    if (out.toLowerCase().startsWith(label.toLowerCase())) {
      out = norm(out.slice(label.length));
    }
    out = out.replace(/^[:\s-]+/, '').trim();
    return out;
  }

  function findSpecValue(labelEl) {
    const label = norm(labelEl.innerText || labelEl.textContent);
    let branch = labelEl;
    for (let depth = 0; branch?.parentElement && depth < 9; depth += 1) {
      const parent = branch.parentElement;
      const children = Array.from(parent.children);
      const index = children.indexOf(branch);
      const after = children
        .slice(index + 1)
        .map(el => norm(el.innerText || el.textContent))
        .filter(Boolean)
        .join(' ');
      const cleaned = cleanSpecValue(label, after);
      if (cleaned && cleaned !== label) return cleaned;

      const allText = cleanSpecValue(label, parent.innerText || parent.textContent);
      if (allText && allText !== label && allText.length < 700) return allText;
      branch = parent;
    }
    return '';
  }

  function collectCharacteristics() {
    const roots = qa([
      '[data-zone-name="ProductSpecsList"]',
      '[data-zone-name="fullSpecs"]',
      '[data-auto="product-full-specs"]',
      '[data-auto="specs-list-fullExtended"]',
      '#product-description',
    ].join(','));
    const scope = roots.length ? roots : [document];
    const rows = [];
    const seen = new Set();

    for (const root of scope) {
      for (const labelEl of qa('[data-auto="product-spec"]', root)) {
        if (labelEl.closest('[data-zone-name="productSnippet"], [id*="kkmCarousel"], [id*="madvIncut"]')) continue;
        const name = norm(labelEl.innerText || labelEl.textContent);
        const value = findSpecValue(labelEl);
        if (!name || !value || name.length > 160 || value.length > 1200) continue;
        const key = `${name}\u0000${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ name, value });
      }
    }

    return rows;
  }

  function isComparePage() {
    return /^\/compare(?:\/|$)/i.test(location.pathname);
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
  }

  function compareRowCells(row) {
    const cells = qa('th, td, [role="columnheader"], [role="cell"]', row)
      .filter(cell => !cell.querySelector('th, td, [role="columnheader"], [role="cell"]'))
      .map(cell => norm(cell.innerText || cell.textContent))
      .filter(Boolean);
    if (cells.length) return cells;
    const text = norm(row.innerText || row.textContent);
    return text ? [text] : [];
  }

  function collectNativeCompareMatrix() {
    const candidates = [];
    for (const table of qa('table, [role="table"], [role="grid"]')) {
      if (!isElementVisible(table)) continue;
      const rows = qa('tr, [role="row"]', table)
        .filter(isElementVisible)
        .map(compareRowCells)
        .filter(row => row.length >= 2);
      if (rows.length < 3) continue;
      const fullText = norm(table.innerText || table.textContent).toLowerCase();
      const score = rows.length * 3 + Math.max(...rows.map(row => row.length))
        + (/цена|характеристик|памят|размер|вес/i.test(fullText) ? 25 : 0);
      candidates.push({ rows, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0]) return candidates[0].rows;
    const roleRows = qa('[role="row"]')
      .filter(isElementVisible)
      .map(compareRowCells)
      .filter(row => row.length >= 2);
    return roleRows.length >= 3 ? roleRows : [];
  }

  function compareProductHref(anchor) {
    const href = anchor?.getAttribute('href') || '';
    if (!/\/(?:card|product)\/[^/]+\/\d+(?:[/?#]|$)/i.test(href)) return '';
    try {
      const url = new URL(href, location.href);
      return `${url.origin}${url.pathname}`;
    } catch (_) {
      return '';
    }
  }

  function compareCardLinks(root) {
    return uniqueBy(qa('a[href]', root)
      .filter(anchor => isElementVisible(anchor) && norm(anchor.innerText || anchor.textContent).length > 5)
      .map(anchor => ({ anchor, href: compareProductHref(anchor) }))
      .filter(item => item.href), item => item.href);
  }

  function readCompareCard(anchor, href) {
    let card = null;
    let branch = anchor;
    for (let depth = 0; branch?.parentElement && depth < 12; depth += 1) {
      branch = branch.parentElement;
      const links = compareCardLinks(branch);
      if (links.length > 1) break;
      const labels = qa('[data-auto="product-spec"]', branch);
      if (links.length === 1 && labels.length >= 2) {
        card = branch;
        break;
      }
    }
    if (!card) return null;

    const priceText = qa('[data-zone-name="price"], [data-auto*="price" i], [itemprop="price"], [class*="price" i]', card)
      .filter(isElementVisible)
      .map(node => norm(node.innerText || node.getAttribute('content') || node.getAttribute('aria-label')))
      .find(text => /\d[\d\s\u00a0]*(?:[.,]\d{1,2})?\s*(?:₽|руб(?:\.|лей|ля|ль)?)/i.test(text)) || '';
    const oldPrice = qa('s, del, [class*="oldPrice" i], [class*="old-price" i], [data-auto*="old-price" i]', card)
      .map(node => norm(node.innerText || node.textContent))
      .find(Boolean) || '';
    const specs = [];
    for (const label of qa('[data-auto="product-spec"]', card)) {
      const name = norm(label.innerText || label.textContent);
      const value = findSpecValue(label);
      if (name && value) specs.push({ name, value });
    }
    return {
      title: norm(anchor.innerText || anchor.textContent).replace(/\s+/g, ' '),
      href,
      price: priceText,
      oldPrice,
      specs: uniqueBy(specs, row => `${row.name}\u0000${row.value}`),
    };
  }

  function collectCompareCards() {
    const main = q('main') || document;
    const links = compareCardLinks(main);
    return uniqueBy(links.map(item => readCompareCard(item.anchor, item.href)).filter(Boolean), item => item.href);
  }

  function compareCardsMatrix(cards) {
    if (!cards.length) return [];
    const specNames = uniqueBy(cards.flatMap(card => card.specs.map(spec => spec.name)), name => name);
    const rows = [
      ['Характеристика', ...cards.map(card => card.title)],
      ['Цена', ...cards.map(card => card.price)],
      ['Старая цена', ...cards.map(card => card.oldPrice)],
      ['Ссылка', ...cards.map(card => card.href)],
    ];
    for (const name of specNames) {
      rows.push([name, ...cards.map(card => card.specs.find(spec => spec.name === name)?.value || '')]);
    }
    return rows;
  }

  function csvEscape(value) {
    const text = String(value ?? '').replace(/\r\n?/g, '\n');
    return `"${text.replace(/"/g, '""')}"`;
  }

  function compareMatrixToCsv(matrix) {
    const width = Math.max(0, ...matrix.map(row => row.length));
    return `\uFEFF${matrix.map(row => Array.from({ length: width }, (_, index) => csvEscape(row[index] || '')).join(';')).join('\r\n')}\r\n`;
  }

  async function exportCompareTable(button) {
    setBusy(button, 'Собираю...');
    setStatus('Собираю таблицу сравнения...', 10);
    try {
      await expandComparisonSections();
      const cards = collectCompareCards();
      const nativeMatrix = collectNativeCompareMatrix();
      const cardsMatrix = compareCardsMatrix(cards);
      const matrix = nativeMatrix.length >= cardsMatrix.length && nativeMatrix.length >= 3
        ? nativeMatrix
        : cardsMatrix;
      if (!matrix.length) throw new Error('Не нашёл таблицу сравнения. Обнови страницу и дождись загрузки характеристик.');
      const compareId = location.pathname.split('/').filter(Boolean).pop() || 'table';
      const fileName = sanitizeFileName(`yandex_market_compare_${compareId}_${ts()}`);
      saveText(`${fileName}.csv`, compareMatrixToCsv(matrix), 'text/csv;charset=utf-8');
      setStatus(`Таблица сохранена: ${matrix.length - 1} строк.`, 100);
      notify('Yandex Market', `CSV сохранён: ${fileName}.csv`, 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      notify('Yandex Market', message, 'error');
    } finally {
      restoreBusy(button);
    }
  }

  async function expandComparisonSections() {
    const root = q('main') || document;
    const differencesOnly = qa('input[type="checkbox"]', root).find(input => {
      const label = input.closest('label')?.innerText
        || (input.id ? q(`label[for="${CSS.escape(input.id)}"]`, root)?.innerText : '')
        || input.getAttribute('aria-label')
        || '';
      return input.checked && /только различ|различающ/i.test(norm(label));
    });
    if (differencesOnly) differencesOnly.click();

    const expanders = qa('button, [role="button"], a[href^="#"]', root).filter(el =>
      /все характеристики|показать все|показать полностью|развернуть|ещё характеристики|еще характеристики/i.test(norm(el.innerText || el.textContent))
    );
    for (const control of expanders.slice(0, 40)) {
      try { control.click(); } catch (_) {}
    }
    if (expanders.length) await sleep(350);
  }

  function getBreadcrumbs() {
    const fromJsonLd = getJsonLdBreadcrumbs();
    if (fromJsonLd.length) return fromJsonLd;
    return qa('nav[itemtype*="BreadcrumbList"] [itemprop="name"], nav[aria-label] [itemprop="name"]')
      .map(el => norm(el.innerText || el.textContent))
      .filter(Boolean);
  }

  function collectDomImages(apiaryImages, title) {
    const titleNorm = norm(title).toLowerCase();
    const cleanApiary = (apiaryImages || [])
      .map((image, index) => ({
        ...image,
        index: index + 1,
        url: normalizeMarketImageUrl(image.url),
      }))
      .filter(image => image.url && (!image.title || !titleNorm || norm(image.title).toLowerCase() === titleNorm));

    const urls = [];
    for (const img of qa('img')) {
      if (img.closest('[data-zone-name="review"], [data-zone-name*="review"], [id*="reviewBlock"], [id*="kkmCarousel"], [id*="madvIncut"], [data-zone-name="productSnippet"]')) continue;
      const altTitle = norm(img.alt || img.title || img.getAttribute('aria-label')).toLowerCase();
      if (altTitle && titleNorm && altTitle !== titleNorm) continue;
      const srcs = [
        img.currentSrc,
        img.src,
        img.getAttribute('src'),
        ...(img.getAttribute('srcset') || '').split(',').map(part => part.trim().split(/\s+/)[0]),
      ];
      for (const src of srcs) {
        const url = normalizeMarketImageUrl(src);
        if (url) urls.push(url);
      }
    }

    const extra = uniqueBy(urls, item => item).map((url, index) => ({
      index: index + 1,
      url,
      width: null,
      height: null,
      title,
    }));
    return uniqueBy([...cleanApiary, ...extra], item => item.url).slice(0, Math.max(1, Number(S.get('maxImages')) || 30));
  }

  function collectProductData() {
    const jsonProduct = getJsonLdProduct();
    const apiary = extractApiaryData();
    const title = getDomTitle(jsonProduct, apiary);
    const rating = apiary.rating || jsonProduct.aggregateRating?.ratingValue || '';

    return {
      title,
      url: getCanonicalUrl(jsonProduct),
      marketId: apiary.oskuId || getUrlProductId(),
      productId: apiary.productId,
      skuId: apiary.skuId,
      oskuId: apiary.oskuId,
      offerId: apiary.offerId,
      categoryId: apiary.categoryId,
      brand: apiary.brand || norm(jsonProduct.brand?.name || jsonProduct.brand || q('meta[itemprop="brand"]')?.content),
      seller: apiary.seller,
      price: getDomPrice(apiary, jsonProduct),
      oldPrice: apiary.oldPrice,
      rating: formatRating(rating),
      ratingCount: norm(apiary.ratingCount || jsonProduct.aggregateRating?.ratingCount || ''),
      reviewCount: norm(apiary.reviewCount || jsonProduct.aggregateRating?.reviewCount || ''),
      boughtCount: norm(apiary.boughtCount),
      breadcrumbs: getBreadcrumbs(),
      images: collectDomImages(apiary.images || [], title),
      description: getDomDescription(jsonProduct, apiary),
      characteristics: collectCharacteristics(),
      documents: apiary.documents || [],
      exportedAt: nowIso(),
    };
  }

  function productToMarkdown(product, options = {}) {
    const localImages = options.localImages || null;
    const lines = [];

    lines.push(`# ${product.title || 'Карточка товара Яндекс Маркета'}`);
    lines.push('');
    lines.push(`- URL: ${product.url}`);
    if (product.marketId) lines.push(`- Артикул Маркета: ${product.marketId}`);
    if (product.productId) lines.push(`- Product ID: ${product.productId}`);
    if (product.skuId) lines.push(`- SKU ID: ${product.skuId}`);
    if (product.offerId) lines.push(`- Offer ID: ${product.offerId}`);
    if (product.brand) lines.push(`- Бренд: ${product.brand}`);
    if (product.seller) lines.push(`- Продавец: ${product.seller}`);
    if (product.price) lines.push(`- Цена: ${product.price}`);
    if (product.oldPrice) lines.push(`- Старая цена: ${product.oldPrice}`);
    if (product.rating) {
      const parts = [`${product.rating} / 5`];
      if (product.ratingCount) parts.push(`${product.ratingCount} оценок`);
      if (product.reviewCount) parts.push(`${product.reviewCount} отзывов`);
      lines.push(`- Рейтинг: ${parts.join(', ')}`);
    }
    if (product.boughtCount) lines.push(`- Купили: ${product.boughtCount}`);
    if (product.breadcrumbs?.length) lines.push(`- Категория: ${product.breadcrumbs.join(' > ')}`);
    lines.push(`- Собрано: ${product.exportedAt || nowIso()}`);

    if (S.get('includeImages') && product.images?.length) {
      lines.push('');
      lines.push('## Изображения');
      product.images.forEach((image, index) => {
        const alt = escapeMd(image.title || `${product.title} ${index + 1}`);
        const local = localImages?.[image.url];
        lines.push(`![${alt}](${local ? `images/${local}` : image.url})`);
      });
    }

    if (S.get('includeDescription') && product.description) {
      lines.push('');
      lines.push('## Описание');
      lines.push(product.description);
    }

    if (S.get('includeSpecs') && product.characteristics?.length) {
      lines.push('');
      lines.push('## Характеристики');
      lines.push('| Параметр | Значение |');
      lines.push('|---|---|');
      product.characteristics.forEach(row => {
        lines.push(`| ${escTable(row.name)} | ${escTable(row.value)} |`);
      });
    }

    if (S.get('includeDocuments') && product.documents?.length) {
      lines.push('');
      lines.push('## Документы');
      product.documents.forEach(doc => {
        const meta = [doc.type, doc.size].filter(Boolean).join(', ');
        lines.push(`- [${doc.title || doc.url}](${doc.url})${meta ? ` (${meta})` : ''}`);
      });
    }

    return `${lines.join('\n')}\n`;
  }

  function reviewMediaToUrl(media) {
    const picture = media?.picture;
    if (picture?.namespace && picture?.groupId && picture?.imageName) {
      return absUrl(`https://avatars.mds.yandex.net/get-${picture.namespace}/${picture.groupId}/${picture.imageName}/orig`);
    }
    if (media?.video?.thumbnail) return absUrl(media.video.thumbnail);
    return '';
  }

  function extractReviewFromApiary(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || raw.fixId || raw.reviewId || '').trim();
    const dateText = norm(
      raw.date ||
      raw.creationDate ||
      raw.updateDate ||
      (raw.descriptor || []).map(item => item?.content).find(Boolean)
    );
    const textParts = [
      raw.pro ? `Достоинства: ${norm(raw.pro)}` : '',
      raw.contra ? `Недостатки: ${norm(raw.contra)}` : '',
      raw.comment ? `Комментарий: ${norm(raw.comment)}` : '',
      raw.text ? norm(raw.text) : '',
    ].filter(Boolean);
    const images = (raw.media || []).map(reviewMediaToUrl).filter(Boolean);
    return {
      id,
      author: norm(raw.author?.nickname || raw.author?.name || raw.userName),
      dateText,
      rating: raw.rating || raw.grade || '',
      pro: norm(raw.pro),
      contra: norm(raw.contra),
      comment: norm(raw.comment || raw.text),
      text: uniqueBy(textParts, item => item).join('\n\n'),
      images,
    };
  }

  function collectReviewsFromApiary(patches = getApiaryPatches()) {
    const lists = findDeep(patches, node => Array.isArray(node?.reviews)).flatMap(node => node.reviews);
    const dtoLists = findDeep(patches, node => Array.isArray(node?.reviewsDto?.reviews)).flatMap(node => node.reviewsDto.reviews);
    return uniqueBy([...lists, ...dtoLists].map(extractReviewFromApiary).filter(Boolean), review => review.id || `${review.author}\u0000${review.text}`);
  }

  function reviewCacheKey(review) {
    return review.id || [review.author, review.dateText, review.rating, review.text].map(norm).join('\u0000');
  }

  function reviewToMarkdown(review, index) {
    const head = `### Отзыв ${index}${review.id ? ` (${review.id})` : ''}`;
    const meta = [
      `- Автор: ${review.author || '—'}`,
      `- Дата: ${review.dateText || '—'}`,
      `- Оценка: ${review.rating || '—'}`,
    ].join('\n');
    const body = review.text ? `\n\n> ${review.text.replace(/\n+/g, '\n> ')}` : '\n\n—';
    const images = review.images?.length
      ? `\n\n${review.images.map((url, idx) => `![Фото отзыва ${index}.${idx + 1}](${url})`).join('\n')}`
      : '';
    return `${head}\n\n${meta}${body}${images}\n`;
  }

  function reviewsToMarkdown(reviews, options = {}) {
    const automatic = S.get('reviewRangeMode') === 'auto';
    const from = automatic ? 1 : Math.max(1, parseInt(options.rangeFrom, 10) || 1);
    const to = automatic ? reviews.length : Math.max(from, parseInt(options.rangeTo, 10) || from);
    const sliced = reviews.slice(from - 1, to);
    const product = collectProductData();
    const lines = [
      '# Отзывы Яндекс Маркета',
      '',
      `- Товар: ${product.title}`,
      `- URL: ${product.url}`,
      `- Всего отзывов собрано: ${reviews.length}`,
      `- Диапазон: ${from}-${Math.min(to, Math.max(reviews.length, from - 1))}`,
      `- Собрано: ${nowIso()}`,
      '',
      '## Отзывы',
      '',
    ];
    if (!sliced.length) lines.push('—');
    else sliced.forEach((review, idx) => lines.push(reviewToMarkdown({
      ...review,
      images: options.includeImages === false ? [] : (review.images || []).map(url => options.localImages?.[url] || url),
    }, from + idx)));
    return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
  }

  function modeNeedsReviews(mode = S.get('mode')) {
    return mode === 'reviews' || mode === 'full';
  }

  function isReviewsPage() {
    return /\/reviews(?:\/|$)/i.test(location.pathname);
  }

  function getReviewsPageUrl() {
    const direct = q('a[data-auto="show-more-reviews"][href*="/reviews"]');
    if (direct?.href) return absUrl(direct.href);

    const currentCardReview = qa('a[href*="/reviews"]').find(el => {
      const href = el.getAttribute('href') || '';
      return /\/card\/[^?#]+\/\d+\/reviews(?:[?#]|$)/i.test(href);
    });
    if (currentCardReview?.href) return absUrl(currentCardReview.href);

    const byText = qa('a[href*="/reviews"]').find(el =>
      /^(?:все\s+)?отзывы$|смотреть все отзывы|к отзывам/i.test(norm(el.innerText || el.textContent))
    );
    if (byText?.href) return absUrl(byText.href);

    const pathMatch = location.pathname.match(/^(\/card\/[^/]+\/\d+)(?:\/|$)/i);
    if (!pathMatch) return '';
    const params = new URLSearchParams();
    params.set('businessReviews', 'true');
    const offerId = new URLSearchParams(location.search).get('do-waremd5') || new URLSearchParams(location.search).get('offerId');
    if (offerId) params.set('offerId', offerId);
    return absUrl(`${pathMatch[1]}/reviews?${params.toString()}`);
  }

  function settingsSnapshot() {
    return Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, S.get(key)]));
  }

  function restoreSettingsSnapshot(settings) {
    if (!settings || typeof settings !== 'object') return;
    for (const [key, value] of Object.entries(settings)) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) S.set(key, value);
    }
  }

  function maybeOpenReviewsPageForExport(action) {
    const mode = S.get('mode');
    if (!modeNeedsReviews(mode) || isReviewsPage()) return false;

    const url = getReviewsPageUrl();
    if (!url) return false;

    sessionStorage.setItem(PENDING_EXPORT_KEY, JSON.stringify({
      action,
      settings: settingsSnapshot(),
      createdAt: Date.now(),
      from: location.href,
    }));
    setStatus('Открываю страницу со всеми отзывами...', 5);
    notify('Yandex Market', 'Перехожу на страницу всех отзывов и продолжу экспорт там.', 'info');
    location.href = url;
    return true;
  }

  async function resumePendingReviewsExport() {
    const raw = sessionStorage.getItem(PENDING_EXPORT_KEY);
    if (!raw || !isReviewsPage()) return;

    let pending = null;
    try { pending = JSON.parse(raw); }
    catch (_) { sessionStorage.removeItem(PENDING_EXPORT_KEY); return; }

    if (!pending?.action || Date.now() - Number(pending.createdAt || 0) > 10 * 60 * 1000) {
      sessionStorage.removeItem(PENDING_EXPORT_KEY);
      return;
    }

    sessionStorage.removeItem(PENDING_EXPORT_KEY);
    restoreSettingsSnapshot(pending.settings);
    await sleep(1200);
    setStatus('Продолжаю экспорт со страницы отзывов...', 8);

    if (pending.action === 'copy') await exportMarkdown(null, true);
    else if (pending.action === 'download') await exportMarkdown(null, false);
    else if (pending.action === 'zip') await exportZip(null);
    else if (pending.action === 'json') await exportJson(null);
  }

  function reviewPageUrl(page) {
    const url = new URL(getReviewsPageUrl() || location.href, location.origin);
    url.searchParams.set('page', String(page));
    return url.href;
  }

  function reviewsFromHtml(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    return collectReviewsFromApiary(getApiaryPatches(parsed));
  }

  async function fetchReviewPage(page, signal) {
    const response = await fetch(reviewPageUrl(page), { credentials: 'include', signal });
    if (!response.ok) throw new Error(`Не удалось загрузить страницу отзывов ${page}: HTTP ${response.status}`);
    return reviewsFromHtml(await response.text());
  }

  function stopRequested() {
    if (state.abortController?.signal.aborted) throw new DOMException('Экспорт остановлен.', 'AbortError');
  }

  async function collectReviewsForCurrentMode() {
    const mode = S.get('mode');
    if (mode !== 'reviews' && mode !== 'full') return [];
    if (!isReviewsPage()) throw new Error('Для сбора отзывов сначала откройте страницу «Все отзывы».');

    const automatic = S.get('reviewRangeMode') === 'auto';
    const from = Math.max(1, parseInt(S.get('rangeFrom'), 10) || 1);
    const to = Math.max(from, parseInt(S.get('rangeTo'), 10) || from);
    const target = automatic ? Number.MAX_SAFE_INTEGER : to;
    const collected = new Map();
    const startPage = 1;

    for (let page = startPage; page <= CONFIG.MAX_REVIEW_PAGES; page += 1) {
      stopRequested();
      const countBeforePage = collected.size;
      let pageReviews;
      if (page === 1) pageReviews = collectReviewsFromApiary();
      else {
        await sleep(250);
        stopRequested();
        pageReviews = await fetchReviewPage(page, state.abortController?.signal);
      }
      if (!pageReviews.length) break;
      for (const review of pageReviews) collected.set(reviewCacheKey(review), review);
      if (page > 1 && collected.size === countBeforePage) break;

      const filteredCount = Array.from(collected.values()).filter(review =>
        !S.get('onlyWithPhotos') || review.images?.length
      ).length;
      setStatus(
        automatic ? `Загружено отзывов: ${filteredCount}` : `Загружено отзывов: ${Math.min(filteredCount, to)}/${to}`,
        Math.min(72, 12 + (page / Math.max(1, Math.ceil(to / 20))) * 40)
      );
      if (!automatic && filteredCount >= to) break;
    }

    const reviews = Array.from(collected.values()).filter(review =>
      !S.get('onlyWithPhotos') || review.images?.length
    );
    return reviews;
  }

  async function buildMarkdown(mode = S.get('mode')) {
    const product = collectProductData();
    const reviews = await collectReviewsForCurrentMode();
    const from = S.get('rangeFrom');
    const to = S.get('rangeTo');
    if (mode === 'product') return productToMarkdown(product);
    if (mode === 'reviews') return reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, includeImages: S.get('includeImages') });
    return `${productToMarkdown(product).trim()}\n\n${reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, includeImages: S.get('includeImages') }).trim()}\n`;
  }

  function makeBaseName(mode = S.get('mode')) {
    const product = collectProductData();
    return sanitizeFileName(`yandex_market_${mode}_${product.marketId || slug(product.title)}_${ts()}`);
  }

  function makeImageFileName(image, usedNames) {
    let ext = guessExtFromUrl(image.url) || 'jpg';
    let name = `image_${String(image.index || usedNames.size + 1).padStart(2, '0')}.${ext}`;
    let counter = 2;
    while (usedNames.has(name)) {
      name = `image_${String(image.index || usedNames.size + 1).padStart(2, '0')}_${counter}.${ext}`;
      counter += 1;
    }
    usedNames.add(name);
    return name;
  }

  function updateZipProgress(button, meta) {
    const now = Date.now();
    if (now - lastZipProgressTs < CONFIG.ZIP_PROGRESS_THROTTLE_MS && (meta.percent || 0) < 100) return;
    lastZipProgressTs = now;
    const percent = Math.max(0, Math.min(100, Math.round(meta.percent || 0)));
    setBusy(button, percent < 100 ? `ZIP ${percent}%` : 'Сохранение');
    setStatus(percent < 100 ? `Упаковываю ZIP... ${percent}%` : 'Сохраняю ZIP...', 78 + Math.round(percent * 0.2));
  }

  async function exportMarkdown(button, copy = false) {
    if (maybeOpenReviewsPageForExport(copy ? 'copy' : 'download')) return;
    beginAbortableExport();
    setBusy(button, copy ? 'Копирую...' : 'MD...');
    setStatus(copy ? 'Готовлю Markdown для буфера...' : 'Готовлю Markdown...', 12);
    try {
      await waitForPaint();
      const mode = S.get('mode');
      const md = await buildMarkdown(mode);
      if (copy) {
        const ok = await copyToClipboard(md);
        if (!ok) throw new Error('Не удалось скопировать Markdown в буфер обмена.');
        setStatus('Markdown скопирован.', 100);
        notify('Yandex Market', 'Markdown скопирован.', 'ok');
      } else {
        saveText(`${makeBaseName(mode)}.md`, md, 'text/markdown;charset=utf-8');
        setStatus('Markdown сохранён.', 100);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stopped = error?.name === 'AbortError';
      setStatus(stopped ? 'Экспорт остановлен.' : message);
      if (!stopped) notify('Yandex Market', message, 'error');
    } finally {
      endAbortableExport();
      restoreBusy(button);
    }
  }

  async function exportZip(button) {
    if (maybeOpenReviewsPageForExport('zip')) return;
    beginAbortableExport();
    const mode = S.get('mode');
    const includeImages = S.get('includeProductImages');
    const from = S.get('rangeFrom');
    const to = S.get('rangeTo');
    setBusy(button, 'ZIP...');
    setStatus('Собираю данные...', 4);
    await waitForPaint();

    try {
      const product = collectProductData();
      const reviews = await collectReviewsForCurrentMode();
      const selectedReviews = S.get('reviewRangeMode') === 'auto' ? reviews : reviews.slice(from - 1, to);
      const zipEntries = [];
      const warnings = [];
      const usedNames = new Set();
      const localImages = {};
      const imagesMeta = [];

      if (includeImages && product.images?.length) {
        for (let i = 0; i < product.images.length; i += 1) {
          stopRequested();
          const image = product.images[i];
          const baseFileName = makeImageFileName(image, usedNames).replace(/\.[^.]+$/i, '');
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
              bytes: buffer.byteLength,
            });
            zipEntries.push({ name: `images/${localName}`, data: buffer });
          } catch (error) {
            warnings.push({
              index: image.index,
              url: image.url,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      const productWithImageMeta = {
        ...product,
        images: product.images.map(image => ({
          ...image,
          localName: localImages[image.url] || '',
        })),
      };

      const localReviewImages = {};
      if (S.get('includeReviewImages') && mode !== 'product') {
        const reviewJobs = [];
        for (const [reviewIndex, review] of selectedReviews.entries()) {
          for (const [imageIndex, url] of (review.images || []).entries()) {
            if (reviewJobs.length >= Math.max(1, Number(S.get('maxReviewImages')) || 100)) break;
            reviewJobs.push({ reviewIndex, imageIndex, review, url });
          }
          if (reviewJobs.length >= Math.max(1, Number(S.get('maxReviewImages')) || 100)) break;
        }
        for (let i = 0; i < reviewJobs.length; i += 1) {
          stopRequested();
          const job = reviewJobs[i];
          setStatus(`Скачиваю фото отзывов: ${i + 1}/${reviewJobs.length}`, 68 + (i / Math.max(1, reviewJobs.length)) * 8);
          try {
            const { buffer, contentType, finalUrl, usedUrl } = await fetchImageBinary({ url: job.url, index: job.imageIndex + 1 });
            const name = ensureExtension(`review_${job.review.id || job.reviewIndex + 1}_${job.imageIndex + 1}`, contentType, usedUrl || finalUrl || job.url);
            const path = `review-images/${name}`;
            zipEntries.push({ name: path, data: buffer });
            localReviewImages[job.url] = path;
            imagesMeta.push({ kind: 'review', reviewId: job.review.id, url: job.url, localName: path, bytes: buffer.byteLength });
          } catch (error) {
            warnings.push({ reviewId: job.review.id, url: job.url, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }

      const exportMarkdown = mode === 'reviews'
        ? reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, includeImages: S.get('includeImages'), localImages: localReviewImages })
        : mode === 'product'
          ? productToMarkdown(productWithImageMeta, { localImages })
          : `${productToMarkdown(productWithImageMeta, { localImages }).trim()}\n\n${reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, includeImages: S.get('includeImages'), localImages: localReviewImages }).trim()}\n`;

      zipEntries.push({ name: 'export.md', data: exportMarkdown });
      zipEntries.push({ name: 'product.json', data: JSON.stringify(productWithImageMeta, null, 2) });
      if (mode !== 'reviews') zipEntries.push({ name: 'product.md', data: productToMarkdown(productWithImageMeta, { localImages }) });
      if (mode !== 'product') {
        zipEntries.push({ name: 'reviews.md', data: reviewsToMarkdown(reviews, { rangeFrom: from, rangeTo: to, includeImages: S.get('includeImages'), localImages: localReviewImages }) });
        zipEntries.push({ name: 'reviews.json', data: JSON.stringify(selectedReviews, null, 2) });
      }
      if (imagesMeta.length) zipEntries.push({ name: 'images.json', data: JSON.stringify(imagesMeta, null, 2) });
      if (warnings.length) zipEntries.push({ name: 'warnings.json', data: JSON.stringify(warnings, null, 2) });

      setBusy(button, 'Упаковка...');
      setStatus('Упаковываю ZIP...', 78);
      await waitForPaint();
      lastZipProgressTs = 0;
      const blob = buildStoreZip(zipEntries, meta => updateZipProgress(button, meta));
      if (!blob.size) throw new Error('ZIP получился пустым.');
      const filename = `${makeBaseName(mode)}.zip`;
      saveBlob(filename, blob);
      setStatus(warnings.length ? `ZIP сохранён, но есть предупреждения: ${warnings.length}` : 'ZIP сохранён.', 100);
      notify(
        'Yandex Market',
        warnings.length ? `ZIP готов. Не скачано изображений: ${warnings.length}. Подробности в warnings.json.` : `ZIP сохранён: ${filename}`,
        warnings.length ? 'warn' : 'ok'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stopped = error?.name === 'AbortError';
      setStatus(stopped ? 'Экспорт остановлен.' : message);
      if (!stopped) notify('Yandex Market', message, 'error');
    } finally {
      endAbortableExport();
      restoreBusy(button);
    }
  }

  async function exportJson(button) {
    if (maybeOpenReviewsPageForExport('json')) return;
    beginAbortableExport();
    setBusy(button, 'JSON...');
    setStatus('Собираю JSON...');
    try {
      await waitForPaint();
      const product = collectProductData();
      const reviews = await collectReviewsForCurrentMode();
      const from = Math.max(1, parseInt(S.get('rangeFrom'), 10) || 1);
      const to = Math.max(from, parseInt(S.get('rangeTo'), 10) || from);
      const selectedReviews = S.get('reviewRangeMode') === 'auto' ? reviews : reviews.slice(from - 1, to);
      saveText(`${makeBaseName(S.get('mode'))}.json`, JSON.stringify({ product, reviews: selectedReviews }, null, 2), 'application/json;charset=utf-8');
      setStatus('JSON сохранён.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stopped = error?.name === 'AbortError';
      setStatus(stopped ? 'Экспорт остановлен.' : message);
      if (!stopped) notify('Yandex Market', message, 'error');
    } finally {
      endAbortableExport();
      restoreBusy(button);
    }
  }

  function addStyle() {
    if (typeof GM_addStyle !== 'function') return;
    GM_addStyle(`
      #${TOAST_ROOT_ID}{position:fixed;right:18px;bottom:96px;z-index:2147483647;display:grid;gap:8px;pointer-events:none}
      .ymmd-toast{max-width:360px;padding:11px 14px;border-radius:8px;background:#222;color:#fff;font:13px/1.4 Arial,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.22)}
      .ymmd-toast.ok{background:#16844a}.ymmd-toast.error{background:#b3261e}
      #${UI_ROOT_ID}{position:fixed;right:20px;bottom:20px;z-index:2147483646;color:#222;font:14px/1.4 Arial,sans-serif}
      .ymmd-trigger{width:52px;height:52px;border:0;border-radius:50%;background:#fc0;color:#222;font-size:18px;font-weight:700;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.22)}
      .ymmd-panel{position:absolute;right:0;bottom:64px;width:min(400px,calc(100vw - 32px));max-height:min(82vh,760px);overflow:auto;display:none;padding:0;border:1px solid #e5e5e5;border-radius:10px;background:#fff;box-shadow:0 12px 36px rgba(0,0,0,.24)}
      .ymmd-panel.open{display:block}.ymmd-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid #eee}
      .ymmd-title{margin:0;font-size:17px;line-height:1.2;font-weight:700}.ymmd-close{width:32px;height:32px;border:0;border-radius:50%;background:transparent;color:#555;cursor:pointer;font-size:22px;line-height:1}
      .ymmd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:14px 18px 6px}
      .ymmd-btn{min-height:38px;border:0;border-radius:6px;padding:8px 9px;cursor:pointer;font:700 13px/1.2 Arial,sans-serif;color:#222;background:#f2f2f2}
      .ymmd-btn.primary{background:#fc0}.ymmd-btn.secondary{background:#f2f2f2}.ymmd-btn.zip{background:#222;color:#fff}.ymmd-btn.danger{color:#b3261e;background:#fff0ef}.ymmd-btn:disabled{opacity:.55;cursor:wait}
      #${UI_ROOT_ID} [hidden]{display:none!important}.ymmd-section{padding:12px 18px;border-top:1px solid #eee}.ymmd-section-title{margin:0 0 10px;color:#666;font-size:12px;font-weight:700}
      .ymmd-compare-tools{padding:16px 18px}.ymmd-compare-tools .ymmd-btn{width:100%}.ymmd-compare-note{margin:0 0 10px;color:#666;font-size:12px}
      .ymmd-options{display:grid;gap:10px}.ymmd-label{display:grid;gap:6px;color:#333;font-weight:600}
      .ymmd-select{width:100%;min-height:38px;padding:8px 10px;border:1px solid #d8d8d8;border-radius:6px;background:#fff;color:#222;font:inherit}
      .ymmd-check{display:flex;align-items:center;gap:8px;color:#333;font-size:13px}.ymmd-check input{width:17px;height:17px;margin:0;accent-color:#222}
      .ymmd-row{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#333;font-size:13px}.ymmd-row input[type=number]{width:94px;min-height:34px;padding:5px 8px;border:1px solid #d8d8d8;border-radius:6px;color:#222;font:inherit}
      .ymmd-status-wrap{padding:10px 18px 16px}.ymmd-status{min-height:18px;color:#666;font-size:12px}.ymmd-progress{height:4px;margin-top:10px;border-radius:999px;overflow:hidden;background:#eee}
      .ymmd-progress>span{display:block;height:100%;width:0%;background:#222;transition:width .16s ease}
      @media(max-width:520px){#${UI_ROOT_ID}{right:12px;bottom:12px}.ymmd-panel{right:0;width:calc(100vw - 24px);max-height:84vh}}
    `);
  }

  function ensureUi() {
    if (document.getElementById(UI_ROOT_ID)) return;
    addStyle();

    const root = document.createElement('div');
    root.id = UI_ROOT_ID;

    const panel = document.createElement('div');
    panel.className = 'ymmd-panel';
    panel.innerHTML = `
      <div class="ymmd-head">
        <h3 class="ymmd-title">Яндекс Маркет → Markdown</h3>
        <button class="ymmd-close" type="button" title="Закрыть">×</button>
      </div>
      <div class="ymmd-grid">
        <button class="ymmd-btn primary" data-act="copy" type="button">Копировать</button>
        <button class="ymmd-btn secondary" data-act="download" type="button">MD</button>
        <button class="ymmd-btn zip" data-act="zip" type="button">ZIP</button>
      </div>
      <section class="ymmd-section ymmd-product-options">
      <p class="ymmd-section-title">СОДЕРЖИМОЕ</p>
      <div class="ymmd-options">
        <label class="ymmd-label">Что сохранить
          <select class="ymmd-select" data-k="mode">
            <option value="full">Товар + отзывы</option>
            <option value="product">Только товар</option>
            <option value="reviews">Только отзывы</option>
          </select>
        </label>
      </div>
      </section>
      <section class="ymmd-section ymmd-review-options">
      <p class="ymmd-section-title">ОТЗЫВЫ</p>
      <div class="ymmd-options">
        <label class="ymmd-label">Количество
          <select class="ymmd-select" data-k="reviewRangeMode"><option value="range">Заданный диапазон</option><option value="auto">Все доступные</option></select>
        </label>
        <label class="ymmd-row ymmd-range-field">С отзыва № <input data-k="rangeFrom" type="number" min="1" step="1"></label>
        <label class="ymmd-row ymmd-range-field">По отзыв № <input data-k="rangeTo" type="number" min="1" step="1"></label>
        <label class="ymmd-check"><input data-k="onlyWithPhotos" type="checkbox">Только отзывы с фото</label>
        <label class="ymmd-check"><input data-k="includeReviewImages" type="checkbox">Фото отзывов в ZIP</label>
        <label class="ymmd-row ymmd-review-image-limit">Макс. фото отзывов <input data-k="maxReviewImages" type="number" min="1" max="500" step="1"></label>
      </div>
      </section>
      <section class="ymmd-section ymmd-product-image-options">
      <p class="ymmd-section-title">КАРТОЧКА ТОВАРА</p>
      <div class="ymmd-options">
        <label class="ymmd-check"><input data-k="includeImages" type="checkbox">Изображения</label>
        <label class="ymmd-check"><input data-k="includeProductImages" type="checkbox">Картинки в ZIP</label>
        <label class="ymmd-check"><input data-k="includeDescription" type="checkbox">Описание</label>
        <label class="ymmd-check"><input data-k="includeSpecs" type="checkbox">Характеристики</label>
        <label class="ymmd-check"><input data-k="includeDocuments" type="checkbox">Документы</label>
        <label class="ymmd-row">Макс. изображений <input data-k="maxImages" type="number" min="1" max="80" step="1"></label>
      </div>
      </section>
      <div class="ymmd-grid">
        <button class="ymmd-btn secondary" data-act="json" type="button">JSON</button>
        <button class="ymmd-btn danger" data-act="stop" type="button" disabled>Остановить</button>
      </div>
      <div class="ymmd-compare-tools" hidden>
        <p class="ymmd-compare-note">Товары, цены и характеристики со страницы сравнения.</p>
        <button class="ymmd-btn primary" data-act="compare-csv" type="button">Скачать таблицу CSV</button>
      </div>
      <div class="ymmd-status-wrap"><div class="ymmd-status">Готово.</div>
      <div class="ymmd-progress" hidden><span></span></div>
      </div>
    `;

    const trigger = document.createElement('button');
    trigger.className = 'ymmd-trigger';
    trigger.type = 'button';
    trigger.title = 'Yandex Market Markdown';
    trigger.textContent = 'Я';

    root.appendChild(panel);
    root.appendChild(trigger);
    document.documentElement.appendChild(root);

    state.statusEl = q('.ymmd-status', panel);
    state.progressEl = q('.ymmd-progress', panel);
    state.progressBarEl = q('.ymmd-progress > span', panel);

    const compareMode = isComparePage();
    q('.ymmd-title', panel).textContent = compareMode ? 'Сравнение товаров' : 'Экспорт товара';
    qa('.ymmd-grid, .ymmd-section', panel).forEach(el => { el.hidden = compareMode; });
    q('.ymmd-compare-tools', panel).hidden = !compareMode;
    state.stopButton = q('[data-act="stop"]', panel);

    for (const input of qa('[data-k]', panel)) {
      const key = input.getAttribute('data-k');
      if (input.type === 'checkbox') input.checked = Boolean(S.get(key));
      else input.value = S.get(key);
    }

    trigger.addEventListener('click', () => panel.classList.toggle('open'));
    q('.ymmd-close', panel).addEventListener('click', () => panel.classList.remove('open'));
    updateReviewControls();

    panel.addEventListener('change', event => {
      const el = event.target;
      const key = el?.getAttribute?.('data-k');
      if (!key) return;
      if (el.type === 'checkbox') S.set(key, el.checked);
      else if (el.type === 'number') S.set(key, Math.min(Number(el.max) || 10000, Math.max(1, parseInt(el.value, 10) || 1)));
      else S.set(key, el.value);
      if (key === 'reviewRangeMode' || key === 'onlyWithPhotos' || key === 'includeReviewImages') updateReviewControls();
    });

    panel.addEventListener('click', event => {
      const button = event.target.closest('button[data-act]');
      if (!button) return;
      const action = button.getAttribute('data-act');
      if (action === 'stop') { state.abortController?.abort(); setStatus('Останавливаю экспорт...', 0); return; }
      if (action === 'copy') exportMarkdown(button, true);
      if (action === 'download') exportMarkdown(button, false);
      if (action === 'zip') exportZip(button);
      if (action === 'json') exportJson(button);
      if (action === 'compare-csv') exportCompareTable(button);
    });
  }

  function updateReviewControls() {
    const panel = document.getElementById(UI_ROOT_ID);
    if (!panel) return;
    const automatic = q('[data-k="reviewRangeMode"]', panel)?.value === 'auto';
    qa('.ymmd-range-field', panel).forEach(el => { el.hidden = automatic; });
    q('.ymmd-review-image-limit', panel).hidden = !q('[data-k="includeReviewImages"]', panel)?.checked;
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Yandex Market: Скачать таблицу сравнения CSV', () => exportCompareTable(null));
    GM_registerMenuCommand('Yandex Market: ZIP', () => exportZip(null));
    GM_registerMenuCommand('Yandex Market: Копировать Markdown', () => exportMarkdown(null, true));
    GM_registerMenuCommand('Yandex Market: Скачать Markdown', () => exportMarkdown(null, false));
    GM_registerMenuCommand('Yandex Market: Скачать JSON', () => exportJson(null));
  }

  ensureUi();
  resumePendingReviewsExport().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message);
    notify('Yandex Market', message, 'error');
  });
  const observer = new MutationObserver(() => ensureUi());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();


