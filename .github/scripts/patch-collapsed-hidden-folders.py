from pathlib import Path

p = Path('mail-adygheya-redesign.user.js')
s = p.read_text(encoding='utf-8')

if '// @version      3.1.23' not in s:
    raise SystemExit('Expected userscript version 3.1.23')

s = s.replace('// @version      3.1.23', '// @version      3.1.24', 1)
s = s.replace("console.log('[Почта Адыгеи Redesign v3.1.23] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.24] Скрипт инициализирован');", 1)

needle = '''      html.ady-redesign.ady-collapsed #rl-left .e-link > :not(.ady-folder-icon) { display: none !important; }\n      html.ady-redesign.ady-collapsed #rl-left .ady-folder-icon { margin: 0 !important; }\n'''
replacement = '''      html.ady-redesign.ady-collapsed #rl-left .e-link > :not(.ady-folder-icon) { display: none !important; }\n      /* Keep RainLoop-hidden/service folders hidden when collapsed.\n         The generic display:flex above would otherwise resurrect .e-link.hidden. */\n      html.ady-redesign.ady-collapsed #rl-left .e-link.hidden {\n        display: none !important;\n      }\n      html.ady-redesign.ady-collapsed #rl-left .e-item:has(> .e-link.hidden) {\n        display: none !important;\n        margin: 0 !important;\n      }\n      /* A 56px rail cannot represent nested folder hierarchy clearly. */\n      html.ady-redesign.ady-collapsed #rl-left .b-sub-folders {\n        display: none !important;\n      }\n      html.ady-redesign.ady-collapsed #rl-left .ady-folder-icon { margin: 0 !important; }\n'''

if needle not in s:
    raise SystemExit('Collapsed folder CSS insertion point not found')
s = s.replace(needle, replacement, 1)

p.write_text(s, encoding='utf-8')
