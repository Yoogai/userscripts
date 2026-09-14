from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    text = text.replace(old, new, 1)


replace_once('// @version      3.1.11', '// @version      3.1.12', 'metadata version')
replace_once("console.log('[Почта Адыгеи Redesign v3.1.11] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.12] Скрипт инициализирован');", 'console version')

css_marker = '''      html.ady-redesign #rl-sub-right .message-fixed-button-toolbar {
        border-color: var(--ady-line) !important;
        background: color-mix(in srgb, var(--ady-paper-strong) 94%, transparent) !important;
      }
      
      /* Attachment Grid */
'''
css_replacement = '''      html.ady-redesign #rl-sub-right .message-fixed-button-toolbar {
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
'''
replace_once(css_marker, css_replacement, 'message controls CSS')

attachment_old = '''  function addDownloadAllButton(place) {
    if (place.querySelector('.ady-attachments-footer') || !place.querySelector('.attachmentItem')) return;
    const footer = document.createElement('div');
'''
attachment_new = '''  function addDownloadAllButton(place) {
    const attachments = place.querySelectorAll('.attachmentItem');
    const existingFooter = place.querySelector('.ady-attachments-footer');
    if (attachments.length < 2) {
      existingFooter?.remove();
      return;
    }
    if (existingFooter) return;
    const footer = document.createElement('div');
'''
replace_once(attachment_old, attachment_new, 'download all threshold')

marker = '''  function decorateAttachments() {
    if (!state.enabled) return;
'''
controls_fn = '''  function positionMessageButtons() {
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
          requestAnimationFrame(positionMessageButtons);
          window.setTimeout(positionMessageButtons, 80);
        });
      }
    }
  }

  function decorateAttachments() {
    if (!state.enabled) return;
'''
replace_once(marker, controls_fn, 'message controls function')

connect_old = '''    decorateFolders();
    decorateAttachments();
    decoratePaginator();
'''
connect_new = '''    decorateFolders();
    decorateAttachments();
    positionMessageButtons();
    decoratePaginator();
'''
replace_once(connect_old, connect_new, 'connect message controls')

resize_old = "  window.addEventListener('resize', () => applyLayout());\n"
resize_new = "  window.addEventListener('resize', () => { applyLayout(); positionMessageButtons(); });\n"
replace_once(resize_old, resize_new, 'resize message controls')

path.write_text(text, encoding='utf-8')
