from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

replacements = [
    ('// @version      3.1.13', '// @version      3.1.14', 'metadata version'),
    ("console.log('[Почта Адыгеи Redesign v3.1.13] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.14] Скрипт инициализирован');", 'console version'),
    ('      html.ady-redesign .opentip { display: none !important; }', '      html.ady-redesign .opentip,\n      html.ady-redesign .opentip-container { display: none !important; }', 'hide full opentip container'),
]

for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
