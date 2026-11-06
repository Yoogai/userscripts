// ==UserScript==
// @name         DNS → Markdown Catalog Exporter
// @namespace    https://github.com/Yoogai/userscripts
// @version      1.0.0
// @description  Выгружает товары из каталога DNS в структурированный Markdown для ИИ.
// @homepageURL  https://github.com/Yoogai/userscripts
// @downloadURL  https://raw.githubusercontent.com/Yoogai/userscripts/main/dns-shop-catalog-to-markdown.user.js
// @updateURL    https://raw.githubusercontent.com/Yoogai/userscripts/main/dns-shop-catalog-to-markdown.user.js
// @match        *://www.dns-shop.ru/catalog/*
// @match        *://dns-shop.ru/catalog/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_ID = 'dns-ai-export-root';
  const SUPPLIED_CARD_SELECTOR = '#p-aK9K3';
  const CARD_PREFIX_SELECTOR = '[id^="p-"], [class^="p-"], [class*=" p-"]';
  const PRODUCT_PATH = /\/product\//i;
  const PRICE_PATTERN = /\d[\d\s\u00a0]*(?:[.,]\d{1,2})?\s*₽/u;
  const PAGE_PARAM = /^(?:page|p|page_num|pageNumber|pageNo|pageno)$/i;
  const SPEC_LABELS = [
    'Слотов PCI-E x16',
    'Форм-фактор',
    'Слотов памяти',
    'Портов SATA',
    'Сокет',
  ];
  const SPEC_LABEL_PATTERN = new RegExp(
    '(' + SPEC_LABELS.join('|') + ')\\s*:?\\s*',
    'giu',
  );

  let busy = false;
  let observer = null;

  function cleanText(value) {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
  }

  function flatText(element) {
    return cleanText(element?.innerText || element?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function canonicalProductUrl(anchor, baseUrl) {
    try {
      const url = new URL(anchor.getAttribute('href') || anchor.href, baseUrl || location.href);
      if (!PRODUCT_PATH.test(url.pathname)) return '';
      url.hash = '';
      url.search = '';
      return url.href.replace(/\/$/, '');
    } catch (_) {
      return '';
    }
  }

  function directProductLinks(root) {
    const links = [];
    if (root?.matches?.('a[href]')) links.push(root);
    if (root?.querySelectorAll) links.push(...root.querySelectorAll('a[href]'));
    return links;
  }

  function uniqueProductUrls(root, baseUrl) {
    return [...new Set(directProductLinks(root)
      .map(anchor => canonicalProductUrl(anchor, baseUrl))
      .filter(Boolean))];
  }

  function hasPrice(text) {
    return PRICE_PATTERN.test(String(text || ''));
  }

  function isCardCandidate(element, baseUrl) {
    if (!element || element === document.body || element === document.documentElement) return false;
    if (uniqueProductUrls(element, baseUrl).length !== 1) return false;
    return hasPrice(element.innerText || element.textContent);
  }

  function findCardRoot(anchor, baseUrl) {
    const hinted = anchor.closest(SUPPLIED_CARD_SELECTOR);
    if (isCardCandidate(hinted, baseUrl)) return hinted;

    let node = anchor;
    for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
      if (node.matches?.(CARD_PREFIX_SELECTOR) && isCardCandidate(node, baseUrl)) return node;
    }

    return null;
  }

  function anchorScore(anchor) {
    return [
      flatText(anchor).length,
      cleanText(anchor.getAttribute('aria-label')).length,
      cleanText(anchor.getAttribute('title')).length,
    ].reduce((sum, value) => sum + value, 0);
  }

  function extractPrice(card, text) {
    const nodes = [...card.querySelectorAll(
      '[itemprop="price"], [class*="price" i], [data-testid*="price" i], [data-role*="price" i]',
    )];
    const values = nodes.map(node =>
      cleanText(node.getAttribute('content') || node.innerText || node.textContent),
    );
    const preferred = values.find(value =>
      value.includes('₽') && !/\/\s*мес|в\s*месяц/i.test(value),
    );
    if (preferred) {
      const match = preferred.match(PRICE_PATTERN);
      if (match) return cleanText(match[0]);
    }

    const match = String(text || '').match(PRICE_PATTERN);
    return match ? cleanText(match[0]) : '';
  }

  function extractRating(text) {
    const match = String(text || '').match(
      /(\d+(?:[.,]\d+)?)\s*\|\s*(\d[\d\s]*)\s*отзыв[а-яё]*/iu,
    );
    if (!match) return null;
    return {
      score: match[1].replace(',', '.'),
      reviews: match[2].replace(/\s+/g, ''),
    };
  }

  function extractAvailability(card) {
    const lines = cleanText(card.innerText || card.textContent)
      .split('\n')
      .map(line => cleanText(line))
      .filter(Boolean)
      .filter(line => /в наличии|при заказе|пункты выдачи|доставим/i.test(line));

    if (lines.length) return [...new Set(lines)].slice(0, 6);

    const text = flatText(card);
    const matches = text.match(
      /(?:В наличии|При заказе|Пункты выдачи|Доставим на дом)(?:\s+[^.]{0,55})?/giu,
    );
    return matches ? [...new Set(matches.map(cleanText))].slice(0, 6) : [];
  }

  function extractSpecs(text) {
    const source = String(text || '');
    const matches = [...source.matchAll(SPEC_LABEL_PATTERN)];
    const specs = [];

    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const valueStart = match.index + match[0].length;
      const nextStart = matches[index + 1]?.index ?? source.length;
      let value = source.slice(valueStart, nextStart);

      const stops = [
        value.search(/\d[\d\s\u00a0]*(?:[.,]\d{1,2})?\s*₽/u),
        value.search(/\b(?:в наличии|при заказе|пункты выдачи|доставим|сравнить|купить)\b/i),
      ].filter(position => position >= 0);
      if (stops.length) value = value.slice(0, Math.min(...stops));

      value = cleanText(value.replace(/^[\s:–—-]+|[\s:–—-]+$/g, ''));
      if (value && value.length <= 100) {
        specs.push({ name: match[1], value });
      }
    }

    return specs;
  }

  function extractProduct(anchor, url, baseUrl, card) {
    const text = cleanText(card.innerText || card.textContent);
    const titleCandidates = [
      flatText(anchor),
      cleanText(anchor.getAttribute('aria-label')),
      cleanText(anchor.getAttribute('title')),
      flatText(card.querySelector('h2, h3, [class*="title" i]')),
    ].filter(value => value && value.length > 5);

    return {
      title: titleCandidates[0] || 'Товар DNS',
      url,
      price: extractPrice(card, text),
      rating: extractRating(flatText(card)),
      availability: extractAvailability(card),
      specs: extractSpecs(flatText(card)),
    };
  }

  function collectProducts(root, baseUrl) {
    const grouped = new Map();
    for (const anchor of root.querySelectorAll('a[href]')) {
      const card = findCardRoot(anchor, baseUrl);
      if (!card) continue;
      const url = canonicalProductUrl(anchor, baseUrl);
      if (!url) continue;
      const current = grouped.get(url);
      if (!current || anchorScore(anchor) > anchorScore(current)) {
        grouped.set(url, { anchor, card });
      }
    }

    return [...grouped.entries()]
      .map(([url, item]) => extractProduct(item.anchor, url, baseUrl, item.card))
      .filter(product => product.title || product.price);
  }

  function pageNumberFromUrl(url) {
    for (const [key, value] of url.searchParams.entries()) {
      if (PAGE_PARAM.test(key) && /^\d+$/.test(value)) return Number(value);
    }
    return null;
  }

  function pageNumberFromTitle(title) {
    const match = String(title || '').match(/страниц[аы]?\s+(\d+)\s+из\s+(\d+)/i);
    return match ? Number(match[1]) : 1;
  }

  function pageCountFromTitle(title) {
    const match = String(title || '').match(/страниц[аы]?\s+\d+\s+из\s+(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function sameListing(url, current) {
    if (url.origin !== current.origin || url.pathname !== current.pathname) return false;
    for (const [key, value] of current.searchParams.entries()) {
      if (PAGE_PARAM.test(key)) continue;
      if (url.searchParams.getAll(key).join('\u0000') !== current.searchParams.getAll(key).join('\u0000')) {
        return false;
      }
    }
    return true;
  }

  function getPageTargets() {
    const current = new URL(location.href);
    const currentPage = pageNumberFromUrl(current) || pageNumberFromTitle(document.title);
    const targets = new Map([[currentPage, current.href]]);

    for (const anchor of document.querySelectorAll('a[href]')) {
      const label = cleanText(anchor.innerText || anchor.textContent);
      if (!/^\d{1,3}$/.test(label)) continue;

      try {
        const url = new URL(anchor.getAttribute('href'), current.href);
        if (!sameListing(url, current)) continue;
        const page = Number(label);
        if (page > 0) targets.set(page, url.href);
      } catch (_) {}
    }

    return {
      currentPage,
      pageCount: pageCountFromTitle(document.title),
      targets,
    };
  }

  function totalProductCount() {
    const text = cleanText(document.querySelector('h1')?.innerText || document.body.innerText.slice(0, 5000));
    const match = text.match(/(\d[\d\s]*)\s+товар(?:а|ов)?\b/i);
    return match ? Number(match[1].replace(/\s+/g, '')) : null;
  }

  function categoryName() {
    return cleanText(document.querySelector('h1')?.innerText || '')
      .replace(/\s+\d[\d\s]*\s+товар(?:а|ов)?\b/i, '')
      .trim();
  }

  function escapeMarkdown(value) {
    const tick = String.fromCharCode(96);
    return String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/([*_{}\[\]<>|])/g, '\\$1')
      .split(tick).join('\\' + tick);
  }

  function buildMarkdown(products, pageCount) {
    const count = totalProductCount();
    const lines = [
      '# Товары из DNS',
      '',
      '- Категория: ' + escapeMarkdown(categoryName() || 'Каталог'),
      '- Запрос: ' + escapeMarkdown(new URL(location.href).searchParams.get('q') || '—'),
      '- DNS сообщает товаров: ' + (count ?? 'не указано'),
      '- Выгружено: ' + products.length,
      '- Страниц: ' + (pageCount ?? 'не указано'),
      '- Дата сбора: ' + new Date().toISOString(),
      '- Страница выдачи: <' + location.href + '>',
    ];

    products.forEach((product, index) => {
      lines.push('', '## ' + (index + 1) + '. ' + escapeMarkdown(product.title));
      lines.push('- Ссылка: <' + product.url + '>');
      lines.push('- Цена: ' + (product.price ? escapeMarkdown(product.price) : 'не указана'));

      if (product.rating) {
        lines.push('- Рейтинг: ' + product.rating.score + '/5; отзывов: ' + product.rating.reviews);
      } else {
        lines.push('- Рейтинг и отзывы: не указаны');
      }

      if (product.availability.length) {
        lines.push('- Наличие и доставка: ' + product.availability.map(escapeMarkdown).join('; '));
      } else {
        lines.push('- Наличие и доставка: не указаны');
      }

      if (product.specs.length) {
        lines.push('- Характеристики:');
        product.specs.forEach(spec => {
          lines.push('  - ' + escapeMarkdown(spec.name) + ': ' + escapeMarkdown(spec.value));
        });
      }
    });

    return lines.join('\n') + '\n';
  }

  function slug(value) {
    return String(value || 'catalog')
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/giu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'catalog';
  }

  function setStatus(message, isError = false) {
    const status = document.querySelector('#' + ROOT_ID + ' [data-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.error = isError ? 'true' : 'false';
  }

  async function copyMarkdown(markdown) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(markdown, 'text');
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      return;
    }
    throw new Error('Браузер не разрешил копирование. Скачайте Markdown-файл.');
  }

  function downloadMarkdown(markdown) {
    const query = new URL(location.href).searchParams.get('q');
    const filename = 'dns-' + slug(query || categoryName()) + '-' +
      new Date().toISOString().slice(0, 10) + '.md';
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  async function collectAllPages() {
    const pageInfo = getPageTargets();
    if (pageInfo.pageCount && pageInfo.targets.size < pageInfo.pageCount) {
      throw new Error(
        'DNS сообщает ' + pageInfo.pageCount +
        ' страниц, но ссылки на все страницы не найдены. Экспорт остановлен, чтобы не выдать неполный список.',
      );
    }

    const pages = [...pageInfo.targets.entries()].sort((a, b) => a[0] - b[0]);
    const productsByUrl = new Map();

    for (const [page, url] of pages) {
      let pageProducts;
      if (page === pageInfo.currentPage) {
        pageProducts = collectProducts(document, location.href);
      } else {
        setStatus('Читаю страницу ' + page + ' из ' + pages.length + '…');
        await delay(450);

        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
          throw new Error('Не удалось прочитать страницу ' + page + ': HTTP ' + response.status + '.');
        }

        const html = await response.text();
        const pageDocument = new DOMParser().parseFromString(html, 'text/html');
        pageProducts = collectProducts(pageDocument, url);
      }

      if (!pageProducts.length) {
        throw new Error('На странице ' + page + ' не нашёл карточки товаров. Выгрузка остановлена.');
      }

      for (const product of pageProducts) {
        if (!productsByUrl.has(product.url)) productsByUrl.set(product.url, product);
      }
    }

    return {
      products: [...productsByUrl.values()],
      pageCount: pageInfo.pageCount || pages.length,
    };
  }

  async function runExport(action) {
    if (busy) return;
    busy = true;
    const buttons = document.querySelectorAll('#' + ROOT_ID + ' [data-action]');
    buttons.forEach(button => { button.disabled = true; });

    try {
      setStatus('Собираю товары…');
      const result = await collectAllPages();
      if (!result.products.length) {
        throw new Error('Не нашёл карточки товаров. Возможно, DNS изменил разметку страницы.');
      }

      const markdown = buildMarkdown(result.products, result.pageCount);
      if (action === 'copy') {
        await copyMarkdown(markdown);
        setStatus('Готово: ' + result.products.length + ' товаров скопировано в Markdown.');
      } else {
        downloadMarkdown(markdown);
        setStatus('Готово: ' + result.products.length + ' товаров сохранено в Markdown.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function updatePosition() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    let bottom = 92;
    let right = 20;
    const scrollTop = document.querySelector('.scroll-top');
    if (scrollTop) {
      const rect = scrollTop.getBoundingClientRect();
      const style = getComputedStyle(scrollTop);
      if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
        bottom = Math.max(72, window.innerHeight - rect.top + 10);
        right = Math.max(12, window.innerWidth - rect.right);
      }
    }

    root.style.setProperty('--dns-export-bottom', bottom + 'px');
    root.style.setProperty('--dns-export-right', right + 'px');
  }

  function addStyles() {
    const css = [
      '#dns-ai-export-root{position:fixed;right:var(--dns-export-right,20px);bottom:var(--dns-export-bottom,92px);z-index:2147483000;font:14px/1.4 Arial,sans-serif;color:#222}',
      '#dns-ai-export-root *{box-sizing:border-box}',
      '#dns-ai-export-root .dns-export-trigger{width:52px;height:52px;border:0;border-radius:50%;background:#f58220;color:#fff;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.24)}',
      '#dns-ai-export-root .dns-export-trigger:hover{background:#e66f10}',
      '#dns-ai-export-root .dns-export-panel{position:absolute;right:0;bottom:60px;width:min(340px,calc(100vw - 28px));padding:16px;border:1px solid #e5e5e5;border-radius:10px;background:#fff;box-shadow:0 10px 32px rgba(0,0,0,.22)}',
      '#dns-ai-export-root .dns-export-panel[hidden]{display:none!important}',
      '#dns-ai-export-root h2{margin:0 0 7px;font-size:16px;line-height:1.3}',
      '#dns-ai-export-root p{margin:0 0 12px;color:#666;font-size:12px}',
      '#dns-ai-export-root .dns-export-actions{display:grid;gap:8px}',
      '#dns-ai-export-root [data-action]{min-height:38px;border:0;border-radius:6px;padding:8px 12px;background:#f58220;color:#fff;font:700 13px Arial,sans-serif;cursor:pointer}',
      '#dns-ai-export-root [data-action="download"]{background:#f1f1f1;color:#222}',
      '#dns-ai-export-root [data-action]:disabled{opacity:.55;cursor:wait}',
      '#dns-ai-export-root [data-status]{min-height:18px;margin:12px 0 0;color:#555;font-size:12px}',
      '#dns-ai-export-root [data-status][data-error="true"]{color:#b3261e}',
      '@media(max-width:520px){#dns-ai-export-root{right:max(12px,var(--dns-export-right,12px))}#dns-ai-export-root .dns-export-panel{width:calc(100vw - 24px)}}',
    ].join('');

    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
    } else {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  function ensureUi() {
    if (!document.body || document.getElementById(ROOT_ID)) return;
    addStyles();

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = [
      '<section class="dns-export-panel" data-panel hidden aria-label="Экспорт каталога DNS">',
      '<h2>Каталог DNS → Markdown</h2>',
      '<p>Выгрузка всей выдачи с учётом текущего поиска и фильтров.</p>',
      '<div class="dns-export-actions">',
      '<button type="button" data-action="copy">Скопировать для ИИ</button>',
      '<button type="button" data-action="download">Скачать .md</button>',
      '</div>',
      '<div data-status aria-live="polite">Готово.</div>',
      '</section>',
      '<button class="dns-export-trigger" type="button" aria-label="Экспортировать товары из DNS" aria-expanded="false" title="Экспорт товаров">ИИ</button>',
    ].join('');
    document.body.appendChild(root);

    const trigger = root.querySelector('.dns-export-trigger');
    const panel = root.querySelector('[data-panel]');
    trigger.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      trigger.setAttribute('aria-expanded', String(!panel.hidden));
    });

    root.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (button) runExport(button.dataset.action);
    });

    document.addEventListener('pointerdown', event => {
      if (!root.contains(event.target)) {
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    updatePosition();
  }

  function start() {
    ensureUi();
    window.addEventListener('resize', updatePosition, { passive: true });
    window.addEventListener('scroll', updatePosition, { passive: true });
    observer = new MutationObserver(() => {
      ensureUi();
      updatePosition();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();


