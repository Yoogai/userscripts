from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

replacements = [
    ('// @version      3.1.30', '// @version      3.1.31'),
    ("console.log('[Почта Адыгеи Redesign v3.1.30] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.31] Скрипт инициализирован');"),
    ("      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content > .content {\n        padding: 0 10px !important;\n        box-sizing: border-box !important;\n      }",
     "      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content > .content {\n        padding: 10px !important;\n        box-sizing: border-box !important;\n      }"),
    ("        align-content: center !important;\n        align-items: center !important;\n        padding: 5px 0 !important;\n        box-sizing: border-box !important;",
     "        align-content: center !important;\n        align-items: center !important;\n        padding: 5px 0 !important;\n        box-sizing: border-box !important;\n        transform: translateY(-4px) !important;")
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one occurrence, found {count}: {old[:80]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
