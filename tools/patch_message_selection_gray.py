from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

replacements = [
    ('// @version      3.1.17', '// @version      3.1.18'),
    ("console.log('[Почта Адыгеи Redesign v3.1.17] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.18] Скрипт инициализирован');"),
    ('inset 3px 0 0 var(--ady-navy),\n          0 0 0 1px color-mix(in srgb, var(--ady-navy) 16%, transparent) !important;', 'inset 4px 0 0 var(--ady-navy),\n          0 0 0 1px color-mix(in srgb, var(--ady-navy) 16%, transparent) !important;'),
    ('background: color-mix(in srgb, var(--ady-accent) 10%, var(--ady-paper-strong)) !important;\n        box-shadow:\n          inset 3px 0 0 var(--ady-accent),\n          0 0 0 1px color-mix(in srgb, var(--ady-accent) 20%, transparent) !important;', 'background: color-mix(in srgb, var(--ady-ink) 7%, var(--ady-paper-strong)) !important;\n        box-shadow:\n          inset 4px 0 0 color-mix(in srgb, var(--ady-ink) 55%, var(--ady-muted)),\n          0 0 0 1px color-mix(in srgb, var(--ady-ink) 12%, transparent) !important;'),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Expected text not found: {old[:120]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
