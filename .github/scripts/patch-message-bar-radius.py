from pathlib import Path

p = Path('mail-adygheya-redesign.user.js')
s = p.read_text(encoding='utf-8')

s = s.replace('// @version      3.1.19', '// @version      3.1.20', 1)
s = s.replace("console.log('[Почта Адыгеи Redesign v3.1.19] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.20] Скрипт инициализирован');", 1)

old = """      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent {\n        position: relative !important;\n        float: left !important;\n        width: 4px !important;\n        height: 100% !important;\n        min-width: 4px !important;\n        margin: 0 !important;\n        border-radius: 8px 0 0 8px !important;\n        background: transparent !important;\n        box-shadow: none !important;\n        overflow: hidden !important;\n      }\n"""
new = """      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent {\n        position: relative !important;\n        float: left !important;\n        width: 4px !important;\n        height: calc(100% - 8px) !important;\n        min-width: 4px !important;\n        margin: 4px 0 !important;\n        border-radius: 3px !important;\n        background: transparent !important;\n        box-shadow: none !important;\n        overflow: hidden !important;\n      }\n"""
if old not in s:
    raise SystemExit('sidebarParent block not found')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
