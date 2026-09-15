from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    text = text.replace(old, new, 1)


replace_once('// @version      3.1.25', '// @version      3.1.26', 'metadata version')
replace_once("console.log('[Почта Адыгеи Redesign v3.1.25] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.26] Скрипт инициализирован');", 'console version')

marker = '''  function decorateToolbarButtons() {
'''
patch = '''  function putMessageSubjectFirst() {
    if (!state.enabled) return;
    document.querySelectorAll('#rl-sub-left .messageListItem:not(.ady-subject-first)').forEach((item) => {
      const wrapper = item.querySelector(':scope > .wrapper');
      const senderParent = wrapper?.querySelector(':scope > .senderParent');
      const subjectParent = wrapper?.querySelector(':scope > .subjectParent');
      if (!wrapper || !senderParent || !subjectParent) return;

      // Keep RainLoop's original Knockout-bound nodes intact: only change their
      // order so the subject becomes the primary (first) line of the card.
      wrapper.insertBefore(subjectParent, senderParent);
      item.classList.add('ady-subject-first');
    });
  }

'''
replace_once(marker, patch + marker, 'subject-first helper')

replace_once('''    decorateFolders();
    decorateAttachments();
''', '''    decorateFolders();
    putMessageSubjectFirst();
    decorateAttachments();
''', 'connect hook')

path.write_text(text, encoding='utf-8')
