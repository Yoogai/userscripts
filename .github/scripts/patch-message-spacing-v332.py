from pathlib import Path

# Triggered after the workflow file is present on main.
path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

text = text.replace('// @version      3.1.31', '// @version      3.1.32', 1)
text = text.replace('[Почта Адыгеи Redesign v3.1.31]', '[Почта Адыгеи Redesign v3.1.32]', 1)

old_scroll = """      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content {\n        top: 54px !important;\n        bottom: 44px !important;\n        background: var(--ady-paper) !important;\n      }"""
new_scroll = """      html.ady-redesign #rl-sub-left .b-message-list-wrapper > .b-content {\n        top: 54px !important;\n        bottom: 44px !important;\n        background: var(--ady-paper) !important;\n        scrollbar-gutter: stable !important;\n      }"""
if old_scroll not in text:
    raise SystemExit('scroll container block not found')
text = text.replace(old_scroll, new_scroll, 1)

old_grid = """      html.ady-redesign #rl-sub-left .messageListItem > .wrapper {\n        display: grid !important;\n        grid-template-columns: 30px minmax(0, 1fr) auto auto 31px !important;\n        grid-template-rows: 21px 21px !important;\n        align-content: center !important;\n        align-items: center !important;\n        padding: 5px 0 !important;\n        box-sizing: border-box !important;\n        transform: translateY(-4px) !important;\n      }"""
new_grid = """      html.ady-redesign #rl-sub-left .messageListItem > .wrapper {\n        display: grid !important;\n        grid-template-columns: 30px minmax(0, 1fr) auto auto 31px !important;\n        grid-template-rows: 21px 21px !important;\n        align-content: start !important;\n        align-items: center !important;\n        padding: 8px 0 0 !important;\n        box-sizing: border-box !important;\n        transform: none !important;\n      }"""
if old_grid not in text:
    raise SystemExit('message grid block not found')
text = text.replace(old_grid, new_grid, 1)

path.write_text(text, encoding='utf-8')
