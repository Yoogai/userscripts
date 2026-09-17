from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

text = text.replace('// @version      3.1.33', '// @version      3.1.34', 1)
text = text.replace('[Почта Адыгеи Redesign v3.1.33]', '[Почта Адыгеи Redesign v3.1.34]', 1)

old_default = """      html.ady-redesign #rl-sub-left .messageListItem .subject,\n      html.ady-redesign #rl-sub-left .messageListItem .subject-prefix,\n      html.ady-redesign #rl-sub-left .messageListItem .subject-suffix {\n        color: var(--ady-ink) !important;\n        font-weight: 600 !important;\n      }"""
new_default = """      html.ady-redesign #rl-sub-left .messageListItem .subject,\n      html.ady-redesign #rl-sub-left .messageListItem .subject-prefix,\n      html.ady-redesign #rl-sub-left .messageListItem .subject-suffix {\n        color: var(--ady-ink) !important;\n        font-weight: 400 !important;\n      }"""
count = text.count(old_default)
if count < 1:
    raise SystemExit('default subject block not found')
text = text.replace(old_default, new_default)

old_selected = """      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-prefix,\n      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-suffix,\n      html.ady-redesign #rl-sub-left .messageListItem.focused .subject,\n      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-prefix,\n      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-suffix {\n        font-weight: 600 !important;\n      }"""
new_selected = """      html.ady-redesign #rl-sub-left .messageListItem.selected:not(.unseen) .subject-prefix,\n      html.ady-redesign #rl-sub-left .messageListItem.selected:not(.unseen) .subject-suffix,\n      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .subject,\n      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .subject-prefix,\n      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .subject-suffix {\n        font-weight: 400 !important;\n      }"""
if old_selected in text:
    text = text.replace(old_selected, new_selected)

old_selected_color = """      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-suffix,\n      html.ady-redesign #rl-sub-left .messageListItem.focused .subject,\n      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-prefix,\n      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-suffix {\n        color: var(--ady-ink) !important;\n        font-weight: 600 !important;\n      }"""
new_selected_color = """      html.ady-redesign #rl-sub-left .messageListItem.selected:not(.unseen) .subject-suffix,\n      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .subject,\n      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .subject-prefix,\n      html.ady-redesign #rl-sub-left .messageListItem.focused:not(.unseen) .subject-suffix {\n        color: var(--ady-ink) !important;\n        font-weight: 400 !important;\n      }"""
if old_selected_color in text:
    text = text.replace(old_selected_color, new_selected_color)

# Ensure unread subjects remain bold after the generic read-message rules above.
needle = """      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject,\n      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-prefix,\n      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-suffix {\n        font-weight: 700 !important;\n      }"""
if needle not in text:
    raise SystemExit('unread subject block not found')

path.write_text(text, encoding='utf-8')
