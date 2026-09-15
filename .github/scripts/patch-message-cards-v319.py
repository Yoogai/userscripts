from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

if '// @version      3.1.18' not in text:
    raise SystemExit('Expected userscript version 3.1.18')

text = text.replace('// @version      3.1.18', '// @version      3.1.19', 1)
text = text.replace('[Почта Адыгеи Redesign v3.1.18]', '[Почта Адыгеи Redesign v3.1.19]', 1)

start = text.index('      html.ady-redesign #rl-sub-left .messageListItem {\n        height: 76px !important;')
end = text.index('      html.ady-redesign #rl-sub-left .b-footer {', start)

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
      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent {
        position: relative !important;
        float: left !important;
        width: 4px !important;
        height: 100% !important;
        min-width: 4px !important;
        margin: 0 !important;
        border-radius: 8px 0 0 8px !important;
        background: transparent !important;
        box-shadow: none !important;
        overflow: hidden !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem > .wrapper {
        position: relative !important;
        height: 76px !important;
        background: var(--ady-paper) !important;
        border-radius: 0 8px 8px 0 !important;
        overflow: hidden !important;
        box-shadow: none !important;
        transition: background 160ms ease !important;
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

      /* Hover only for otherwise neutral rows. */
      html.ady-redesign #rl-sub-left .messageListItem:not(.unseen):not(.selected):not(.focused):hover,
      html.ady-redesign #rl-sub-left .messageListItem:not(.unseen):not(.selected):not(.focused):hover > .wrapper {
        background: color-mix(in srgb, var(--ady-navy) 4%, var(--ady-paper-strong)) !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem:hover {
        transform: translateY(-1px) !important;
      }

      /* Unread: blue card plus a 4 px blue state bar. */
      html.ady-redesign #rl-sub-left .messageListItem.unseen,
      html.ady-redesign #rl-sub-left .messageListItem.unseen > .wrapper {
        background: var(--ady-blue-soft) !important;
        background-image: none !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen {
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--ady-navy) 18%, transparent) !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen > .sidebarParent {
        background: var(--ady-navy) !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .sender {
        font-weight: 650 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-suffix {
        font-weight: 500 !important;
      }

      /* Open/selected: neutral grey card, always wins over unread styling. */
      html.ady-redesign #rl-sub-left .messageListItem.selected,
      html.ady-redesign #rl-sub-left .messageListItem.focused,
      html.ady-redesign #rl-sub-left .messageListItem.selected > .wrapper,
      html.ady-redesign #rl-sub-left .messageListItem.focused > .wrapper {
        background: color-mix(in srgb, var(--ady-muted) 14%, var(--ady-paper-strong)) !important;
        background-image: none !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected,
      html.ady-redesign #rl-sub-left .messageListItem.focused {
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--ady-muted) 24%, transparent) !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected > .sidebarParent,
      html.ady-redesign #rl-sub-left .messageListItem.focused > .sidebarParent {
        background: color-mix(in srgb, var(--ady-ink) 58%, var(--ady-muted)) !important;
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

text = text[:start] + replacement + text[end:]
path.write_text(text, encoding='utf-8')
