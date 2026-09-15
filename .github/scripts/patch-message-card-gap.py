from pathlib import Path

p = Path('mail-adygheya-redesign.user.js')
s = p.read_text(encoding='utf-8')

if '// @version      3.1.21' not in s:
    raise SystemExit('Expected userscript version 3.1.21')

s = s.replace('// @version      3.1.21', '// @version      3.1.22', 1)
s = s.replace("console.log('[Почта Адыгеи Redesign v3.1.21] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.22] Скрипт инициализирован');", 1)

needle = """      html.ady-redesign #rl-sub-left .messageListItem {\n        width: 100% !important;\n        height: 76px !important;\n        margin: 0 !important;\n        box-sizing: border-box !important;\n"""
replacement = """      html.ady-redesign #rl-sub-left .messageListItem {\n        width: 100% !important;\n        height: 76px !important;\n        margin: 0 !important;\n        box-sizing: border-box !important;\n"""
if needle not in s:
    raise SystemExit('Message item block not found')

insert_after = """        transition: background 160ms ease, box-shadow 160ms ease, transform 120ms ease !important;\n      }\n"""
addition = """        transition: background 160ms ease, box-shadow 160ms ease, transform 120ms ease !important;\n      }\n      html.ady-redesign #rl-sub-left .messageListItem + .messageListItem {\n        margin-top: 5px !important;\n      }\n"""
if insert_after not in s:
    raise SystemExit('Message item block end not found')
s = s.replace(insert_after, addition, 1)

p.write_text(s, encoding='utf-8')
