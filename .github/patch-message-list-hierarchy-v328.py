from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    text = text.replace(old, new, 1)

replace_once('// @version      3.1.27', '// @version      3.1.28', 'metadata version')
replace_once("console.log('[Почта Адыгеи Redesign v3.1.27] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.28] Скрипт инициализирован');", 'console version')

replace_once('''      /* Neutral read mail. */
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
''', '''      /* Neutral read mail: subject is primary, sender is secondary. */
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
''', 'neutral hierarchy')

replace_once('''      html.ady-redesign #rl-sub-left .messageListItem.unseen .sender {
        font-weight: 650 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-suffix {
        font-weight: 500 !important;
      }
''', '''      html.ady-redesign #rl-sub-left .messageListItem.unseen .sender {
        color: var(--ady-ink-soft) !important;
        font-weight: 500 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-suffix {
        font-weight: 700 !important;
      }
''', 'unread hierarchy')

replace_once('''      html.ady-redesign #rl-sub-left .messageListItem.selected .sender,
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
''', '''      html.ady-redesign #rl-sub-left .messageListItem.selected .sender,
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
''', 'selected hierarchy')

path.write_text(text, encoding='utf-8')
