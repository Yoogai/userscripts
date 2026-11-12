// ==UserScript==
// @name         MAX — сохранить чат в Markdown
// @namespace    https://github.com/Yoogai/userscripts
// @version      0.2.0
// @description  Сохраняет открытый чат MAX в Markdown-файл
// @homepageURL  https://github.com/Yoogai/userscripts
// @downloadURL  https://raw.githubusercontent.com/Yoogai/userscripts/main/max-chat-to-markdown.user.js
// @updateURL    https://raw.githubusercontent.com/Yoogai/userscripts/main/max-chat-to-markdown.user.js
// @match        https://web.max.ru/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'tm-max-chat-export-md';
  const TOAST_ID = 'tm-max-chat-export-toast';
  const BUTTON_CLASS = 'button button--small button--ghost svelte-yr2ksf';
  const DEFAULT_BUTTON_LABEL = 'Сохранить чат в Markdown';
  const BUTTON_SHAPE_PATH = 'M26 0C30.8966 0 35.6698 0.794071 40.0291 3.12545C43.8424 5.16485 46.8352 8.15757 48.8746 11.9709C51.2059 16.3302 52 21.1034 52 26C52 31.4424 50.9139 36.2158 48.8746 40.0291C46.8352 43.8424 43.8424 46.8352 40.0291 48.8745C35.6698 51.2059 30.8966 52 26 52C20.5576 52 15.7842 50.9139 11.9709 48.8745C8.15757 46.8352 5.16485 43.8424 3.12545 40.0291C0.786468 35.6556 0.0294538 30.9057 0 26C0 20.5576 1.08606 15.7842 3.12545 11.9709C5.16485 8.15757 8.15757 5.16485 11.9709 3.12545C15.7842 1.08606 20.5576 0 26 0Z';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_LOAD_PASSES = 120;
  const LOAD_WAIT_MS = 650;

  let busy = false;
  let observer = null;
  let toastTimer = 0;
  let pendingDownload = null;

  function cleanText(value) {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function flatText(value) {
    return cleanText(value).replace(/\s+/g, ' ').trim();
  }

  function setButtonLabel(button, label) {
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  function addNativeButtonIcon(button) {
    const shape = document.createElementNS(SVG_NS, 'svg');
    shape.setAttribute('class', 'shape svelte-yr2ksf');
    shape.setAttribute('viewBox', '0 0 52 52');
    shape.setAttribute('fill', 'none');
    shape.setAttribute('width', '40');
    shape.setAttribute('height', '40');

    const shapePath = document.createElementNS(SVG_NS, 'path');
    shapePath.setAttribute('fill', 'var(--button-background-color)');
    shapePath.setAttribute('d', BUTTON_SHAPE_PATH);
    shape.appendChild(shapePath);

    const content = document.createElement('div');
    content.className = 'content svelte-yr2ksf';

    const icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('width', '24');
    icon.setAttribute('height', '24');

    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#icon_download');
    icon.appendChild(use);
    content.appendChild(icon);

    button.append(shape, content);
  }

  function currentContext() {
    const main = document.querySelector('main.main--active');
    if (!main) return null;

    const header = main.querySelector('#main-header-title');
    const list = main.querySelector('.scrollListContent');
    const scroller = main.querySelector('.scrollListScrollable');
    if (!header || !list || !scroller) return null;

    const title = flatText(header.textContent)
      .replace(/^Окно чата с\s*/iu, '')
      .trim() || 'Чат MAX';

    return {
      main,
      header,
      list,
      scroller,
      title,
      path: location.pathname,
    };
  }

  function showToast(message, isError) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.style.cssText = [
        'position:fixed',
        'right:20px',
        'bottom:20px',
        'z-index:2147483647',
        'max-width:420px',
        'padding:12px 16px',
        'border-radius:10px',
        'background:#202124',
        'color:#fff',
        'font:14px/1.45 system-ui,sans-serif',
        'box-shadow:0 4px 18px #0004',
      ].join(';');
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.borderLeft = isError ? '4px solid #e45b5b' : '4px solid #55b980';
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.style.display = 'none';
    }, 4500);
  }

  function installButton() {
    const context = currentContext();
    if (!context) return;

    const searchButton = context.main.querySelector('button[aria-label="Открыть поиск сообщений"]');
    const host = searchButton?.parentElement || context.header.parentElement;
    if (!host) return;

    if (pendingDownload
      && (pendingDownload.path !== context.path || pendingDownload.title !== context.title)) {
      URL.revokeObjectURL(pendingDownload.url);
      pendingDownload = null;
    }

    const oldButton = document.getElementById(BUTTON_ID);
    if (oldButton) {
      if (oldButton.parentElement === host) {
        if (!busy) {
          setButtonLabel(
            oldButton,
            pendingDownload ? 'Скачать готовый Markdown-файл' : DEFAULT_BUTTON_LABEL,
          );
        }
        return;
      }
      oldButton.remove();
    }

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.className = BUTTON_CLASS;
    button.type = 'button';
    button.setAttribute('data-testid', 'max:exportMarkdownBtn');
    setButtonLabel(
      button,
      pendingDownload ? 'Скачать готовый Markdown-файл' : DEFAULT_BUTTON_LABEL,
    );
    addNativeButtonIcon(button);

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;

      if (pendingDownload
        && pendingDownload.path === location.pathname
        && pendingDownload.title === currentContext()?.title) {
        triggerDownload(button);
      } else {
        if (pendingDownload) {
          URL.revokeObjectURL(pendingDownload.url);
          pendingDownload = null;
        }
        exportActiveChat(button);
      }
    });

    if (searchButton) {
      searchButton.insertAdjacentElement('afterend', button);
    } else {
      host.insertBefore(button, context.header.nextElementSibling);
    }
  }

  function scheduleButtonInstall() {
    if (scheduleButtonInstall.scheduled) return;
    scheduleButtonInstall.scheduled = true;
    requestAnimationFrame(() => {
      scheduleButtonInstall.scheduled = false;
      installButton();
    });
  }

  function getDateDivider(wrapper, block) {
    const children = [...wrapper.children];
    const blockIndex = children.indexOf(block);
    if (blockIndex < 0) return '';

    for (let i = 0; i < blockIndex; i += 1) {
      const child = children[i];
      if (child.matches('.capsuleSeparator')) {
        return flatText(child.querySelector('.capsule')?.innerText || child.innerText);
      }
    }
    return '';
  }

  function extractMessageBody(block) {
    const source = block.querySelector('.bubbleContent') || block.querySelector('.message') || block;
    const clone = source.cloneNode(true);

    clone.querySelectorAll('.meta, .reactions, .indicators, .share, [aria-hidden="true"], button')
      .forEach(node => node.remove());

    clone.querySelectorAll('a[href]').forEach(anchor => {
      const rawHref = anchor.getAttribute('href') || '';
      const label = flatText(anchor.innerText || anchor.textContent);
      let url = '';
      try {
        const parsed = new URL(rawHref, location.href);
        if (parsed.protocol !== 'javascript:') url = parsed.href;
      } catch (_) {
        // Оставляем подпись ссылки, если адрес не удалось разобрать.
      }

      const replacement = url
        ? (label && label !== url ? '[' + label + '](' + url + ')' : url)
        : label;
      anchor.replaceWith(document.createTextNode(replacement));
    });

    return cleanText(clone.innerText || clone.textContent);
  }

  function extractAttachments(block) {
    const labels = [...block.querySelectorAll('.attaches')]
      .map(node => flatText(node.innerText || node.textContent))
      .filter(Boolean);

    const unique = [...new Set(labels)];
    return unique.map(label => '[Вложение: ' + label + ']');
  }

  function messageFromBlock(block, wrapper, activeDate, chatTitle) {
    if (!block.querySelector('.message')) return null;

    const outgoing = !!block.querySelector('.messageWrapper--isOut, .message--isOut');
    const authorNode = block.querySelector('.author .name, .author');
    const author = flatText(authorNode?.innerText || authorNode?.textContent);
    const time = flatText(block.querySelector('.meta--text .text')?.innerText || '');
    const date = getDateDivider(wrapper, block) || activeDate || 'Дата не указана';

    let body = extractMessageBody(block);
    const attachments = extractAttachments(block);
    if (attachments.length) {
      const attachmentText = attachments.join('\n');
      if (!body.includes(attachmentText)) {
        body = body ? body + '\n\n' + attachmentText : attachmentText;
      }
    }

    if (!body) {
      if (block.querySelector('audio, [class*="voice"], [class*="audio"]')) {
        body = '[Аудио или голосовое сообщение]';
      } else if (block.querySelector('video')) {
        body = '[Видео]';
      } else if (block.querySelector('img, [class*="image"], [class*="photo"]')) {
        body = '[Изображение или стикер]';
      } else {
        body = '[Сообщение без текстового содержимого]';
      }
    }

    return {
      date,
      time: time || 'время не указано',
      sender: outgoing ? 'Вы' : (author || chatTitle || 'Собеседник'),
      body,
    };
  }

  function captureSnapshot(context) {
    const wrappers = [...context.list.children];
    let activeDate = '';
    const messages = [];

    for (const wrapper of wrappers) {
      const blocks = [...wrapper.children].filter(child => child.matches('[role="listitem"]'));
      if (!blocks.length) continue;

      for (const block of blocks) {
        const dividerDate = getDateDivider(wrapper, block);
        if (dividerDate) activeDate = dividerDate;

        const message = messageFromBlock(block, wrapper, activeDate, context.title);
        if (message) messages.push(message);
      }
    }

    if (!messages.length) {
      const blocks = [...context.list.querySelectorAll('[role="listitem"]')];
      for (const block of blocks) {
        const wrapper = block.parentElement || context.list;
        const message = messageFromBlock(block, wrapper, activeDate, context.title);
        if (message) messages.push(message);
      }
    }

    const duplicateCounts = new Map();
    return messages.map(message => {
      const base = JSON.stringify([message.date, message.time, message.sender, message.body]);
      const ordinal = (duplicateCounts.get(base) || 0) + 1;
      duplicateCounts.set(base, ordinal);
      return Object.assign({ key: base + '|' + ordinal }, message);
    });
  }

  function overlapSuffixPrefix(left, right) {
    const maximum = Math.min(left.length, right.length);
    for (let size = maximum; size > 0; size -= 1) {
      let matches = true;
      for (let i = 0; i < size; i += 1) {
        if (left[left.length - size + i] !== right[i]) {
          matches = false;
          break;
        }
      }
      if (matches) return size;
    }
    return 0;
  }

  function containsOrderedSequence(container, sequence) {
    if (!sequence.length) return true;
    let cursor = 0;
    for (const key of container) {
      if (key === sequence[cursor]) cursor += 1;
      if (cursor === sequence.length) return true;
    }
    return false;
  }

  function mergeSnapshot(order, messageMap, snapshot, atTop) {
    const keys = snapshot.map(message => message.key);
    for (const message of snapshot) {
      if (!messageMap.has(message.key)) messageMap.set(message.key, message);
    }

    if (!order.length) return keys;
    if (containsOrderedSequence(keys, order)) return keys;
    if (containsOrderedSequence(order, keys)) return order;

    const oldToNew = overlapSuffixPrefix(order, keys);
    const newToOld = overlapSuffixPrefix(keys, order);
    if (oldToNew >= newToOld && oldToNew > 0) {
      return order.concat(keys.slice(oldToNew));
    }
    if (newToOld > 0) {
      return keys.concat(order.slice(newToOld));
    }

    const unseen = keys.filter(key => !order.includes(key));
    return atTop ? unseen.concat(order) : order.concat(unseen);
  }

  function pause(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function readContextAgain(initial) {
    const next = currentContext();
    if (!next || next.path !== initial.path || next.main !== initial.main) {
      throw new Error('Открытый чат изменился во время экспорта.');
    }
    return next;
  }

  async function collectHistory(context, button) {
    const scroller = context.scroller;
    const initialBottomGap = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    const messages = new Map();
    let order = [];
    let stableTopPasses = 0;
    let reachedTop = false;

    const firstSnapshot = captureSnapshot(context);
    order = mergeSnapshot(order, messages, firstSnapshot, scroller.scrollTop <= 2);

    for (let pass = 0; pass < MAX_LOAD_PASSES; pass += 1) {
      readContextAgain(context);
      const beforeCount = messages.size;
      const beforeHeight = scroller.scrollHeight;

      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await pause(LOAD_WAIT_MS);

      const latestContext = readContextAgain(context);
      const snapshot = captureSnapshot(latestContext);
      const atTop = scroller.scrollTop <= 2;
      order = mergeSnapshot(order, messages, snapshot, atTop);

      setButtonLabel(button, 'Загружено сообщений: ' + messages.size);
      const madeProgress = messages.size > beforeCount || scroller.scrollHeight > beforeHeight + 2;
      if (atTop && !madeProgress) {
        stableTopPasses += 1;
      } else {
        stableTopPasses = 0;
      }

      if (stableTopPasses >= 4) {
        reachedTop = true;
        break;
      }
    }

    const finalContext = readContextAgain(context);
    finalContext.scroller.scrollTop = Math.max(
      0,
      finalContext.scroller.scrollHeight - finalContext.scroller.clientHeight - initialBottomGap,
    );
    finalContext.scroller.dispatchEvent(new Event('scroll', { bubbles: true }));

    const ordered = order.map(key => messages.get(key)).filter(Boolean);
    return { messages: ordered, reachedTop };
  }

  function escapeHeading(value) {
    const tick = String.fromCharCode(96);
    return flatText(value)
      .replace(/#/g, '\\#')
      .replace(new RegExp(tick, 'g'), '\\' + tick);
  }

  function buildMarkdown(title, messages, reachedTop) {
    const lines = [
      '# ' + escapeHeading(title),
      '',
      '- Экспортировано: ' + new Date().toLocaleString('ru-RU'),
      '- Сообщений: ' + messages.length,
    ];

    if (!reachedTop) {
      lines.push('- Примечание: MAX не подтвердил загрузку начала истории; сохранена загруженная часть.');
    }
    lines.push('');

    let currentDate = '';
    for (const message of messages) {
      if (message.date !== currentDate) {
        currentDate = message.date;
        lines.push('## ' + escapeHeading(currentDate));
        lines.push('');
      }
      lines.push('### ' + escapeHeading(message.time) + ' — ' + escapeHeading(message.sender));
      lines.push('');
      lines.push(message.body);
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  }

  function safeFileName(value) {
    const date = new Date();
    const localDate = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    const safeTitle = flatText(value)
      .replace(/[<>:"\/\\|?*\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 90) || 'Чат MAX';
    return safeTitle + '_' + localDate + '.md';
  }

  function prepareMarkdownDownload(title, markdown, path) {
    const blob = new Blob(['\ufeff', markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    return { url, name: safeFileName(title), path, title };
  }

  function triggerDownload(button) {
    if (!pendingDownload) return;

    const anchor = document.createElement('a');
    anchor.href = pendingDownload.url;
    anchor.download = pendingDownload.name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    const url = pendingDownload.url;
    pendingDownload = null;
    setButtonLabel(button, DEFAULT_BUTTON_LABEL);
    showToast('Markdown-файл скачивается.', false);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportActiveChat(button) {
    const context = currentContext();
    if (!context) {
      showToast('Открой чат MAX и повтори сохранение.', true);
      return;
    }

    busy = true;
    const previousLabel = button.getAttribute('aria-label') || DEFAULT_BUTTON_LABEL;
    let readyToDownload = false;
    button.disabled = true;
    setButtonLabel(button, 'Собираю переписку…');
    button.style.opacity = '0.65';
    button.style.cursor = 'wait';

    try {
      const result = await collectHistory(context, button);
      if (!result.messages.length) {
        throw new Error('В открытом чате не нашлись сообщения.');
      }

      const markdown = buildMarkdown(context.title, result.messages, result.reachedTop);
      if (pendingDownload) URL.revokeObjectURL(pendingDownload.url);
      pendingDownload = prepareMarkdownDownload(context.title, markdown, context.path);
      readyToDownload = true;
      const partialNote = result.reachedTop ? '' : ' (загруженная часть)';
      showToast(
        'Собрано сообщений: ' + result.messages.length + partialNote
          + '. Нажми «Скачать файл».',
        !result.reachedTop,
      );
      setButtonLabel(button, 'Скачать готовый Markdown-файл');
    } catch (error) {
      showToast(error?.message || 'Не удалось сохранить чат.', true);
      setButtonLabel(button, 'Не удалось сохранить чат');
    } finally {
      busy = false;
      button.disabled = false;
      button.style.opacity = '';
      button.style.cursor = 'pointer';
      if (readyToDownload) {
        setButtonLabel(button, 'Скачать готовый Markdown-файл');
      } else {
        setButtonLabel(button, 'Не удалось сохранить чат');
        window.setTimeout(() => {
          setButtonLabel(button, previousLabel);
        }, 1800);
      }
    }
  }

  function start() {
    installButton();
    if (observer || !document.body) return;

    observer = new MutationObserver(scheduleButtonInstall);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
