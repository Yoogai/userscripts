from pathlib import Path

p = Path('mail-adygheya-redesign.user.js')
s = p.read_text(encoding='utf-8')

if '// @version      3.1.20' not in s:
    raise SystemExit('Expected userscript version 3.1.20')

s = s.replace('// @version      3.1.20', '// @version      3.1.21', 1)
s = s.replace("console.log('[Почта Адыгеи Redesign v3.1.20] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.21] Скрипт инициализирован');", 1)

start = s.index('      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content > .content {\n        padding: 0 10px !important;')
end = s.index('      html.ady-redesign #rl-sub-left .b-footer {', start)

replacement = '''      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content > .content {
        padding: 0 10px !important;
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
      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent,
      html.ady-redesign #rl-sub-left .messageListItem > .wrapper {
        position: relative !important;
        height: 76px !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent::before {
        display: none !important;
        content: none !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .delimiter {
        border-color: var(--ady-line) !important;
        background: var(--ady-line) !important;
      }

      /* Neutral read mail. */
      html.ady-redesign #rl-sub-left .messageListItem .sender {
        color: var(--ady-ink) !important;
        font-weight: 500 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .subject,
      html.ady-redesign #rl-sub-left .messageListItem .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem .subject-suffix {
        color: var(--ady-ink) !important;
        font-weight: 400 !important;
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
        font-weight: 650 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-suffix {
        font-weight: 500 !important;
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
        color: var(--ady-ink) !important;
        font-weight: 500 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject,
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-suffix,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-suffix {
        color: var(--ady-ink) !important;
        font-weight: 400 !important;
      }

'''

s = s[:start] + replacement + s[end:]
p.write_text(s, encoding='utf-8')
