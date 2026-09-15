from pathlib import Path

p = Path('mail-adygheya-redesign.user.js')
s = p.read_text(encoding='utf-8')

s = s.replace('// @version      3.1.29', '// @version      3.1.30', 1)
s = s.replace('[Почта Адыгеи Redesign v3.1.29]', '[Почта Адыгеи Redesign v3.1.30]', 1)

# Remove the previous settings-specific styling workaround entirely.
old_css = '''      /* Mail-layout controls are not useful inside RainLoop settings. */
      html.ady-redesign.ady-settings-open #ady-folder-resizer,
      html.ady-redesign.ady-settings-open #ady-list-resizer,
      html.ady-redesign.ady-settings-open #rl-left .b-footer .buttonResize,
      html.ady-redesign.ady-settings-open .b-settings.b-settins-right > .b-toolbar {
        display: none !important;
        pointer-events: none !important;
      }
      html.ady-redesign.ady-settings-open .b-settings.b-settins-right > .b-content {
        top: 0 !important;
      }

'''
if old_css not in s:
    raise SystemExit('old settings CSS block not found')
s = s.replace(old_css, '', 1)

old_sync = '''  function syncSettingsChrome() {
    const settingsOpen = [...document.querySelectorAll('.b-settings.b-settins-right')].some((pane) => {
      if (!pane.getClientRects().length) return false;
      const style = getComputedStyle(pane);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    document.documentElement.classList.toggle('ady-settings-open', state.enabled && settingsOpen);
  }
'''
new_sync = '''  function isSettingsOpen() {
    const routeMatch = /(?:^|#\\/)settings(?:\\/|$)/i.test(location.hash);
    if (routeMatch) return true;
    return [...document.querySelectorAll('.b-settings.b-settins-right, .b-settins-right')].some((pane) => {
      if (!pane.getClientRects().length) return false;
      const style = getComputedStyle(pane);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
  }

  function suspendRedesignForSettings() {
    if (!isSettingsOpen()) return false;

    // Settings must remain completely native RainLoop UI.
    document.documentElement.classList.remove('ady-redesign', 'ady-focus', 'ady-collapsed', 'ady-settings-open');
    document.documentElement.removeAttribute('data-ady-theme');
    document.documentElement.removeAttribute('data-ady-density');

    folderHandle?.remove();
    listHandle?.remove();
    folderHandle = null;
    listHandle = null;

    restoreOriginals();
    return true;
  }
'''
if old_sync not in s:
    raise SystemExit('old syncSettingsChrome block not found')
s = s.replace(old_sync, new_sync, 1)

# Never apply mailbox geometry while settings are open.
old_apply = '''  function applyLayout(persist = false) {
    if (!state.enabled || window.innerWidth < 800 || !center || !left || !right || !subLeft || !subRight) return;
'''
new_apply = '''  function applyLayout(persist = false) {
    if (isSettingsOpen()) return;
    if (!state.enabled || window.innerWidth < 800 || !center || !left || !right || !subLeft || !subRight) return;
'''
if old_apply not in s:
    raise SystemExit('applyLayout start not found')
s = s.replace(old_apply, new_apply, 1)

# Settings detection must happen before mailbox-only element guards.
old_connect = '''  function connect() {
    document.getElementById('ady-redesign-dock')?.remove();
    const nextCenter = document.querySelector('#rl-center');
    const nextLeft = document.querySelector('#rl-left');
    const nextRight = document.querySelector('#rl-right');
    const nextSubLeft = document.querySelector('#rl-sub-left');
    const nextSubRight = document.querySelector('#rl-sub-right');
    if (!nextCenter || !nextLeft || !nextRight || !nextSubLeft || !nextSubRight) return;
'''
new_connect = '''  function connect() {
    document.getElementById('ady-redesign-dock')?.remove();

    // Do not modify RainLoop settings at all. This check intentionally runs
    // before mailbox-only DOM guards because settings may not contain subpanes.
    if (suspendRedesignForSettings()) return;

    const nextCenter = document.querySelector('#rl-center');
    const nextLeft = document.querySelector('#rl-left');
    const nextRight = document.querySelector('#rl-right');
    const nextSubLeft = document.querySelector('#rl-sub-left');
    const nextSubRight = document.querySelector('#rl-sub-right');
    if (!nextCenter || !nextLeft || !nextRight || !nextSubLeft || !nextSubRight) return;
'''
if old_connect not in s:
    raise SystemExit('connect start not found')
s = s.replace(old_connect, new_connect, 1)

s = s.replace('''    applyState();
    syncSettingsChrome();
    normalizeSystemToolbar();
''', '''    applyState();
    normalizeSystemToolbar();
''', 1)

s = s.replace("window.addEventListener('resize', () => { applyLayout(); positionMessageButtons(); syncSettingsChrome(); });",
              "window.addEventListener('resize', () => { if (!isSettingsOpen()) { applyLayout(); positionMessageButtons(); } });", 1)

p.write_text(s, encoding='utf-8')
