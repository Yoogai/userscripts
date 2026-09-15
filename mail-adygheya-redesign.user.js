// ==UserScript==
// @name         Почта Адыгеи — ПК-редизайн
// @namespace    local.mail.adygheya.gov.ru
// @version      3.1.31
// @description  Трёхпанельный ПК-интерфейс для RainLoop: новый дизайн, SVG-иконки, регулируемые панели, режим чтения.
// @updateURL    https://raw.githubusercontent.com/Yoogai/userscripts/main/mail-adygheya-redesign.user.js
// @downloadURL  https://raw.githubusercontent.com/Yoogai/userscripts/main/mail-adygheya-redesign.user.js
// @match        https://mail.adygheya.gov.ru/*
// @match        http://mail.adygheya.gov.ru/*
// @include      *mail.adygheya.gov.ru*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  console.log('[Почта Адыгеи Redesign v3.1.31] Скрипт инициализирован');

  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(fontLink);

  const KEYS = {
    enabled: 'ady-redesign-enabled',
    theme: 'ady-redesign-theme',
    density: 'ady-redesign-density',
    folderWidth: 'ady-folder-width',
    listWidth: 'ady-list-width',
    focus: 'ady-focus-mode',
    collapsed: 'ady-sidebar-collapsed',
    recentRecipients: 'ady-recent-recipients'
  };
  const DENSITIES = ['compact', 'normal', 'spacious'];
  const DENSITY_LABELS = { compact: 'плотно', normal: 'обычно', spacious: 'свободно' };
  const MIN_FOLDER = 196;
  const MIN_LIST = 320;
  const MIN_READER = 440;
  const FREQUENT_RECIPIENTS = [
    ['АРЮБ', 'arub@adygheya.gov.ru'],
    ['АРДБ', 'ardb01@mail.ru'],
    ['АРСБС', 'arsbs_mbo@mail.ru'],
    ['ЦБС г. Адыгейска', 'suriet@bk.ru'],
    ['ЦБС г. Майкопа', 'csistema@mail.ru'],
    ['Гиагинская МЦБС', 'gmcbs@mail.ru'],
    ['Кошехабльская МЦБС', 'koshbiblioteka@mail.ru'],
    ['Красногвардейская МЦБС', 'bib.kr01@yandex.ru'],
    ['Майкопский район', 'biblioteka.k@mail.ru'],
    ['Тахтамукайская МЦБС', 'biblioteka_ta@mail.ru'],
    ['Теучежская МЦБС', 'teuchcbs@yandex.ru'],
    ['Шовгеновская МЦБС', 'shmcbs.shov@adygheya.gov.ru'],
  ];

  const state = {
    enabled: Boolean(GM_getValue(KEYS.enabled, true)),
    theme: GM_getValue(KEYS.theme, 'light'),
    density: GM_getValue(KEYS.density, 'normal'),
    folderWidth: Number(GM_getValue(KEYS.folderWidth, 236)) || 236,
    listWidth: Number(GM_getValue(KEYS.listWidth, 410)) || 410,
    focus: Boolean(GM_getValue(KEYS.focus, false)),
    collapsed: Boolean(GM_getValue(KEYS.collapsed, false)),
  };
  let recentRecipients = GM_getValue(KEYS.recentRecipients, []);
  if (!Array.isArray(recentRecipients)) recentRecipients = [];

  let center;
  let left;
  let right;
  let subLeft;
  let subRight;
  let folderHandle;
  let listHandle;
  let observer;
  let autoRefreshTimer;
  let infiniteScrollTarget;
  let infiniteScrollBusy = false;
  let scheduled = false;
  let captured = false;
  const originals = new Map();

  function getSvgIcon(color, content) {
    color = color.replace(/^%23/i, '#');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 20"><path d="M0 2C0 0.9 0.9 0 2 0H11L16 5V18C16 19.1 15.1 20 14 20H2C0.9 20 0 19.1 0 18V2Z" fill="${color}"/><path d="M11 0V4C11 4.6 11.4 5 12 5H16L11 0Z" fill="rgba(255,255,255,0.4)"/>${content}</svg>`;
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }

  function getFileTypeClass(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    const map = {
      pdf: 'pdf',
      doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc',
      xls: 'xls', xlsx: 'xls', ods: 'xls', csv: 'xls',
      ppt: 'ppt', pptx: 'ppt', odp: 'ppt',
      zip: 'zip', rar: 'zip', '7z': 'zip', tar: 'zip', gz: 'zip', bz2: 'zip',
      jpg: 'img', jpeg: 'img', png: 'img', gif: 'img', svg: 'img', webp: 'img', bmp: 'img', ico: 'img', tiff: 'img',
      mp4: 'vid', avi: 'vid', mov: 'vid', mkv: 'vid', webm: 'vid', wmv: 'vid', flv: 'vid',
      mp3: 'aud', wav: 'aud', ogg: 'aud', flac: 'aud', aac: 'aud', wma: 'aud',
      html: 'code', css: 'code', js: 'code', json: 'code', xml: 'code', py: 'code', java: 'code', php: 'code', sql: 'code',
      txt: 'txt', log: 'txt', md: 'txt', cfg: 'txt', ini: 'txt',
      eml: 'eml', msg: 'eml',
    };
    return `ady-ftype-${map[ext] || 'unknown'}`;
  }

  function getFolderIcon(name) {
    const key = name.toLocaleLowerCase('ru');
    let body = '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>';
    if (key.includes('входящ')) body = '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>';
    else if (key.includes('отправ')) body = '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>';
    else if (key.includes('чернов')) body = '<path d="M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z"/><path d="M14.487 7.858A1 1 0 0 1 14 7V2"/><path d="M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516"/><path d="M8 18h1"/>';
    else if (key.includes('спам')) body = '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>';
    else if (key.includes('корзин')) body = '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
    else if (key.includes('архив')) body = '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>';
    else if (key === '__compose__') body = '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>';
    else if (key === '__contacts__') body = '<path d="M16 2v2"/><path d="M17.915 21a6 6 0 1 0-12 0"/><path d="M8 2v2"/><circle cx="12" cy="11" r="4"/><rect x="3" y="3" width="18" height="18" rx="2"/>';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  }

  function getActionIcon(name) {
    const paths = {
      reload: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
      archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
      spam: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
      check: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
      trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
      folderAdd: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
      settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
      user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>'
      ,mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
      ,mailOpen: '<path d="M3 10V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/><path d="m3 10 9 6 9-6"/><path d="M3 10v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>'
      ,flag: '<path d="M5 22V4"/><path d="M5 4c5-3 9 3 14 0v10c-5 3-9-3-14 0"/>'
      ,forward: '<path d="m15 17 5-5-5-5"/><path d="M20 12H4"/>'
      ,fire: '<path d="M12 3c2 3 5 4 5 9a5 5 0 0 1-10 0c0-2 1-4 3-6 0 3 2 3 2 5 1-2 1-4 0-8Z"/>'
    };
    return `<svg class="ady-inline-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.more}</svg>`;
  }

  const style = document.createElement('style');
  style.id = 'ady-redesign-style';
  style.textContent = `
    @media (min-width: 800px) {
      html.ady-redesign {
        --ady-ink: #111827;
        --ady-ink-soft: #374151;
        --ady-muted: #6B7280;
        --ady-paper: #FAFBFD;
        --ady-paper-strong: #FFFFFF;
        --ady-panel: #F0F2F5;
        --ady-line: #E5E7EB;
        --ady-line-strong: #D1D5DB;
        --ady-navy: #1D4ED8;
        --ady-navy-deep: #0F172A;
        --ady-accent: #EF4444;
        --ady-accent-soft: #FEE2E2;
        --ady-blue-soft: #EFF6FF;
        color-scheme: light;
      }
      html.ady-redesign[data-ady-theme="dark"] {
        --ady-ink: #F1F5F9;
        --ady-ink-soft: #CBD5E1;
        --ady-muted: #94A3B8;
        --ady-paper: #0F1117;
        --ady-paper-strong: #1A1D27;
        --ady-panel: #0D1017;
        --ady-line: #1E293B;
        --ady-line-strong: #334155;
        --ady-navy: #60A5FA;
        --ady-navy-deep: #060910;
        --ady-accent: #F87171;
        --ady-accent-soft: #371717;
        --ady-blue-soft: #172554;
        color-scheme: dark;
      }

      html.ady-redesign,
      html.ady-redesign body,
      html.ady-redesign input,
      html.ady-redesign button,
      html.ady-redesign .btn {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
      }
      html.ady-redesign body {
        background: var(--ady-paper) !important;
        color: var(--ady-ink) !important;
        transition: background-color 350ms ease, color 250ms ease !important;
      }
      html.ady-redesign * {
        scrollbar-color: var(--ady-line-strong) transparent; scrollbar-width: thin;
      }
      
      html.ady-redesign #rl-bg {
        background: var(--ady-paper) !important;
        filter: none !important;
      }
      html.ady-redesign #rl-center { inset: 0 !important; }
      html.ady-redesign #rl-left {
        background: var(--ady-navy-deep) !important;
        color: #eef5f8 !important;
        box-shadow: none !important;
        transition: width 180ms ease !important;
      }
      html.ady-redesign #rl-left::before { display: none !important; }
      html.ady-redesign #rl-left .b-folders { color: #eef5f8 !important; }
      html.ady-redesign #rl-left .b-toolbar {
        top: 0 !important;
        height: 60px !important;
        padding: 10px 12px 8px !important;
        box-sizing: border-box !important;
        background: transparent !important;
      }
      html.ady-redesign #rl-left .b-toolbar .buttonCompose {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        height: 40px !important;
        min-width: 0 !important;
        padding: 0 13px !important;
        box-sizing: border-box !important;
        border: 0 !important;
        border-radius: 10px !important;
        background: linear-gradient(135deg, var(--ady-accent), #DC2626) !important;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important;
        color: #fff !important;
        text-shadow: none !important;
        transition: transform 180ms ease, box-shadow 180ms ease !important;
      }
      html.ady-redesign #rl-left .b-toolbar .buttonCompose:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4) !important;
      }
      html.ady-redesign #rl-left .b-toolbar .buttonComposeText {
        display: inline-flex !important;
        align-items: center !important;
        height: 18px !important;
        margin: 0 !important;
        line-height: 18px !important;
        white-space: nowrap !important;
      }
      html.ady-redesign #rl-left .b-toolbar .buttonComposeText .i18n {
        display: block !important;
        line-height: 18px !important;
      }
      html.ady-redesign #rl-left .b-toolbar .buttonContacts {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        height: 40px !important;
        margin-left: 6px !important;
        padding: 0 12px !important;
        box-sizing: border-box !important;
        border-color: rgba(255,255,255,.2) !important;
        border-radius: 10px !important;
        background: rgba(255,255,255,.08) !important;
        box-shadow: none !important;
        color: #fff !important;
        transition: background 180ms ease !important;
      }
      html.ady-redesign #rl-left .b-content {
        top: 60px !important;
        right: 0 !important;
        bottom: 62px !important;
        left: 0 !important;
        width: auto !important;
        height: auto !important;
      }
      html.ady-redesign #rl-left .content-wrapper { padding: 4px 10px 18px !important; }
      html.ady-redesign #rl-left .b-list-delimiter {
        margin: 18px 10px 12px !important;
        border-color: rgba(255,255,255,.13) !important;
      }
      html.ady-redesign #rl-left .e-item { margin: 2px 0 !important; }
      html.ady-redesign #rl-left .e-link {
        height: 40px !important;
        padding: 0 10px !important;
        border: 0 !important;
        border-radius: 8px !important;
        background: transparent !important;
        color: rgba(238,245,248,.72) !important;
        line-height: 40px !important;
        text-shadow: none !important;
        transition: background 180ms ease, color 180ms ease !important;
      }
      html.ady-redesign #rl-left .e-link:hover {
        background: rgba(255,255,255,.07) !important;
        color: #fff !important;
      }
      html.ady-redesign #rl-left .e-link.selected {
        box-shadow: inset 3px 0 var(--ady-accent) !important;
        background: rgba(255,255,255,.12) !important;
        color: #fff !important;
        font-weight: 600 !important;
      }
      html.ady-redesign #rl-left .badge {
        margin-top: 10px !important;
        border: 0 !important;
        border-radius: 10px !important;
        background: var(--ady-navy) !important;
        color: #fff !important;
        text-shadow: none !important;
      }
      html.ady-redesign #rl-left .b-footer {
        right: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        width: auto !important;
        height: 54px !important;
        padding: 10px 12px !important;
        border-top: 1px solid rgba(255,255,255,.12) !important;
        background: rgba(0,0,0,.1) !important;
      }

      html.ady-redesign #rl-left .ady-folder-icon {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        margin-right: 8px;
        vertical-align: middle;
        color: currentColor;
      }
      html.ady-redesign #rl-left .ady-folder-icon svg {
        width: 18px;
        height: 18px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      html.ady-redesign #rl-left .ady-toolbar-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
      }
      html.ady-redesign #rl-left .ady-toolbar-icon svg {
        width: 18px;
        height: 18px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      html.ady-redesign #rl-left .buttonCompose > i,
      html.ady-redesign #rl-left .buttonContacts > i { display: none !important; }
      html.ady-redesign #rl-left .b-toolbar::before,
      html.ady-redesign #rl-left .b-toolbar::after,
      html.ady-redesign #rl-left .buttonCompose::before,
      html.ady-redesign #rl-left .buttonCompose::after,
      html.ady-redesign #rl-left .buttonContacts::before,
      html.ady-redesign #rl-left .buttonContacts::after,
      html.ady-redesign #rl-left .buttonCompose .caret,
      html.ady-redesign #rl-left .buttonContacts .caret {
        display: none !important;
        content: none !important;
        border: 0 !important;
        background: none !important;
      }

      html.ady-redesign.ady-collapsed #rl-left .b-toolbar {
        height: 100px !important;
        padding: 8px !important;
      }
      html.ady-redesign.ady-collapsed #rl-left {
        width: 56px !important;
        min-width: 56px !important;
      }
      html.ady-redesign.ady-collapsed #rl-right { left: 56px !important; }
      html.ady-redesign.ady-collapsed #rl-left .b-toolbar .buttonCompose,
      html.ady-redesign.ady-collapsed #rl-left .b-toolbar .buttonContacts {
        display: flex !important;
        float: none !important;
        width: 40px !important;
        min-width: 40px !important;
        height: 40px !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      html.ady-redesign.ady-collapsed #rl-left .b-toolbar .buttonContacts { margin-top: 6px !important; }
      html.ady-redesign.ady-collapsed #rl-left .buttonComposeText { display: none !important; }
      html.ady-redesign.ady-collapsed #rl-left .b-content {
        top: 104px !important;
        bottom: 54px !important;
      }
      html.ady-redesign.ady-collapsed #rl-left .content-wrapper { padding: 4px 8px 18px !important; }
      html.ady-redesign.ady-collapsed #rl-left .b-list-delimiter {
        width: 32px !important;
        margin: 14px 4px !important;
      }
      html.ady-redesign.ady-collapsed #rl-left .e-link {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 40px !important;
        height: 40px !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
      html.ady-redesign.ady-collapsed #rl-left .e-link > :not(.ady-folder-icon) { display: none !important; }
      /* Keep RainLoop-hidden/service folders hidden when collapsed.
         The generic display:flex above would otherwise resurrect .e-link.hidden. */
      html.ady-redesign.ady-collapsed #rl-left .e-link.hidden {
        display: none !important;
      }
      html.ady-redesign.ady-collapsed #rl-left .e-item:has(> .e-link.hidden) {
        display: none !important;
        margin: 0 !important;
      }
      /* Keep real nested folders available; only RainLoop-hidden folders are removed above. */
      html.ady-redesign.ady-collapsed #rl-left .ady-folder-icon {
        margin: 0 !important;
        pointer-events: none !important;
      }
      html.ady-redesign.ady-collapsed #rl-left .b-footer {
        display: flex !important;
        height: 54px !important;
        padding: 9px 8px !important;
      }
      html.ady-redesign.ady-collapsed #rl-left .b-footer .btn:not(.buttonResize) { display: none !important; }
      html.ady-redesign.ady-collapsed #rl-left .b-footer .buttonResize { margin: 0 auto !important; }

      html.ady-redesign #rl-right,
      html.ady-redesign #rl-sub-left,
      html.ady-redesign #rl-sub-right { background: transparent !important; }
      html.ady-redesign #rl-sub-left { border-right: 1px solid var(--ady-line) !important; transition: left 180ms ease !important; }
      html.ady-redesign #rl-sub-left .messageList > .b-toolbar {
        height: 58px !important;
        padding: 10px 12px !important;
        border: 0 !important;
        border-bottom: 1px solid var(--ady-line) !important;
        background: var(--ady-paper-strong) !important;
        box-shadow: none !important;
      }
      html.ady-redesign #rl-sub-left .b-message-list-wrapper {
        top: 58px !important;
        right: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        width: auto !important;
        height: auto !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: var(--ady-paper) !important;
        box-shadow: none !important;
      }
      html.ady-redesign #rl-sub-left .second-toolbar {
        height: 54px !important;
        padding: 11px 13px !important;
        border: 0 !important;
        border-bottom: 1px solid var(--ady-line) !important;
        border-radius: 0 !important;
        background: var(--ady-panel) !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar {
        position: relative !important;
        z-index: 130 !important;
        display: flex !important;
        align-items: center !important;
        min-height: 58px !important;
        pointer-events: auto !important;
        padding: 10px 12px !important;
        border-bottom: 1px solid var(--ady-line) !important;
        background: var(--ady-paper-strong) !important;
        box-sizing: border-box !important;
        border-radius: 0 0 0 12px !important;
        overflow: visible !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar > .btn-toolbar {
        position: relative !important;
        z-index: 131 !important;
        display: flex !important;
        align-items: center !important;
        pointer-events: auto !important;
        gap: 6px !important;
        width: 100% !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn-group {
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn-group[style*="display: none"] {
        display: none !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn {
        display: inline-flex !important;
        align-items: center !important;
        pointer-events: auto !important;
        justify-content: center !important;
        width: 36px !important;
        height: 36px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 2px solid rgba(226, 232, 240, .42) !important;
        border-radius: 9px !important;
        background: var(--ady-paper-strong) !important;
        color: var(--ady-ink-soft) !important;
        box-sizing: border-box !important;
        outline: none !important;
        -webkit-tap-highlight-color: transparent !important;
        text-shadow: none !important;
        transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar::before,
      html.ady-redesign #rl-sub-left > div > div.toolbar::after,
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn::before,
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn::after,
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn .caret {
        display: none !important;
        content: none !important;
        border: 0 !important;
        background: none !important;
      }
      html.ady-redesign .opentip,
      html.ady-redesign .opentip-container { display: none !important; }
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn .ady-inline-icon {
        color: var(--ady-muted) !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn:hover {
        border-color: var(--ady-navy) !important;
        background: var(--ady-blue-soft) !important;
        color: var(--ady-navy) !important;
        outline: 0 !important;
        transform: translateY(-1px) !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn:focus,
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn:active,
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn:focus-visible {
        outline: none !important;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--ady-navy) 32%, transparent) !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn.disabled,
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn.disable {
        opacity: .52 !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar .btn-group:has(.buttonMore) { margin-left: auto !important; }
      html.ady-redesign .ady-inline-icon {
        width: 18px !important;
        height: 18px !important;
        fill: none !important;
        stroke: currentColor !important;
        stroke-width: 1.8 !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
      }
      html.ady-redesign .ady-reload-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 18px !important;
        height: 18px !important;
        font-size: 0 !important;
        line-height: 0 !important;
      }
      html.ady-redesign .ady-icon-replaced {
        font-size: 0 !important;
      }
      html.ady-redesign .ady-icon-replaced::before,
      html.ady-redesign .ady-icon-replaced::after {
        display: none !important;
        content: none !important;
      }
      html.ady-redesign #rl-sub-left > div > div.toolbar > div > div:nth-child(3) .ady-icon-replaced,
      html.ady-redesign #rl-sub-left > div > div.toolbar > div > div:nth-child(3) .ady-icon-replaced::before,
      html.ady-redesign #rl-sub-left > div > div.toolbar > div > div:nth-child(3) .ady-icon-replaced::after {
        background-image: none !important;
        background: transparent !important;
        text-shadow: none !important;
      }
      html.ady-redesign #rl-left .b-footer {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
        gap: 6px !important;
        height: 54px !important;
        padding: 9px 12px !important;
        box-sizing: border-box !important;
        border-top: 1px solid rgba(226, 232, 240, .16) !important;
        background: rgba(15, 23, 42, .96) !important;
        color: #E2E8F0 !important;
      }
      html.ady-redesign #rl-left .b-footer .btn-group { display: contents !important; }
      html.ady-redesign #rl-left .b-footer .btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 34px !important;
        height: 34px !important;
        padding: 0 !important;
        border: 1px solid rgba(226, 232, 240, .26) !important;
        border-radius: 9px !important;
        background: rgba(15, 23, 42, .96) !important;
        color: #E2E8F0 !important;
        box-sizing: border-box !important;
      }
      html.ady-redesign #rl-left .b-footer .buttonResize { margin-right: auto !important; }
      html.ady-redesign #rl-left .b-footer .btn:hover {
        border-color: var(--ady-navy) !important;
        background: rgba(96, 165, 250, .18) !important;
        color: #fff !important;
      }
      html.ady-redesign #rl-right > div.rl-view-model.RL-SystemDropDown > div > div {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        height: 58px !important;
        padding: 10px 14px !important;
        border-bottom: 1px solid var(--ady-line) !important;
        background: var(--ady-paper-strong) !important;
        box-sizing: border-box !important;
        border-radius: 0 0 0 12px !important;
        overflow: visible !important;
      }
      html.ady-redesign #rl-right > div.rl-view-model.RL-SystemDropDown > div > div.b-toolbar {
        background: transparent !important;
      }
      html.ady-redesign #rl-right > div.rl-view-model.RL-SystemDropDown > div > div {
        background: transparent !important;
      }
      html.ady-redesign #rl-right .accountPlace {
        display: flex !important;
        align-items: center !important;
        height: 36px !important;
        box-sizing: border-box !important;
        order: 1 !important;
        margin-left: auto !important;
        padding: 8px 12px !important;
        border: 1px solid var(--ady-line) !important;
        border-radius: 9px !important;
        background: #fff !important;
        color: var(--ady-ink-soft) !important;
        font-weight: 400 !important;
        letter-spacing: .01em !important;
        border-radius: 8px !important;
        font-size: 12px !important;
        line-height: 18px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      html.ady-redesign #rl-right > div.rl-view-model.RL-SystemDropDown > .b-system-drop-down > .btn-toolbar {
        position: absolute !important;
        z-index: 103 !important;
        top: 0 !important;
        right: 0 !important;
        left: 0 !important;
        width: auto !important;
        margin: 0 !important;
        pointer-events: auto !important;
      }
      html.ady-redesign #rl-right .accountPlace {
        background: var(--ady-paper-strong) !important;
        text-shadow: none !important;
        cursor: copy !important;
        user-select: none !important;
        pointer-events: auto !important;
        transition: border-color 160ms ease, background 160ms ease, color 160ms ease !important;
      }
      html.ady-redesign #rl-right .accountPlace::before,
      html.ady-redesign #rl-right .accountPlace::after {
        display: none !important;
        content: none !important;
      }
      html.ady-redesign #rl-right .accountPlace:hover {
        border-color: var(--ady-navy) !important;
        background: var(--ady-blue-soft) !important;
        color: var(--ady-navy) !important;
      }
      html.ady-redesign #rl-right .accountPlace:focus-visible {
        outline: none !important;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--ady-navy) 32%, transparent) !important;
      }
      html.ady-redesign .ady-copy-toast {
        position: fixed !important;
        z-index: 2147483000 !important;
        top: 18px !important;
        left: 50% !important;
        padding: 9px 14px !important;
        border: 1px solid var(--ady-line-strong) !important;
        border-radius: 9px !important;
        background: var(--ady-paper-strong) !important;
        color: var(--ady-ink) !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .18) !important;
        font: 500 12px/18px 'Inter', sans-serif !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        opacity: 0 !important;
        transform: translate(-50%, -8px) !important;
        transition: opacity 160ms ease, transform 160ms ease !important;
      }
      html.ady-redesign .ady-copy-toast.is-visible {
        opacity: 1 !important;
        transform: translate(-50%, 0) !important;
      }
      html.ady-redesign #rl-right .btn-group-last { order: 2 !important; }
      html.ady-redesign #rl-right .system-dropdown {
        display: inline-flex !important;
        pointer-events: auto !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 7px !important;
        min-width: 42px !important;
        height: 36px !important;
        padding: 0 11px !important;
        border: 1px solid var(--ady-line-strong) !important;
        border-radius: 9px !important;
        background: var(--ady-paper-strong) !important;
        color: var(--ady-ink-soft) !important;
        box-sizing: border-box !important;
      }
      html.ady-redesign #rl-right .system-dropdown:hover {
        border-color: var(--ady-navy) !important;
        background: var(--ady-blue-soft) !important;
        color: var(--ady-navy) !important;
      }
      html.ady-redesign #rl-sub-left .second-toolbar .form-inline > .input-append {
        display: flex !important;
        width: calc(100% - 42px) !important;
        min-width: 0 !important;
      }
      html.ady-redesign #rl-sub-left .second-toolbar .close-input-wrp {
        flex: 1 1 auto !important;
        width: auto !important;
        min-width: 0 !important;
      }
      html.ady-redesign #rl-sub-left input.inputSearch {
        width: 100% !important;
        height: 32px !important;
        min-width: 0 !important;
        padding: 5px 10px !important;
        border: 1px solid var(--ady-line-strong) !important;
        border-radius: 5px 0 0 5px !important;
        box-sizing: border-box !important;
        background: var(--ady-paper-strong) !important;
        color: var(--ady-ink) !important;
        box-shadow: none !important;
      }
      html.ady-redesign #rl-sub-left .buttonMoreSearch {
        flex: 0 0 auto !important;
        height: 32px !important;
        box-sizing: border-box !important;
        border-color: var(--ady-line-strong) !important;
        border-radius: 0 5px 5px 0 !important;
        background: var(--ady-paper-strong) !important;
        color: var(--ady-muted) !important;
        box-shadow: none !important;
      }
      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content {
        top: 54px !important;
        bottom: 44px !important;
        background: var(--ady-paper) !important;
      }
      html.ady-redesign #rl-sub-left > div > div.b-message-list-wrapper > div.mainDelimiter.footerDelimiter {
        display: none !important;
      }
      html.ady-redesign #rl-sub-left > div > div.b-message-list-wrapper > div.b-footer.thm-message-list-bottom-toolbar {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        height: 46px !important;
        min-height: 46px !important;
        bottom: 0 !important;
        padding: 6px 12px !important;
        box-sizing: border-box !important;
        border-top: 1px solid var(--ady-line) !important;
        background: var(--ady-paper-strong) !important;
      }
      html.ady-redesign #rl-sub-left .b-footer.thm-message-list-bottom-toolbar .e-quota { display:none !important; }
      html.ady-redesign #rl-sub-left .e-pagenator {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 4px !important;
        margin: 0 !important;
      }
      html.ady-redesign #rl-sub-left .e-pagenator .e-page,
      html.ady-redesign #rl-sub-left .e-pagenator .ady-page-arrow {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 30px !important;
        height: 30px !important;
        padding: 0 8px !important;
        box-sizing: border-box !important;
        border: 1px solid transparent !important;
        border-radius: 8px !important;
        background: transparent !important;
        color: var(--ady-ink-soft) !important;
        font: 500 13px/1 'Inter', sans-serif !important;
        text-decoration: none !important;
        cursor: pointer !important;
      }
      html.ady-redesign #rl-sub-left .e-pagenator .e-page:hover,
      html.ady-redesign #rl-sub-left .e-pagenator .ady-page-arrow:hover {
        border-color: var(--ady-line-strong) !important;
        background: var(--ady-blue-soft) !important;
        color: var(--ady-navy) !important;
      }
      html.ady-redesign #rl-sub-left .e-pagenator .e-page.current,
      html.ady-redesign #rl-sub-left .e-pagenator .e-page.active,
      html.ady-redesign #rl-sub-left .e-pagenator [aria-current="page"] {
        border-color: transparent !important;
        background: transparent !important;
        color: var(--ady-navy-deep) !important;
        box-shadow: none !important;
        outline: none !important;
        font-weight: 700 !important;
      }
      html.ady-redesign #rl-sub-left .e-pagenator .e-page.current:focus,
      html.ady-redesign #rl-sub-left .e-pagenator .e-page.current:focus-visible,
      html.ady-redesign #rl-sub-left .e-pagenator .e-page.active:focus,
      html.ady-redesign #rl-sub-left .e-pagenator .e-page.active:focus-visible {
        border-color: transparent !important;
        box-shadow: none !important;
        outline: none !important;
      }
      html.ady-redesign #rl-sub-left .e-pagenator .e-page.current .e-page-number,
      html.ady-redesign #rl-sub-left .e-pagenator .e-page.active .e-page-number,
      html.ady-redesign #rl-sub-left .e-pagenator [aria-current="page"] .e-page-number {
        border: 0 !important;
        border-bottom: 0 !important;
        box-shadow: none !important;
        text-decoration: none !important;
      }
      html.ady-redesign #rl-sub-left .e-pagenator .e-page.custom {
        min-width: 20px !important;
        padding: 0 3px !important;
        cursor: default !important;
      }
      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content { bottom: 46px !important; }
      html.ady-redesign .ady-recipient-menu {
        position: fixed !important;
        z-index: 2147482500 !important;
        display: none;
        width: 280px;
        max-height: 360px;
        overflow: auto;
        padding: 6px;
        border: 1px solid var(--ady-line-strong);
        border-radius: 12px;
        background: var(--ady-paper-strong);
        box-shadow: 0 14px 36px rgba(15, 23, 42, .18);
      }
      html.ady-redesign .ady-recipient-menu.is-open { display: block !important; }
      html.ady-redesign .ady-recipient-item {
        display: flex;
        flex-direction: column;
        width: 100%;
        gap: 2px;
        padding: 9px 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--ady-ink);
        text-align: left;
        cursor: pointer;
        box-sizing: border-box;
      }
      html.ady-redesign .ady-recipient-item:hover,
      html.ady-redesign .ady-recipient-item:focus-visible { background: var(--ady-blue-soft); outline: none; }
      html.ady-redesign .ady-recipient-name { font-size: 13px; font-weight: 600; line-height: 18px; }
      html.ady-redesign .ady-recipient-address { color: var(--ady-muted); font-size: 11px; line-height: 15px; }
      html.ady-redesign .ui-autocomplete { display: none !important; }
      html.ady-redesign .ady-recipient-section {
        padding: 7px 10px 4px;
        color: var(--ady-muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      html.ady-redesign #rl-sub-left .btn-group.dropdown ul .e-link.menuitem {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        min-height: 36px !important;
        padding: 7px 12px !important;
        box-sizing: border-box !important;
        white-space: nowrap !important;
      }
      html.ady-redesign #rl-sub-left .btn-group.dropdown ul .ady-menu-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 20px !important;
        width: 20px !important;
        height: 20px !important;
        margin: 0 !important;
        font-size: 0 !important;
        line-height: 0 !important;
      }
      html.ady-redesign #rl-sub-left .buttonReload.ady-no-tooltip::before,
      html.ady-redesign #rl-sub-left .buttonReload.ady-no-tooltip::after {
        content: none !important;
        display: none !important;
      }
      html.ady-redesign.ady-auto-refreshing .opentip { display: none !important; }
      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content > .content {
        padding: 10px !important;
        box-sizing: border-box !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem {
        width: 100% !important;
        height: 76px !important;
        margin: 0 !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        border: 0 !important;
        border-radius: 8px !important;
        background: var(--ady-paper) !important;
        color: var(--ady-ink) !important;
        box-shadow: none !important;
        transition: background 160ms ease, box-shadow 160ms ease, transform 120ms ease !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem + .messageListItem {
        margin-top: 5px !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent,
      html.ady-redesign #rl-sub-left .messageListItem > .wrapper {
        position: relative !important;
        height: 76px !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      /* Subject-first message list without changing RainLoop DOM order. */
      html.ady-redesign #rl-sub-left .messageListItem > .wrapper {
        display: grid !important;
        grid-template-columns: 30px minmax(0, 1fr) auto auto 31px !important;
        grid-template-rows: 21px 21px !important;
        align-content: center !important;
        align-items: center !important;
        padding: 5px 0 !important;
        box-sizing: border-box !important;
        transform: translateY(-4px) !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .checkedParent {
        grid-column: 1 !important;
        grid-row: 1 / 3 !important;
        position: static !important;
        float: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 30px !important;
        height: 42px !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .subjectParent {
        grid-column: 2 !important;
        grid-row: 1 !important;
        position: static !important;
        float: none !important;
        min-width: 0 !important;
        width: auto !important;
        height: 21px !important;
        margin: 0 !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .senderParent {
        grid-column: 2 / 5 !important;
        grid-row: 2 !important;
        position: static !important;
        float: none !important;
        min-width: 0 !important;
        width: auto !important;
        height: 21px !important;
        margin: 0 !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .dateParent {
        grid-column: 3 !important;
        grid-row: 1 !important;
        position: static !important;
        float: none !important;
        width: auto !important;
        height: 21px !important;
        margin: 0 5px !important;
        white-space: nowrap !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .threadsParent {
        grid-column: 4 !important;
        grid-row: 1 !important;
        position: static !important;
        float: none !important;
        height: 21px !important;
        margin: 0 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .flagParent {
        grid-column: 5 !important;
        grid-row: 1 !important;
        position: static !important;
        float: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 31px !important;
        height: 21px !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .attachmentParent {
        grid-column: 5 !important;
        grid-row: 2 !important;
        position: static !important;
        float: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 31px !important;
        height: 21px !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        box-sizing: border-box !important;
      }
      /* The subject is now the heading; sender/address is supporting text. */
      html.ady-redesign #rl-sub-left .messageListItem .subject,
      html.ady-redesign #rl-sub-left .messageListItem .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem .subject-suffix {
        color: var(--ady-ink) !important;
        font-weight: 600 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .sender {
        color: var(--ady-muted) !important;
        font-weight: 400 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-suffix {
        font-weight: 700 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .sender {
        color: var(--ady-ink-soft) !important;
        font-weight: 500 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject,
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-suffix,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-suffix {
        font-weight: 600 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected .sender,
      html.ady-redesign #rl-sub-left .messageListItem.focused .sender {
        color: var(--ady-muted) !important;
        font-weight: 400 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent::before {
        display: none !important;
        content: none !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .delimiter {
        border-color: var(--ady-line) !important;
        background: var(--ady-line) !important;
      }

      /* Neutral read mail: subject is primary, sender is secondary. */
      html.ady-redesign #rl-sub-left .messageListItem .sender {
        color: var(--ady-muted) !important;
        font-weight: 400 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .subject,
      html.ady-redesign #rl-sub-left .messageListItem .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem .subject-suffix {
        color: var(--ady-ink) !important;
        font-weight: 600 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .date {
        color: var(--ady-muted) !important;
      }

      /* Hover only for neutral rows. */
      html.ady-redesign #rl-sub-left .messageListItem:not(.unseen):not(.selected):not(.focused):hover {
        background: color-mix(in srgb, var(--ady-navy) 4%, var(--ady-paper-strong)) !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem:hover {
        transform: translateY(-1px) !important;
      }

      /* Unread: 3.1.18 geometry — inset bar clipped by the card radius. */
      html.ady-redesign #rl-sub-left .messageListItem.unseen {
        background: color-mix(in srgb, var(--ady-navy) 12%, var(--ady-paper-strong)) !important;
        background-image: none !important;
        box-shadow:
          inset 4px 0 0 var(--ady-navy),
          0 0 0 1px color-mix(in srgb, var(--ady-navy) 16%, transparent) !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen > .sidebarParent,
      html.ady-redesign #rl-sub-left .messageListItem.unseen > .wrapper {
        background: transparent !important;
        box-shadow: none !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .sender {
        color: var(--ady-ink-soft) !important;
        font-weight: 500 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-suffix {
        font-weight: 700 !important;
      }

      /* Open/selected: same inset geometry, neutral gray instead of red. */
      html.ady-redesign #rl-sub-left .messageListItem.selected,
      html.ady-redesign #rl-sub-left .messageListItem.focused {
        background: color-mix(in srgb, var(--ady-ink) 7%, var(--ady-paper-strong)) !important;
        background-image: none !important;
        box-shadow:
          inset 4px 0 0 color-mix(in srgb, var(--ady-ink) 55%, var(--ady-muted)),
          0 0 0 1px color-mix(in srgb, var(--ady-ink) 12%, transparent) !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected > .sidebarParent,
      html.ady-redesign #rl-sub-left .messageListItem.selected > .wrapper,
      html.ady-redesign #rl-sub-left .messageListItem.focused > .sidebarParent,
      html.ady-redesign #rl-sub-left .messageListItem.focused > .wrapper {
        background: transparent !important;
        box-shadow: none !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected .sender,
      html.ady-redesign #rl-sub-left .messageListItem.focused .sender {
        color: var(--ady-muted) !important;
        font-weight: 400 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject,
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-suffix,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-suffix {
        color: var(--ady-ink) !important;
        font-weight: 600 !important;
      }

      html.ady-redesign #rl-sub-left .b-footer {
        height: 44px !important;
        padding: 7px 12px !important;
        border: 0 !important;
        border-top: 1px solid var(--ady-line) !important;
        background: var(--ady-panel) !important;
      }

      html.ady-redesign #rl-sub-right { transition: left 180ms ease !important; }
      html.ady-redesign #rl-sub-right .messageView > .top-toolbar {
        right: 0 !important;
        left: 0 !important;
        height: 58px !important;
        padding: 12px 18px !important;
        border: 0 !important;
        border-bottom: 1px solid var(--ady-line) !important;
        background: var(--ady-paper-strong) !important;
        box-shadow: none !important;
      }
      html.ady-redesign #rl-sub-right .messageView > .top-toolbar .btn,
      html.ady-redesign #rl-sub-left .btn {
        border-color: var(--ady-line-strong) !important;
        border-radius: 4px !important;
        background: var(--ady-paper-strong) !important;
        box-shadow: none !important;
        color: var(--ady-ink-soft) !important;
        text-shadow: none !important;
        transition: all 180ms ease !important;
      }
      html.ady-redesign #rl-sub-right .messageView > .top-toolbar .btn-success,
      html.ady-redesign #rl-sub-right .messageView > .top-toolbar .buttonReply {
        border-color: var(--ady-navy) !important;
        background: var(--ady-navy) !important;
        color: var(--ady-paper-strong) !important;
      }
      html.ady-redesign #rl-sub-right .b-message-view-wrapper {
        top: 58px !important;
        right: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        width: auto !important;
        height: auto !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: var(--ady-paper-strong) !important;
        box-shadow: none !important;
      }
      html.ady-redesign #rl-sub-right .b-message-view-wrapper .messageItem {
        max-width: 860px !important;
        margin-inline: auto !important;
      }
      html.ady-redesign #rl-sub-right .b-message-view-backdrop,
      html.ady-redesign #rl-sub-right .b-message-view-iframe { background: var(--ady-paper-strong) !important; }
      html.ady-redesign #rl-sub-right .messageHeader {
        border-color: var(--ady-line) !important;
        background: var(--ady-paper-strong) !important;
        color: var(--ady-ink) !important;
      }
      html.ady-redesign #rl-sub-right .message-fixed-button-toolbar {
        border-color: var(--ady-line) !important;
        background: color-mix(in srgb, var(--ady-paper-strong) 94%, transparent) !important;
      }
      html.ady-redesign #rl-sub-right .b-message-view-wrapper {
        z-index: 101 !important;
      }
      html.ady-redesign #rl-sub-right .messageItem .buttonUp,
      html.ady-redesign #rl-sub-right .messageItem .buttonFull,
      html.ady-redesign #rl-sub-right .messageItem .buttonUnFull {
        z-index: 120 !important;
        opacity: .78 !important;
        pointer-events: auto !important;
      }
      html.ady-redesign #rl-sub-right .messageItem .buttonUp:hover,
      html.ady-redesign #rl-sub-right .messageItem .buttonFull:hover,
      html.ady-redesign #rl-sub-right .messageItem .buttonUnFull:hover {
        opacity: 1 !important;
      }
      
      /* Attachment Grid */
      html.ady-redesign .attachmentsPlace .attachmentList {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
        gap: 8px !important;
        padding: 8px !important;
      }
      html.ady-redesign .attachmentItem {
        border-radius: 8px !important;
        border: 1px solid var(--ady-line) !important;
        background: var(--ady-paper) !important;
        transition: border-color 180ms ease, box-shadow 180ms ease, transform 120ms ease !important;
      }
      html.ady-redesign .attachmentItem:hover {
        border-color: var(--ady-navy) !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
        transform: translateY(-1px) !important;
      }
      html.ady-redesign .ady-attachments-footer {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
        gap: 10px !important;
        padding: 4px 8px 12px !important;
      }
      html.ady-redesign .ady-download-all {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 7px !important;
        min-height: 36px !important;
        padding: 0 14px !important;
        border: 1px solid var(--ady-line-strong) !important;
        border-radius: 9px !important;
        background: var(--ady-paper-strong) !important;
        color: var(--ady-ink-soft) !important;
        box-shadow: 0 1px 3px rgba(15, 23, 42, .08) !important;
        font: 600 13px/1 'Inter', sans-serif !important;
        cursor: pointer !important;
      }
      html.ady-redesign .ady-download-all:hover {
        border-color: var(--ady-navy) !important;
        background: var(--ady-blue-soft) !important;
        color: var(--ady-navy) !important;
      }
      html.ady-redesign .ady-download-all:disabled {
        cursor: wait !important;
        opacity: .65 !important;
      }
      html.ady-redesign .ady-download-all svg {
        width: 16px !important;
        height: 16px !important;
        fill: none !important;
        stroke: currentColor !important;
        stroke-width: 2 !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
      }
      html.ady-redesign .ady-download-status {
        color: var(--ady-muted) !important;
        font-size: 12px !important;
      }

      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .iconMain,
      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .iconBG,
      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .iconPreview,
      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .attachmentIcon,
      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .attachmentIconText {
        display: none !important;
      }
      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent.hasPreview:hover .iconPreview,
      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent.hasPreplay:hover .iconPreview {
        display: none !important;
        background: transparent !important;
      }

      /* File Type Icons */
      [class^="ady-ftype-"] {
        display: inline-block;
        width: 20px;
        height: 24px;
        background-size: contain;
        background-repeat: no-repeat;
        vertical-align: middle;
        flex-shrink: 0;
      }
      .ady-ftype-pdf { background-image: ${getSvgIcon('%23E53935', '<text x="8" y="14" fill="white" font-size="6" font-family="sans-serif" font-weight="bold" text-anchor="middle">PDF</text>')}; }
      .ady-ftype-doc { background-image: ${getSvgIcon('%231E88E5', '<text x="8" y="14" fill="white" font-size="8" font-family="sans-serif" font-weight="bold" text-anchor="middle">W</text>')}; }
      .ady-ftype-xls { background-image: ${getSvgIcon('%2343A047', '<rect x="4" y="8" width="8" height="8" fill="none" stroke="white" stroke-width="1.5"/><line x1="8" y1="8" x2="8" y2="16" stroke="white" stroke-width="1.5"/><line x1="4" y1="12" x2="12" y2="12" stroke="white" stroke-width="1.5"/>')}; }
      .ady-ftype-ppt { background-image: ${getSvgIcon('%23FB8C00', '<rect x="3" y="9" width="10" height="6" fill="none" stroke="white" stroke-width="1.5"/>')}; }
      .ady-ftype-zip { background-image: ${getSvgIcon('%236D4C41', '<path d="M8 5V15M6 7H10M6 9H10M6 11H10M7 13H9V15H7Z" stroke="white" fill="none" stroke-width="1.5"/>')}; }
      .ady-ftype-img { background-image: ${getSvgIcon('%238E24AA', '<circle cx="6" cy="9" r="1.5" fill="white"/><path d="M2 16L6 11L9 14L11 12L14 16Z" fill="white"/>')}; }
      .ady-ftype-vid { background-image: ${getSvgIcon('%23D81B60', '<polygon points="6,8 11,12 6,16" fill="white"/>')}; }
      .ady-ftype-aud { background-image: ${getSvgIcon('%23F9A825', '<path d="M6 15C5 15 4 14 4 13C4 12 5 11 6 11C7.1 11 8 11.9 8 13V8H11V10H9V13C9 14.1 8.1 15 7 15Z" fill="white"/>')}; }
      .ady-ftype-code { background-image: ${getSvgIcon('%2337474F', '<path d="M6 9L3 12L6 15M10 9L13 12L10 15" fill="none" stroke="white" stroke-width="1.5"/>')}; }
      .ady-ftype-txt { background-image: ${getSvgIcon('%2378909C', '<line x1="4" y1="9" x2="12" y2="9" stroke="white" stroke-width="1.5"/><line x1="4" y1="12" x2="12" y2="12" stroke="white" stroke-width="1.5"/><line x1="4" y1="15" x2="8" y2="15" stroke="white" stroke-width="1.5"/>')}; }
      .ady-ftype-eml { background-image: ${getSvgIcon('%231565C0', '<path d="M3 9L8 13L13 9V15H3V9Z" fill="white"/><path d="M3 7H13V8L8 12L3 8V7Z" fill="white"/>')}; }
      .ady-ftype-unknown { background-image: ${getSvgIcon('%239E9E9E', '<circle cx="8" cy="12" r="1.5" fill="white"/><circle cx="5" cy="12" r="1.5" fill="white"/><circle cx="11" cy="12" r="1.5" fill="white"/>')}; }

      html.ady-redesign[data-ady-density="compact"] #rl-sub-left .messageListItem,
      html.ady-redesign[data-ady-density="compact"] #rl-sub-left .messageListItem > .sidebarParent,
      html.ady-redesign[data-ady-density="compact"] #rl-sub-left .messageListItem > .wrapper { height: 58px !important; }
      html.ady-redesign[data-ady-density="spacious"] #rl-sub-left .messageListItem,
      html.ady-redesign[data-ady-density="spacious"] #rl-sub-left .messageListItem > .sidebarParent,
      html.ady-redesign[data-ady-density="spacious"] #rl-sub-left .messageListItem > .wrapper { height: 94px !important; }

      html.ady-redesign.ady-focus #rl-left,
      html.ady-redesign.ady-focus #rl-sub-left,
      html.ady-redesign.ady-focus #ady-folder-resizer,
      html.ady-redesign.ady-focus #ady-list-resizer { display: none !important; }
      html.ady-redesign:has(#rl-sub-right .messageView.message-focused) #ady-folder-resizer,
      html.ady-redesign:has(#rl-sub-right .messageView.message-focused) #ady-list-resizer {
        display: none !important;
        pointer-events: none !important;
      }
      html.ady-redesign.ady-focus #rl-right,
      html.ady-redesign.ady-focus #rl-sub-right { left: 0 !important; }

      #ady-folder-resizer,
      #ady-list-resizer {
        position: absolute;
        z-index: 20000;
        top: 0;
        bottom: 0;
        width: 7px;
        margin-left: -3px;
        cursor: col-resize;
        touch-action: none;
        background: transparent;
      }
      #ady-folder-resizer::after,
      #ady-list-resizer::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 3px;
        width: 1px;
        background: var(--ady-line);
        transition: width 180ms ease, background 180ms ease;
      }
      #ady-folder-resizer:hover::after,
      #ady-list-resizer:hover::after,
      #ady-folder-resizer.ady-dragging::after,
      #ady-list-resizer.ady-dragging::after { width: 3px; background: var(--ady-accent); box-shadow: 0 0 8px var(--ady-accent); }

      html.ady-resizing,
      html.ady-resizing * { cursor: col-resize !important; user-select: none !important; }
    }

    @media (prefers-reduced-motion: reduce) {
      html.ady-redesign *, html.ady-redesign *::before, html.ady-redesign *::after {
        transition-duration: .01ms !important;
        animation-duration: .01ms !important;
      }
    }
  `;
  document.documentElement.appendChild(style);

  function rememberOriginal(element) {
    if (element && !originals.has(element)) originals.set(element, element.getAttribute('style'));
  }

  function setImportant(element, property, value) {
    if (!element) return;
    element.style.setProperty(property, value, 'important');
  }

  function restoreOriginals() {
    for (const [element, original] of originals) {
      if (!element.isConnected) continue;
      if (original === null) element.removeAttribute('style');
      else element.setAttribute('style', original);
    }
  }

  function clamp(value, min, max) {
    return Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
  }

  function applyLayout(persist = false) {
    if (isSettingsOpen()) return;
    if (!state.enabled || window.innerWidth < 800 || !center || !left || !right || !subLeft || !subRight) return;
    const total = center.getBoundingClientRect().width;
    state.folderWidth = clamp(state.folderWidth, MIN_FOLDER, Math.min(340, total - MIN_LIST - MIN_READER));
    state.listWidth = clamp(state.listWidth, MIN_LIST, total - state.folderWidth - MIN_READER);

    const effectiveFolderWidth = state.collapsed ? 56 : state.folderWidth;

    setImportant(left, 'left', '0px');
    setImportant(left, 'right', 'auto');
    setImportant(left, 'width', `${effectiveFolderWidth}px`);
    setImportant(right, 'left', state.focus ? '0px' : `${effectiveFolderWidth}px`);
    setImportant(right, 'right', '0px');
    setImportant(subLeft, 'left', '0px');
    setImportant(subLeft, 'right', 'auto');
    setImportant(subLeft, 'width', `${state.listWidth}px`);
    setImportant(subRight, 'left', state.focus ? '0px' : `${state.listWidth}px`);
    setImportant(subRight, 'right', '0px');

    const messageFullscreen = Boolean(document.querySelector('#rl-sub-right .messageView.message-focused'));
    const hideResizers = state.focus || messageFullscreen;
    if (folderHandle) {
      folderHandle.style.left = `${effectiveFolderWidth}px`;
      folderHandle.style.display = (state.collapsed || hideResizers) ? 'none' : 'block';
      folderHandle.style.pointerEvents = hideResizers ? 'none' : '';
    }
    if (listHandle) {
      listHandle.style.left = `${state.listWidth}px`;
      listHandle.style.display = hideResizers ? 'none' : 'block';
      listHandle.style.pointerEvents = hideResizers ? 'none' : '';
    }

    if (persist) {
      GM_setValue(KEYS.folderWidth, state.folderWidth);
      GM_setValue(KEYS.listWidth, state.listWidth);
    }
  }

  function applyState() {
    document.documentElement.classList.toggle('ady-redesign', state.enabled);
    document.documentElement.classList.toggle('ady-focus', state.enabled && state.focus);
    document.documentElement.classList.toggle('ady-collapsed', state.enabled && state.collapsed);
    document.documentElement.dataset.adyTheme = state.theme;
    document.documentElement.dataset.adyDensity = state.density;
    if (folderHandle) folderHandle.hidden = !state.enabled;
    if (listHandle) listHandle.hidden = !state.enabled;
    if (!state.enabled) restoreOriginals();
    window.dispatchEvent(new Event('resize'));
    if (state.enabled) requestAnimationFrame(() => applyLayout());
  }

  function isSettingsOpen() {
    const routeMatch = /(?:^|#\/)settings(?:\/|$)/i.test(location.hash);
    if (routeMatch) return true;
    return [...document.querySelectorAll('.b-settings.b-settins-right, .b-settins-right')].some((pane) => {
      if (!pane.getClientRects().length) return false;
      const style = getComputedStyle(pane);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
  }

  function suspendRedesignForSettings() {
    if (!isSettingsOpen()) return false;

    // Settings must remain completely native RainLoop UI.
    document.documentElement.classList.remove('ady-redesign', 'ady-focus', 'ady-collapsed', 'ady-settings-open');
    document.documentElement.removeAttribute('data-ady-theme');
    document.documentElement.removeAttribute('data-ady-density');

    folderHandle?.remove();
    listHandle?.remove();
    folderHandle = null;
    listHandle = null;

    restoreOriginals();
    return true;
  }

  function createHandle(id, kind) {
    const handle = document.createElement('div');
    handle.id = id;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.tabIndex = 0;
    let startX = 0;
    let startValue = 0;

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      startX = event.clientX;
      startValue = kind === 'folder' ? state.folderWidth : state.listWidth;
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('ady-dragging');
      document.documentElement.classList.add('ady-resizing');
      event.preventDefault();
    });
    handle.addEventListener('pointermove', (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const value = startValue + event.clientX - startX;
      if (kind === 'folder') state.folderWidth = value;
      else state.listWidth = value;
      applyLayout();
    });
    const finish = (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      handle.releasePointerCapture(event.pointerId);
      handle.classList.remove('ady-dragging');
      document.documentElement.classList.remove('ady-resizing');
      applyLayout(true);
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const delta = (event.shiftKey ? 24 : 8) * (event.key === 'ArrowRight' ? 1 : -1);
      if (kind === 'folder') state.folderWidth += delta;
      else state.listWidth += delta;
      applyLayout(true);
      event.preventDefault();
    });
    return handle;
  }

  function visibleItems() {
    return [...document.querySelectorAll('#rl-sub-left .messageListItem')].filter((item) => item.getClientRects().length);
  }

  function openRelative(direction) {
    const items = visibleItems();
    if (!items.length) return;
    const current = document.querySelector('#rl-sub-left .messageListItem.selected, #rl-sub-left .messageListItem.focused');
    const currentIndex = items.indexOf(current);
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : items.length - 1)
      : clamp(currentIndex + direction, 0, items.length - 1);
    items[nextIndex].click();
    items[nextIndex].scrollIntoView({ block: 'nearest' });
  }

  document.addEventListener('keydown', (event) => {
    if (!state.enabled || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (event.code === 'KeyJ') {
      openRelative(1);
      event.preventDefault();
    } else if (event.code === 'KeyK') {
      openRelative(-1);
      event.preventDefault();
    } else if (event.code === 'Slash') {
      const search = document.querySelector('input.inputSearch');
      if (search?.getClientRects().length) {
        search.focus();
        search.select?.();
        event.preventDefault();
      }
    } else if (event.code === 'KeyR') {
      const reply = [...document.querySelectorAll('#rl-sub-right a.buttonReply:not(.disabled), #rl-sub-right a[data-bind*="replyCommand"]:not(.disabled)')]
        .find((item) => item.getClientRects().length);
      if (reply) {
        reply.click();
        event.preventDefault();
      }
    } else if (event.key === 'Escape' && state.focus) {
      state.focus = false;
      GM_setValue(KEYS.focus, false);
      applyState();
    }
  });

  document.addEventListener('click', (event) => {
    const resize = event.target.closest?.('#rl-left .b-footer .buttonResize');
    if (!resize || !state.enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.collapsed = !state.collapsed;
    GM_setValue(KEYS.collapsed, state.collapsed);
    resize.title = state.collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель';
    resize.setAttribute('aria-label', resize.title);
    applyState();
  }, true);

  function positionMessageButtons() {
    if (!state.enabled) return;
    const messageItem = document.querySelector('#rl-sub-right .messageItem');
    if (!messageItem || !messageItem.getClientRects().length) return;

    const rect = messageItem.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const baseRight = Math.max(16, Math.round(window.innerWidth - rect.right + 16));
    const baseBottom = Math.max(16, Math.round(window.innerHeight - rect.bottom + 16));
    const controls = [
      [messageItem.querySelector('.buttonUp'), baseRight + 40],
      [messageItem.querySelector('.buttonFull'), baseRight],
      [messageItem.querySelector('.buttonUnFull'), baseRight],
    ];

    for (const [button, rightOffset] of controls) {
      if (!button) continue;
      button.style.setProperty('right', `${rightOffset}px`, 'important');
      button.style.setProperty('bottom', `${baseBottom}px`, 'important');
      button.style.setProperty('z-index', '120', 'important');
      if (!button.dataset.adyRepositionBound) {
        button.dataset.adyRepositionBound = 'true';
        button.addEventListener('click', () => {
          requestAnimationFrame(() => {
            positionMessageButtons();
            applyLayout();
          });
          window.setTimeout(() => {
            positionMessageButtons();
            applyLayout();
          }, 80);
        });
      }
    }
  }

  function decorateAttachments() {
    if (!state.enabled) return;
    document.querySelectorAll('#rl-sub-right .attachmentItem:not(.ady-decorated)').forEach(item => {
      item.classList.add('ady-decorated');
      const nameEl = item.querySelector('.attachmentNameParent .attachmentName, .attachmentName');
      const iconParent = item.querySelector('.attachmentIconParent');
      if (nameEl && iconParent) {
        const filename = nameEl.textContent.trim();
        const cls = getFileTypeClass(filename);
        const icon = document.createElement('span');
        icon.className = cls;
        icon.setAttribute('aria-hidden', 'true');
        const existingIcon = iconParent.querySelector('.iconMain, .iconBG');
        if (existingIcon) existingIcon.style.display = 'none';
        iconParent.style.display = 'flex';
        iconParent.style.alignItems = 'center';
        iconParent.style.justifyContent = 'center';
        iconParent.appendChild(icon);
      }
    });
    document.querySelectorAll('#rl-sub-right .attachmentsPlace').forEach(addDownloadAllButton);
  }

  function attachmentDownloadLink(item) {
    const directLink = [...item.querySelectorAll('a[href]')].find((node) => /\/Download\//i.test(node.href));
    if (directLink?.href) return directLink.href;

    // RainLoop keeps non-preview download URLs in its view model. Its dragstart
    // handler exposes the same URL as a DownloadURL payload, so use that before
    // falling back to a preview link.
    if (typeof DataTransfer !== 'undefined' && typeof DragEvent !== 'undefined') {
      try {
        const dataTransfer = new DataTransfer();
        item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
        const payload = dataTransfer.getData('DownloadURL');
        const protocolIndex = payload.indexOf('://');
        const separatorIndex = protocolIndex > -1 ? payload.lastIndexOf(':', protocolIndex) : -1;
        const dragLink = separatorIndex > -1 ? payload.slice(separatorIndex + 1) : '';
        if (dragLink) return dragLink;
      } catch (error) {
        // Some browsers do not allow constructing DataTransfer outside a real drag.
      }
    }

    const link = [...item.querySelectorAll('a[href]')].find((node) => /download|raw|attachment/i.test(node.href)) || item.querySelector('a[href]');
    return link?.href || item.dataset.downloadUrl || item.dataset.url || '';
  }

  function uniqueFilename(name, used) {
    const clean = (name || 'attachment').replace(/[\\/:*?"<>|]/g, '_').trim() || 'attachment';
    const dot = clean.lastIndexOf('.');
    const stem = dot > 0 ? clean.slice(0, dot) : clean;
    const ext = dot > 0 ? clean.slice(dot) : '';
    let result = clean;
    let index = 2;
    while (used.has(result.toLocaleLowerCase())) result = `${stem} (${index++})${ext}`;
    used.add(result.toLocaleLowerCase());
    return result;
  }

  async function fetchAttachment(file) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(file.url, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Ошибка загрузки: ${file.name}`);
      return response.blob();
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(`Слишком долго загружается: ${file.name}`);
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const ZIP_CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < table.length; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let value = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) value = ZIP_CRC_TABLE[(value ^ bytes[index]) & 0xFF] ^ (value >>> 8);
    return (value ^ 0xFFFFFFFF) >>> 0;
  }

  function writeUint16(bytes, offset, value) {
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true);
  }

  function writeUint32(bytes, offset, value) {
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
  }

  function zipDateParts(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  async function createStoredZip(entries, onProgress) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    const dateParts = zipDateParts(new Date());
    let offset = 0;
    let centralSize = 0;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      onProgress(index, entries.length, entry.name);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const nameBytes = encoder.encode(entry.name);
      const data = new Uint8Array(await entry.blob.arrayBuffer());
      const checksum = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      writeUint32(local, 0, 0x04034B50);
      writeUint16(local, 4, 20);
      writeUint16(local, 6, 0x0800);
      writeUint16(local, 8, 0);
      writeUint16(local, 10, dateParts.time);
      writeUint16(local, 12, dateParts.date);
      writeUint32(local, 14, checksum);
      writeUint32(local, 18, data.byteLength);
      writeUint32(local, 22, data.byteLength);
      writeUint16(local, 26, nameBytes.length);
      writeUint16(local, 28, 0);
      local.set(nameBytes, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + nameBytes.length);
      writeUint32(central, 0, 0x02014B50);
      writeUint16(central, 4, 20);
      writeUint16(central, 6, 20);
      writeUint16(central, 8, 0x0800);
      writeUint16(central, 10, 0);
      writeUint16(central, 12, dateParts.time);
      writeUint16(central, 14, dateParts.date);
      writeUint32(central, 16, checksum);
      writeUint32(central, 20, data.byteLength);
      writeUint32(central, 24, data.byteLength);
      writeUint16(central, 28, nameBytes.length);
      writeUint16(central, 30, 0);
      writeUint16(central, 32, 0);
      writeUint16(central, 34, 0);
      writeUint16(central, 36, 0);
      writeUint32(central, 38, 0);
      writeUint32(central, 42, offset);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.byteLength + data.byteLength;
      centralSize += central.byteLength;
    }

    onProgress(entries.length, entries.length, '');
    const end = new Uint8Array(22);
    writeUint32(end, 0, 0x06054B50);
    writeUint16(end, 4, 0);
    writeUint16(end, 6, 0);
    writeUint16(end, 8, entries.length);
    writeUint16(end, 10, entries.length);
    writeUint32(end, 12, centralSize);
    writeUint32(end, 16, offset);
    writeUint16(end, 20, 0);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function downloadAllAttachments(place, button, status) {
    const files = [...place.querySelectorAll('.attachmentItem')].map((item) => ({
      name: item.querySelector('.attachmentName')?.textContent.trim() || 'attachment',
      url: attachmentDownloadLink(item)
    }));
    if (!files.length || files.some((file) => !file.url)) throw new Error('Не удалось получить ссылки на все вложения');
    button.disabled = true;
    try {
      let loaded = 0;
      status.textContent = `Загрузка 0 из ${files.length}`;
      const blobs = await Promise.all(files.map(async (file) => {
        const blob = await fetchAttachment(file);
        status.textContent = `Загружено ${++loaded} из ${files.length}`;
        return blob;
      }));
      const used = new Set();
      const entries = files.map((file, index) => ({ name: uniqueFilename(file.name, used), blob: blobs[index] }));
      status.textContent = 'Подготовка архива…';
      const blob = await createStoredZip(entries, (current, total) => {
        status.textContent = current === total ? 'Архив готовится к скачиванию…' : `Создание архива: ${current + 1} из ${total}`;
      });
      const subject = document.querySelector('#rl-sub-right .subject, #rl-sub-right .messageSubject')?.textContent.trim() || 'attachments';
      downloadBlob(blob, `${subject.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'attachments'}.zip`);
      status.textContent = `Скачано файлов: ${files.length}`;
    } finally {
      button.disabled = false;
    }
  }

  function addDownloadAllButton(place) {
    const attachments = place.querySelectorAll('.attachmentItem');
    const existingFooter = place.querySelector('.ady-attachments-footer');
    if (attachments.length < 2) {
      existingFooter?.remove();
      return;
    }
    if (existingFooter) return;
    const footer = document.createElement('div');
    footer.className = 'ady-attachments-footer';
    footer.innerHTML = `<span class="ady-download-status" role="status" aria-live="polite"></span><button type="button" class="ady-download-all"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span>Скачать всё</span></button>`;
    const button = footer.querySelector('.ady-download-all');
    const status = footer.querySelector('.ady-download-status');
    button.addEventListener('click', () => downloadAllAttachments(place, button, status).catch((error) => { status.textContent = error.message; button.disabled = false; }));
    place.appendChild(footer);
  }

  console.assert(uniqueFilename('file.pdf', new Set(['file.pdf'])) === 'file (2).pdf', 'ady: duplicate attachment names');

  function installRecipientMenu() {
    if (document.querySelector('.ady-recipient-menu')) return;
    const menu = document.createElement('div');
    menu.className = 'ady-recipient-menu';
    menu.setAttribute('role', 'listbox');
    document.body.appendChild(menu);

    const pinnedAddresses = new Set(FREQUENT_RECIPIENTS.map(([, address]) => address.toLowerCase()));
    const emailPattern = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
    const cleanName = (value) => (value || '').replace(/[<>\"]/g, '').trim();
    const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);

    const normalizeStoredRecipients = () => {
      const now = Date.now();
      const seen = new Set();
      recentRecipients = recentRecipients
        .filter((entry) => entry && typeof entry.address === 'string' && emailPattern.test(entry.address))
        .map((entry, index) => ({
          name: cleanName(entry.name),
          address: entry.address.trim(),
          uses: Math.max(1, Number(entry.uses) || 1),
          lastUsed: Number(entry.lastUsed) || (now - index)
        }))
        .filter((entry) => {
          const key = entry.address.toLowerCase();
          if (seen.has(key) || pinnedAddresses.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 40);
      GM_setValue(KEYS.recentRecipients, recentRecipients);
    };

    const saveRecentRecipients = () => {
      recentRecipients.sort((a, b) => (Number(b.uses) || 0) - (Number(a.uses) || 0) || (Number(b.lastUsed) || 0) - (Number(a.lastUsed) || 0));
      recentRecipients = recentRecipients.slice(0, 40);
      GM_setValue(KEYS.recentRecipients, recentRecipients);
    };

    const rememberRecipient = (name, address, bumpUsage = false) => {
      const normalizedAddress = (address || '').trim();
      if (!emailPattern.test(normalizedAddress)) return false;
      const key = normalizedAddress.toLowerCase();
      if (pinnedAddresses.has(key)) return false;

      const normalizedName = cleanName(name);
      const existing = recentRecipients.find((entry) => entry.address.toLowerCase() === key);
      if (existing) {
        let changed = false;
        if (normalizedName && normalizedName !== existing.name) {
          existing.name = normalizedName;
          changed = true;
        }
        if (bumpUsage) {
          existing.uses = Math.max(1, Number(existing.uses) || 1) + 1;
          existing.lastUsed = Date.now();
          changed = true;
        }
        return changed;
      }

      recentRecipients.push({
        name: normalizedName,
        address: normalizedAddress,
        uses: bumpUsage ? 1 : 0,
        lastUsed: bumpUsage ? Date.now() : 0
      });
      return true;
    };

    const recipientFromNode = (node) => {
      if (!node) return null;
      const sources = [
        node.getAttribute?.('data-value'),
        node.getAttribute?.('data-email'),
        node.getAttribute?.('title'),
        node.textContent
      ].filter(Boolean);
      for (const source of sources) {
        const address = String(source).match(emailPattern)?.[0];
        if (!address) continue;
        return {
          address,
          name: cleanName(node.textContent.replace(address, ''))
        };
      }
      return null;
    };

    const rememberStockSuggestions = () => {
      let changed = false;
      const nodes = new Set(document.querySelectorAll([
        '.ui-autocomplete li',
        '.ui-autocomplete .ui-menu-item',
        '.ui-autocomplete [data-value]',
        '.ui-autocomplete [data-email]'
      ].join(',')));
      for (const node of nodes) {
        const recipient = recipientFromNode(node);
        if (recipient && rememberRecipient(recipient.name, recipient.address, false)) changed = true;
      }
      if (changed) saveRecentRecipients();
      return changed;
    };

    const rememberChosenRecipients = () => {
      let changed = false;
      document.querySelectorAll('.inputosaurus-container li:not(.inputosaurus-input)').forEach((item) => {
        if (item.dataset.adyRecipientRemembered === 'true') return;
        const recipient = recipientFromNode(item);
        if (!recipient) return;
        item.dataset.adyRecipientRemembered = 'true';
        if (rememberRecipient(recipient.name, recipient.address, true)) changed = true;
      });
      if (changed) saveRecentRecipients();
      return changed;
    };

    normalizeStoredRecipients();

    let activeInput = null;
    const getInput = () => {
      if (activeInput?.isConnected && activeInput.getClientRects().length) return activeInput;
      return [...document.querySelectorAll('input.ui-autocomplete-input')].find((item) => item.getClientRects().length) || null;
    };

    const render = () => {
      const input = getInput();
      if (!input) return false;
      rememberStockSuggestions();
      rememberChosenRecipients();

      const query = input.value.trim().toLocaleLowerCase('ru');
      const added = new Set([...input.closest('.inputosaurus-container')?.querySelectorAll('li:not(.inputosaurus-input)') || []]
        .flatMap((item) => (item.textContent.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || []).map((address) => address.toLowerCase())));
      const matches = ([name, address]) => !added.has(address.toLowerCase()) && (!query || `${name} ${address}`.toLocaleLowerCase('ru').includes(query));
      const primary = FREQUENT_RECIPIENTS.filter(matches);
      const recent = recentRecipients
        .filter((entry) => entry?.address && !added.has(entry.address.toLowerCase()) && !pinnedAddresses.has(entry.address.toLowerCase()))
        .filter((entry) => !query || `${entry.name || ''} ${entry.address}`.toLocaleLowerCase('ru').includes(query))
        .sort((a, b) => (Number(b.uses) || 0) - (Number(a.uses) || 0) || (Number(b.lastUsed) || 0) - (Number(a.lastUsed) || 0))
        .slice(0, 20);
      const button = ([name, address]) => `<button type="button" class="ady-recipient-item" role="option" data-address="${escapeHtml(address)}"><span class="ady-recipient-name">${escapeHtml(name || address)}</span><span class="ady-recipient-address">${escapeHtml(address)}</span></button>`;
      menu.innerHTML = `${primary.length ? '<div class="ady-recipient-section">Закреплённые</div>' : ''}${primary.map(button).join('')}${recent.length ? '<div class="ady-recipient-section">Часто используемые</div>' : ''}${recent.map(({name, address}) => button([name, address])).join('')}`;
      return primary.length + recent.length > 0;
    };

    const place = () => {
      const input = getInput();
      if (!input) return;
      const rect = input.getBoundingClientRect();
      menu.style.left = `${Math.round(rect.left)}px`;
      menu.style.top = `${Math.round(rect.bottom + 6)}px`;
      menu.style.width = `${Math.max(260, Math.round(rect.width + 150))}px`;
    };

    const open = (input) => {
      activeInput = input;
      rememberStockSuggestions();
      rememberChosenRecipients();
      place();
      if (render()) menu.classList.add('is-open');
    };

    const stockObserver = new MutationObserver(() => {
      const changed = rememberStockSuggestions() || rememberChosenRecipients();
      if (changed && menu.classList.contains('is-open')) render();
    });
    stockObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener('focusin', (event) => {
      const input = event.target.closest?.('input.ui-autocomplete-input');
      if (input && input.getClientRects().length) open(input);
    });
    document.addEventListener('input', (event) => {
      const input = event.target.closest?.('input.ui-autocomplete-input');
      if (input && input.getClientRects().length) open(input);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        menu.classList.remove('is-open');
        return;
      }
      const input = event.target.closest?.('input.ui-autocomplete-input');
      if (!input || event.key !== 'Enter') return;
      const address = input.value.match(emailPattern)?.[0];
      if (address && rememberRecipient('', address, true)) saveRecentRecipients();
    });

    menu.addEventListener('mousedown', (event) => {
      const item = event.target.closest('.ady-recipient-item');
      if (!item) return;
      event.preventDefault();
      const input = getInput();
      if (!input) return;
      const name = item.querySelector('.ady-recipient-name')?.textContent || '';
      if (rememberRecipient(name, item.dataset.address, true)) saveRecentRecipients();
      activeInput = input;
      input.focus();
      input.value = item.dataset.address;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      for (const type of ['keydown', 'keypress', 'keyup']) {
        input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      }
      window.setTimeout(() => {
        rememberChosenRecipients();
        input.focus();
        place();
        render();
        menu.classList.add('is-open');
      }, 80);
    });

    document.addEventListener('click', (event) => {
      const input = getInput();
      const region = input?.closest('.inputosaurus-container');
      if (event.target !== input && !menu.contains(event.target) && !region?.contains(event.target)) menu.classList.remove('is-open');
    });
    window.addEventListener('resize', () => { if (menu.classList.contains('is-open')) place(); });
  }

  let copyToastTimer = 0;

  function normalizeAccountEmail(accountPlace) {
    if (!accountPlace) return '';
    let text = accountPlace.textContent.trim();
    if (!text) return '';

    const compact = text.replace(/\s+/g, '');
    if (compact.length % 2 === 0) {
      const half = compact.length / 2;
      const first = compact.slice(0, half);
      const second = compact.slice(half);
      if (first.toLowerCase() === second.toLowerCase() && first.includes('@')) {
        text = first;
        accountPlace.textContent = first;
      }
    }

    const emails = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [];
    if (emails.length > 1 && emails.every((email) => email.toLowerCase() === emails[0].toLowerCase())) {
      accountPlace.textContent = emails[0];
      return emails[0];
    }
    return emails[0] || text;
  }

  function normalizeSystemToolbar() {
    if (!state.enabled) return;
    const system = document.querySelector('#rl-right > div.rl-view-model.RL-SystemDropDown');
    if (!system) return;

    const systemDropDown = system.querySelector(':scope > .b-system-drop-down') || system.querySelector('.b-system-drop-down');
    if (!systemDropDown) return;

    const outerToolbar = systemDropDown.querySelector(':scope > .b-toolbar');
    const buttonToolbar = outerToolbar?.querySelector(':scope > .btn-toolbar');
    if (outerToolbar && buttonToolbar) outerToolbar.replaceWith(buttonToolbar);

    const toolbar = systemDropDown.querySelector(':scope > .btn-toolbar') || systemDropDown.querySelector('.btn-toolbar');
    if (!toolbar) return;

    const accountPlaces = [...toolbar.querySelectorAll(':scope > .accountPlace')];
    accountPlaces.slice(1).forEach((node) => node.remove());
    const accountPlace = accountPlaces[0] || toolbar.querySelector('.accountPlace');
    if (!accountPlace) return;

    const email = normalizeAccountEmail(accountPlace);
    accountPlace.setAttribute('role', 'button');
    accountPlace.setAttribute('tabindex', '0');
    accountPlace.setAttribute('aria-label', email ? `Скопировать адрес ${email}` : 'Скопировать адрес электронной почты');
    accountPlace.title = 'Нажмите, чтобы скопировать адрес';
    if (!accountPlace.dataset.adyCopyBound) {
      accountPlace.dataset.adyCopyBound = 'true';
      accountPlace.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyAccountEmail(accountPlace);
      });
      accountPlace.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        copyAccountEmail(accountPlace);
      });
    }
  }

  function showCopyToast(message) {
    let toast = document.querySelector('.ady-copy-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'ady-copy-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(copyToastTimer);
    copyToastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (_) {
        // Fall back to execCommand for older RainLoop/browser combinations.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('copy failed');
  }

  async function copyAccountEmail(accountPlace) {
    const email = normalizeAccountEmail(accountPlace);
    if (!email) return;
    try {
      await copyTextToClipboard(email);
      showCopyToast(`Скопировано: ${email}`);
    } catch (_) {
      showCopyToast('Не удалось скопировать адрес');
    }
  }

  function normalizeComposeButton() {
    const label = document.querySelector('#rl-left .buttonComposeText .i18n, #rl-left .buttonComposeText');
    if (label && label.textContent !== 'Новое') label.textContent = 'Новое';
  }

  function decorateFolders() {
    document.querySelectorAll('#rl-left .e-link:not(.ady-folder-decorated)').forEach(link => {
      const name = link.querySelector('.name')?.textContent.trim();
      if (!name) return;
      const icon = document.createElement('span');
      icon.className = 'ady-folder-icon';
      icon.innerHTML = getFolderIcon(name);
      link.prepend(icon);
      link.classList.add('ady-folder-decorated');
      link.title = name;
    });
  }

  function normalizeMessageListLayout() {
    if (!state.enabled) return;
    document.querySelectorAll('#rl-sub-left .messageListItem').forEach((item) => {
      const wrapper = item.querySelector(':scope > .wrapper');
      const senderParent = wrapper?.querySelector(':scope > .senderParent');
      const attachmentParent = wrapper?.querySelector(':scope > .attachmentParent');
      const subjectParent = wrapper?.querySelector(':scope > .subjectParent');
      if (!wrapper || !senderParent || !attachmentParent || !subjectParent) return;

      // v3.1.26 physically moved subjectParent before senderParent. Restore the
      // native RainLoop order (sender -> attachment -> subject) and let CSS Grid
      // control only the visual placement. This keeps Knockout and float-dependent
      // controls such as attachment/reply icons intact.
      if (senderParent.nextElementSibling !== attachmentParent || attachmentParent.nextElementSibling !== subjectParent) {
        wrapper.insertBefore(senderParent, subjectParent);
        wrapper.insertBefore(attachmentParent, subjectParent);
      }
      item.classList.remove('ady-subject-first');
      item.classList.add('ady-subject-grid');
    });
  }

  function decorateToolbarButtons() {
    const buttons = [
      [document.querySelector('#rl-left .buttonCompose'), '__compose__', 'Новое письмо'],
      [document.querySelector('#rl-left .buttonContacts'), '__contacts__', 'Контакты'],
    ];
    for (const [button, iconName, title] of buttons) {
      if (!button || button.querySelector('.ady-toolbar-icon')) continue;
      const icon = document.createElement('span');
      icon.className = 'ady-toolbar-icon';
      icon.innerHTML = getFolderIcon(iconName);
      button.prepend(icon);
      button.title = title;
    }
  }

  function decorateActionIcons() {
    const reloadButton = document.querySelector('#rl-sub-left .buttonReload');
    if (reloadButton) {
      reloadButton.removeAttribute('data-tooltip-join');
      reloadButton.removeAttribute('title');
      reloadButton.classList.add('ady-no-tooltip');
      if (!reloadButton.dataset.adyTooltipDisabled) {
        reloadButton.dataset.adyTooltipDisabled = 'true';
        reloadButton.addEventListener('mouseenter', () => {
          reloadButton.removeAttribute('title');
          reloadButton.removeAttribute('data-tooltip-join');
        });
      }
    }
    if (reloadButton && !reloadButton.querySelector('i')) {
      const icon = document.createElement('i');
      icon.className = 'ady-reload-icon';
      reloadButton.appendChild(icon);
    }
    const reloadIcon = reloadButton?.querySelector('i');
    if (reloadIcon) {
      reloadIcon.className = 'ady-reload-icon';
      reloadIcon.removeAttribute('data-bind');
      reloadIcon.innerHTML = getActionIcon('reload');
      reloadIcon.style.setProperty('background', 'transparent', 'important');
      reloadIcon.style.setProperty('background-image', 'none', 'important');
    }
    document.querySelectorAll('#rl-sub-left > div > div.toolbar .btn, #rl-left .b-toolbar a, #rl-right .system-dropdown').forEach((button) => {
      const hint = button.getAttribute('title') || button.getAttribute('aria-label') || button.textContent.trim();
      const semantic = button.classList.contains('buttonReload') ? 'Обновить список писем'
        : button.classList.contains('buttonMore') ? 'Ещё действия'
        : button.classList.contains('buttonCompose') ? 'Новое письмо'
        : button.classList.contains('buttonContacts') ? 'Контакты'
        : button.classList.contains('buttonResize') ? 'Свернуть или развернуть панель' : hint;
      if (semantic && !button.getAttribute('aria-label')) button.setAttribute('aria-label', semantic);
      button.removeAttribute('title');
      button.removeAttribute('data-tooltip');
      button.removeAttribute('data-tooltip-join');
    });
    const buttons = [
      ['#rl-sub-left .buttonReload i', 'reload'],
      ['#rl-sub-left > div > div.toolbar .button-archive i', 'archive'],
      ['#rl-sub-left > div > div.toolbar .button-spam i', 'spam'],
      ['#rl-sub-left > div > div.toolbar .button-not-spam i', 'check'],
      ['#rl-sub-left > div > div.toolbar .button-delete i', 'trash'],
      ['#rl-sub-left > div > div.toolbar .buttonMore i', 'more'],
      ['#rl-left .b-footer .buttonResize i', 'panel'],
      ['#rl-right .system-dropdown > i', 'user'],
    ];
    for (const [selector, iconName] of buttons) {
      const icon = document.querySelector(selector);
      if (!icon) continue;
      icon.querySelectorAll('svg.ady-inline-icon').forEach((svg, index) => { if (index > 0) svg.remove(); });
      icon.style.setProperty('background-image', 'none', 'important');
      icon.style.setProperty('background', 'transparent', 'important');
      if (icon.classList.contains('ady-icon-replaced')) continue;
      icon.innerHTML = getActionIcon(iconName);
      icon.classList.add('ady-icon-replaced');
    }
    document.querySelectorAll('#rl-sub-left > div > div.toolbar .btn').forEach((button) => {
      const icons = button.querySelectorAll('svg.ady-inline-icon');
      icons.forEach((svg, index) => { if (index > 0) svg.remove(); });
    });
    document.querySelectorAll('#rl-left .b-footer .btn i').forEach((icon, index) => {
      if (icon.classList.contains('ady-icon-replaced')) return;
      icon.innerHTML = getActionIcon(['panel', 'folderAdd', 'settings'][index] || 'more');
      icon.classList.add('ady-icon-replaced');
    });
    document.querySelectorAll('#rl-right .g-ui-menu i').forEach((icon) => {
      if (icon.classList.contains('ady-icon-replaced')) return;
      const classes = icon.className;
      const iconName = classes.includes('icon-cog') ? 'settings'
        : classes.includes('icon-user') ? 'user'
        : classes.includes('icon-plus') ? 'folderAdd'
        : classes.includes('icon-power') ? 'more'
        : 'more';
      icon.innerHTML = getActionIcon(iconName);
      icon.classList.add('ady-icon-replaced');
    });
    document.querySelectorAll('#rl-sub-left .btn-group.dropdown ul li').forEach((item) => {
      const icon = item.querySelector('i');
      const text = item.textContent.toLocaleLowerCase('ru');
      if (!icon) return;
      item.querySelector('a')?.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) node.remove();
      });
      const iconName = text.includes('непрочитан') ? 'mail' : text.includes('прочитан') ? 'mailOpen'
        : text.includes('флаг') ? 'flag' : text.includes('пересла') ? 'forward'
        : text.includes('удалить') ? 'trash' : text.includes('очистить') ? 'fire' : 'more';
      icon.className = `ady-menu-icon ady-icon-replaced ${iconName}`;
      icon.innerHTML = getActionIcon(iconName);
      icon.style.setProperty('background', 'transparent', 'important');
      icon.style.setProperty('background-image', 'none', 'important');
    });
  }

  function startAutoRefresh() {
    if (autoRefreshTimer) return;
    autoRefreshTimer = window.setInterval(() => {
      if (!state.enabled || document.visibilityState !== 'visible') return;
      if (document.querySelector('#rl-center [contenteditable="true"]')) return;
      document.documentElement.classList.add('ady-auto-refreshing');
      refreshMessageListViaApi().catch(() => {}).finally(() => {
        window.setTimeout(() => document.documentElement.classList.remove('ady-auto-refreshing'), 1200);
      });
    }, 60000);
  }

  async function refreshMessageListViaApi() {
    const current = Number(document.querySelector('#rl-sub-left .e-page.current')?.textContent.trim()) || 1;
    const folder = (location.hash.match(/mailbox\/([^/?#]+)/i)?.[1] || 'INBOX');
    const payload = {
      Action: 'MessageList',
      Folder: decodeURIComponent(folder),
      Offset: Math.max(0, (current - 1) * 30),
      Limit: 30,
      Search: document.querySelector('#rl-sub-left input.inputSearch')?.value || '',
      Sort: '',
      ThreadUid: ''
    };
    const response = await fetch(`${location.origin}/?/Api/`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`MessageList API ${response.status}`);
    // The API request refreshes the server-side list without activating the button.
    // Ask RainLoop to reconcile the current route so its own view model consumes the result.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return response;
  }

  function getPaginator() {
    return document.querySelector('#rl-sub-left .e-pagenator');
  }

  function pageEntries(pager) {
    return [...pager.querySelectorAll('.e-page')].map((el) => {
      const text = el.textContent.trim();
      const title = el.getAttribute('title') || '';
      const number = Number(text) || Number(title);
      return { el, number: Number.isFinite(number) ? number : 0 };
    }).filter((entry) => entry.number > 0);
  }

  function decoratePaginator() {
    const pager = getPaginator();
    if (!pager) return;
    let prev = pager.querySelector('.ady-page-arrow[data-direction="prev"]');
    let next = pager.querySelector('.ady-page-arrow[data-direction="next"]');
    const go = (direction) => {
      if (infiniteScrollBusy) return;
      const entries = pageEntries(pager);
      const current = pager.querySelector('.e-page.current');
      const currentNumber = Number(current?.textContent.trim()) || 1;
      const wanted = currentNumber + direction;
      const target = entries.find((entry) => entry.number === wanted) || entries.find((entry) => direction > 0 ? entry.number > currentNumber : entry.number < currentNumber);
      if (target?.el) target.el.click();
    };
    if (!prev) {
      prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'ady-page-arrow';
      prev.dataset.direction = 'prev';
      prev.textContent = '‹';
      prev.setAttribute('aria-label', 'Предыдущая страница');
      prev.addEventListener('click', () => go(-1));
      pager.prepend(prev);
    }
    if (!next) {
      next = document.createElement('button');
      next.type = 'button';
      next.className = 'ady-page-arrow';
      next.dataset.direction = 'next';
      next.textContent = '›';
      next.setAttribute('aria-label', 'Следующая страница');
      next.addEventListener('click', () => go(1));
      pager.append(next);
    }
  }

  function startInfiniteScroll() {
    const target = document.querySelector('#rl-sub-left .b-message-list-wrapper > .b-content');
    if (!target || target === infiniteScrollTarget) return;
    infiniteScrollTarget = target;
    target.addEventListener('scroll', () => {
      if (!state.enabled || infiniteScrollBusy || target.scrollHeight <= target.clientHeight) return;
      if (target.scrollTop + target.clientHeight < target.scrollHeight - 80) return;
      const pager = getPaginator();
      if (!pager) return;
      const current = pager.querySelector('.e-page.current');
      const currentNumber = Number(current?.textContent.trim()) || 1;
      const entries = pageEntries(pager);
      const next = entries.find((entry) => entry.number === currentNumber + 1) || entries.find((entry) => entry.number > currentNumber);
      if (!next?.el) return;
      infiniteScrollBusy = true;
      target.scrollTop = 0;
      next.el.click();
      window.setTimeout(() => {
        infiniteScrollBusy = false;
        const fresh = document.querySelector('#rl-sub-left .b-message-list-wrapper > .b-content');
        if (fresh) fresh.scrollTop = 0;
      }, 3000);
    }, { passive: true });
  }

  function connect() {
    document.getElementById('ady-redesign-dock')?.remove();

    // Do not modify RainLoop settings at all. This check intentionally runs
    // before mailbox-only DOM guards because settings may not contain subpanes.
    if (suspendRedesignForSettings()) return;

    const nextCenter = document.querySelector('#rl-center');
    const nextLeft = document.querySelector('#rl-left');
    const nextRight = document.querySelector('#rl-right');
    const nextSubLeft = document.querySelector('#rl-sub-left');
    const nextSubRight = document.querySelector('#rl-sub-right');
    if (!nextCenter || !nextLeft || !nextRight || !nextSubLeft || !nextSubRight) return;

    const changed = center !== nextCenter || left !== nextLeft || right !== nextRight || subLeft !== nextSubLeft || subRight !== nextSubRight;
    center = nextCenter;
    left = nextLeft;
    right = nextRight;
    subLeft = nextSubLeft;
    subRight = nextSubRight;

    if (changed || !captured) {
      [center, left, right, subLeft, subRight].forEach(rememberOriginal);
      captured = true;
    }
    if (!folderHandle?.isConnected || folderHandle.parentElement !== center) {
      folderHandle?.remove();
      folderHandle = createHandle('ady-folder-resizer', 'folder');
      center.appendChild(folderHandle);
    }
    if (!listHandle?.isConnected || listHandle.parentElement !== right) {
      listHandle?.remove();
      listHandle = createHandle('ady-list-resizer', 'list');
      right.appendChild(listHandle);
    }
    applyState();
    normalizeSystemToolbar();
    normalizeComposeButton();
    decorateToolbarButtons();
    decorateActionIcons();
    decorateFolders();
    normalizeMessageListLayout();
    decorateAttachments();
    positionMessageButtons();
    decoratePaginator();
    startInfiniteScroll();
    installRecipientMenu();
    startAutoRefresh();
  }

  function scheduleConnect() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      connect();
    });
  }

  observer = new MutationObserver(scheduleConnect);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', () => { if (!isSettingsOpen()) { applyLayout(); positionMessageButtons(); } });
  window.addEventListener('hashchange', scheduleConnect);
  connect();
  [500, 1500, 3000].forEach((delay) => setTimeout(() => { if (state.enabled) decorateActionIcons(); }, delay));
  [250, 1000, 2500, 5000].forEach((delay) => setTimeout(connect, delay));
})();
