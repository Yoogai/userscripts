from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

text = text.replace('// @version      3.1.32', '// @version      3.1.33', 1)
text = text.replace('[Почта Адыгеи Redesign v3.1.32]', '[Почта Адыгеи Redesign v3.1.33]', 1)

old_scroll = """      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content {\n        top: 54px !important;\n        bottom: 44px !important;\n        background: var(--ady-paper) !important;\n        scrollbar-gutter: stable !important;\n      }"""
new_scroll = """      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content {\n        top: 54px !important;\n        bottom: 44px !important;\n        background: var(--ady-paper) !important;\n      }"""
if old_scroll not in text:
    raise SystemExit('scrollbar-gutter block not found')
text = text.replace(old_scroll, new_scroll, 1)

old_padding = """      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content > .content {\n        padding: 10px !important;\n        box-sizing: border-box !important;\n      }"""
new_padding = """      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content > .content {\n        padding: 10px 16px 10px 10px !important;\n        box-sizing: border-box !important;\n      }"""
if old_padding not in text:
    raise SystemExit('message list padding block not found')
text = text.replace(old_padding, new_padding, 1)

path.write_text(text, encoding='utf-8')
