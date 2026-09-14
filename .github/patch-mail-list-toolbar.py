from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    text = text.replace(old, new, 1)


replace_once('// @version      3.1.12', '// @version      3.1.13', 'metadata version')
replace_once("console.log('[Почта Адыгеи Redesign v3.1.12] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.13] Скрипт инициализирован');", 'console version')

replace_once('''      html.ady-redesign #rl-sub-left > div > div.toolbar {
        display: flex !important;
        align-items: center !important;
        min-height: 58px !important;
''', '''      html.ady-redesign #rl-sub-left > div > div.toolbar {
        position: relative !important;
        z-index: 130 !important;
        display: flex !important;
        align-items: center !important;
        min-height: 58px !important;
        pointer-events: auto !important;
''', 'message-list toolbar stacking')

replace_once('''      html.ady-redesign #rl-sub-left > div > div.toolbar > .btn-toolbar {
        display: flex !important;
        align-items: center !important;
''', '''      html.ady-redesign #rl-sub-left > div > div.toolbar > .btn-toolbar {
        position: relative !important;
        z-index: 131 !important;
        display: flex !important;
        align-items: center !important;
        pointer-events: auto !important;
''', 'message-list btn-toolbar stacking')

replace_once('''      html.ady-redesign #rl-sub-left > div > div.toolbar .btn {
        display: inline-flex !important;
        align-items: center !important;
''', '''      html.ady-redesign #rl-sub-left > div > div.toolbar .btn {
        display: inline-flex !important;
        align-items: center !important;
        pointer-events: auto !important;
''', 'message-list button pointer events')

path.write_text(text, encoding='utf-8')
