from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

text = text.replace('// @version      3.1.15', '// @version      3.1.16', 1)
text = text.replace('[Почта Адыгеи Redesign v3.1.15]', '[Почта Адыгеи Redesign v3.1.16]', 1)

needle = """      html.ady-redesign #rl-sub-left .messageListItem .date { color: var(--ady-muted) !important; }\n      html.ady-redesign #rl-sub-left .b-footer {\n"""
insert = """      html.ady-redesign #rl-sub-left .messageListItem .date { color: var(--ady-muted) !important; }\n\n      /* Apply state backgrounds to the whole row, not RainLoop's narrow sidebarParent. */\n      html.ady-redesign #rl-sub-left .messageListItem {\n        overflow: hidden !important;\n      }\n      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent,\n      html.ady-redesign #rl-sub-left .messageListItem > .wrapper {\n        background: transparent !important;\n      }\n      html.ady-redesign #rl-sub-left .messageListItem:hover {\n        background: color-mix(in srgb, var(--ady-navy) 4%, var(--ady-paper-strong)) !important;\n      }\n      html.ady-redesign #rl-sub-left .messageListItem.unseen {\n        background: color-mix(in srgb, var(--ady-navy) 12%, var(--ady-paper-strong)) !important;\n        box-shadow:\n          inset 3px 0 0 var(--ady-navy),\n          0 0 0 1px color-mix(in srgb, var(--ady-navy) 16%, transparent) !important;\n      }\n      html.ady-redesign #rl-sub-left .messageListItem.unseen > .sidebarParent,\n      html.ady-redesign #rl-sub-left .messageListItem.unseen > .wrapper {\n        background: transparent !important;\n        box-shadow: none !important;\n      }\n      html.ady-redesign #rl-sub-left .messageListItem.selected,\n      html.ady-redesign #rl-sub-left .messageListItem.focused {\n        background: color-mix(in srgb, var(--ady-accent) 10%, var(--ady-paper-strong)) !important;\n        box-shadow:\n          inset 3px 0 0 var(--ady-accent),\n          0 0 0 1px color-mix(in srgb, var(--ady-accent) 20%, transparent) !important;\n      }\n      html.ady-redesign #rl-sub-left .messageListItem.selected > .sidebarParent,\n      html.ady-redesign #rl-sub-left .messageListItem.selected > .wrapper,\n      html.ady-redesign #rl-sub-left .messageListItem.focused > .sidebarParent,\n      html.ady-redesign #rl-sub-left .messageListItem.focused > .wrapper {\n        background: transparent !important;\n        box-shadow: none !important;\n      }\n\n      html.ady-redesign #rl-sub-left .b-footer {\n"""

if needle not in text:
    raise SystemExit('Target CSS insertion point not found')
text = text.replace(needle, insert, 1)

path.write_text(text, encoding='utf-8')
