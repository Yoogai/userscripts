from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

replacements = [
    ('// @version      3.1.16', '// @version      3.1.17'),
    ("console.log('[Почта Адыгеи Redesign v3.1.16] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.17] Скрипт инициализирован');"),
    (
"""      html.ady-redesign.ady-focus #rl-left,
      html.ady-redesign.ady-focus #rl-sub-left,
      html.ady-redesign.ady-focus #ady-folder-resizer,
      html.ady-redesign.ady-focus #ady-list-resizer { display: none !important; }
""",
"""      html.ady-redesign.ady-focus #rl-left,
      html.ady-redesign.ady-focus #rl-sub-left,
      html.ady-redesign.ady-focus #ady-folder-resizer,
      html.ady-redesign.ady-focus #ady-list-resizer { display: none !important; }
      html.ady-redesign:has(#rl-sub-right .messageView.message-focused) #ady-folder-resizer,
      html.ady-redesign:has(#rl-sub-right .messageView.message-focused) #ady-list-resizer {
        display: none !important;
        pointer-events: none !important;
      }
"""
    ),
    (
"""    if (folderHandle) {
      folderHandle.style.left = `${effectiveFolderWidth}px`;
      folderHandle.style.display = state.collapsed ? 'none' : 'block';
    }
    if (listHandle) listHandle.style.left = `${state.listWidth}px`;
""",
"""    const messageFullscreen = Boolean(document.querySelector('#rl-sub-right .messageView.message-focused'));
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
"""
    ),
    (
"""        button.addEventListener('click', () => {
          requestAnimationFrame(positionMessageButtons);
          window.setTimeout(positionMessageButtons, 80);
        });
""",
"""        button.addEventListener('click', () => {
          requestAnimationFrame(() => {
            positionMessageButtons();
            applyLayout();
          });
          window.setTimeout(() => {
            positionMessageButtons();
            applyLayout();
          }, 80);
        });
"""
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Expected patch target not found:\n{old[:180]}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
