from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')

text = text.replace('// @version      3.1.28', '// @version      3.1.29', 1)
text = text.replace("[Почта Адыгеи Redesign v3.1.28]", "[Почта Адыгеи Redesign v3.1.29]", 1)

css_anchor = '''      html.ady-redesign.ady-focus #rl-left,\n'''
css_block = '''      /* Mail-layout controls are not useful inside RainLoop settings. */\n      html.ady-redesign.ady-settings-open #ady-folder-resizer,\n      html.ady-redesign.ady-settings-open #ady-list-resizer,\n      html.ady-redesign.ady-settings-open #rl-left .b-footer .buttonResize,\n      html.ady-redesign.ady-settings-open .b-settings.b-settins-right > .b-toolbar {\n        display: none !important;\n        pointer-events: none !important;\n      }\n      html.ady-redesign.ady-settings-open .b-settings.b-settins-right > .b-content {\n        top: 0 !important;\n      }\n\n'''
if css_anchor not in text:
    raise SystemExit('CSS anchor not found')
text = text.replace(css_anchor, css_block + css_anchor, 1)

js_anchor = '''  function createHandle(id, kind) {\n'''
js_block = '''  function syncSettingsChrome() {\n    const settingsOpen = [...document.querySelectorAll('.b-settings.b-settins-right')].some((pane) => {\n      if (!pane.getClientRects().length) return false;\n      const style = getComputedStyle(pane);\n      return style.display !== 'none' && style.visibility !== 'hidden';\n    });\n    document.documentElement.classList.toggle('ady-settings-open', state.enabled && settingsOpen);\n  }\n\n'''
if js_anchor not in text:
    raise SystemExit('JS anchor not found')
text = text.replace(js_anchor, js_block + js_anchor, 1)

connect_anchor = '''    applyState();\n    normalizeSystemToolbar();\n'''
connect_replacement = '''    applyState();\n    syncSettingsChrome();\n    normalizeSystemToolbar();\n'''
if connect_anchor not in text:
    raise SystemExit('connect anchor not found')
text = text.replace(connect_anchor, connect_replacement, 1)

end_anchor = '''  window.addEventListener('resize', () => { applyLayout(); positionMessageButtons(); });\n  connect();\n'''
end_replacement = '''  window.addEventListener('resize', () => { applyLayout(); positionMessageButtons(); syncSettingsChrome(); });\n  window.addEventListener('hashchange', scheduleConnect);\n  connect();\n'''
if end_anchor not in text:
    raise SystemExit('end anchor not found')
text = text.replace(end_anchor, end_replacement, 1)

path.write_text(text, encoding='utf-8')
