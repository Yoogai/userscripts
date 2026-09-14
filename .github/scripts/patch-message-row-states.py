from pathlib import Path
import re

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

text = text.replace('// @version      3.1.14', '// @version      3.1.15', 1)
text = text.replace('[Почта Адыгеи Redesign v3.1.14]', '[Почта Адыгеи Redesign v3.1.15]', 1)

pattern = re.compile(
    r"      html\.ady-redesign #rl-sub-left \.messageListItem \{.*?"
    r"      html\.ady-redesign #rl-sub-left \.messageListItem \.date \{ color: var\(--ady-muted\) !important; \}\n",
    re.S,
)

replacement = '''      html.ady-redesign #rl-sub-left .messageListItem {
        height: 76px !important;
        border: 0 !important;
        background: transparent !important;
        color: var(--ady-ink) !important;
        transition: transform 120ms ease !important;
        width: calc(100% - 10px) !important;
        margin-right: 10px !important;
        border-radius: 8px !important;
      }
      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content > .content {
        padding-right: 10px !important;
        box-sizing: border-box !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent,
      html.ady-redesign #rl-sub-left .messageListItem > .wrapper {
        position: relative !important;
        height: 76px !important;
        background: var(--ady-paper) !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        box-shadow: none !important;
        transition: background 160ms ease, box-shadow 160ms ease !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem:hover > .sidebarParent {
        background: color-mix(in srgb, var(--ady-navy) 3%, var(--ady-paper-strong)) !important;
      }

      /* Unread message: soft blue card + the same inset indicator style as folders. */
      html.ady-redesign #rl-sub-left .messageListItem.unseen > .sidebarParent {
        background: color-mix(in srgb, var(--ady-navy) 8%, var(--ady-paper-strong)) !important;
        box-shadow:
          inset 3px 0 0 var(--ady-navy),
          0 0 0 1px color-mix(in srgb, var(--ady-navy) 13%, transparent) !important;
      }

      /* Open/selected message: clearly selected without making read mail bold. */
      html.ady-redesign #rl-sub-left .messageListItem.selected > .sidebarParent,
      html.ady-redesign #rl-sub-left .messageListItem.focused > .sidebarParent {
        background: color-mix(in srgb, var(--ady-accent) 7%, var(--ady-paper-strong)) !important;
        box-shadow:
          inset 3px 0 0 var(--ady-accent),
          0 0 0 1px color-mix(in srgb, var(--ady-accent) 18%, transparent) !important;
      }

      /* Remove the old pill-shaped pseudo stripe that tapered at its ends. */
      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent::before {
        display: none !important;
        content: none !important;
      }

      html.ady-redesign #rl-sub-left .messageListItem .delimiter {
        border-color: var(--ady-line) !important;
        background: var(--ady-line) !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem:hover {
        transform: translateY(-1px) !important;
      }

      /* Read mail uses regular typography; state is communicated by the card background. */
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

      /* Unread mail may stay slightly heavier, but no longer relies on bold alone. */
      html.ady-redesign #rl-sub-left .messageListItem.unseen .sender {
        font-weight: 650 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-suffix {
        font-weight: 500 !important;
      }

      /* A read selected message must not become bold just because it is open. */
      html.ady-redesign #rl-sub-left .messageListItem.selected:not(.unseen) .sender,
      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .sender {
        color: var(--ady-ink) !important;
        font-weight: 500 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected:not(.unseen) .subject,
      html.ady-redesign #rl-sub-left .messageListItem.selected:not(.unseen) .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.selected:not(.unseen) .subject-suffix,
      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .subject,
      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .subject-suffix {
        color: var(--ady-ink) !important;
        font-weight: 400 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .date { color: var(--ady-muted) !important; }
'''

text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'message list CSS block replacement count: {count}')

path.write_text(text, encoding='utf-8')
