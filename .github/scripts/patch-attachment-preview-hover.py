from pathlib import Path

p = Path('mail-adygheya-redesign.user.js')
s = p.read_text(encoding='utf-8')

if '// @version      3.1.22' not in s:
    raise SystemExit('Expected userscript version 3.1.22')

s = s.replace('// @version      3.1.22', '// @version      3.1.23', 1)
s = s.replace("console.log('[Почта Адыгеи Redesign v3.1.22] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.23] Скрипт инициализирован');", 1)

old = '''      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .iconMain,\n      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .iconBG,\n      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .attachmentIcon,\n      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .attachmentIconText {\n        display: none !important;\n      }\n'''
new = '''      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .iconMain,\n      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .iconBG,\n      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .iconPreview,\n      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .attachmentIcon,\n      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent .attachmentIconText {\n        display: none !important;\n      }\n      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent.hasPreview:hover .iconPreview,\n      html.ady-redesign .attachmentItem.ady-decorated .attachmentIconParent.hasPreplay:hover .iconPreview {\n        display: none !important;\n        background: transparent !important;\n      }\n'''
if old not in s:
    raise SystemExit('Attachment icon override block not found')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
