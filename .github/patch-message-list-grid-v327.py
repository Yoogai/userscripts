from pathlib import Path

path = Path('mail-adygheya-redesign.user.js')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    text = text.replace(old, new, 1)


replace_once('// @version      3.1.26', '// @version      3.1.27', 'metadata version')
replace_once("console.log('[Почта Адыгеи Redesign v3.1.26] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.27] Скрипт инициализирован');", 'console version')

old_function = '''  function putMessageSubjectFirst() {
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
new_function = '''  function normalizeMessageListLayout() {
    if (!state.enabled) return;
    document.querySelectorAll('#rl-sub-left .messageListItem').forEach((item) => {
      const wrapper = item.querySelector(':scope > .wrapper');
      const senderParent = wrapper?.querySelector(':scope > .senderParent');
      const attachmentParent = wrapper?.querySelector(':scope > .attachmentParent');
      const subjectParent = wrapper?.querySelector(':scope > .subjectParent');
      if (!wrapper || !senderParent || !attachmentParent || !subjectParent) return;

      // v3.1.26 physically moved subjectParent before senderParent. Restore the
      // native RainLoop order (sender -> attachment -> subject) and let CSS Grid
      // control only the visual placement. This keeps Knockout and float-dependent
      // controls such as attachment/reply icons intact.
      if (senderParent.nextElementSibling !== attachmentParent || attachmentParent.nextElementSibling !== subjectParent) {
        wrapper.insertBefore(senderParent, subjectParent);
        wrapper.insertBefore(attachmentParent, subjectParent);
      }
      item.classList.remove('ady-subject-first');
      item.classList.add('ady-subject-grid');
    });
  }
'''
replace_once(old_function, new_function, 'subject-first function')
replace_once('    putMessageSubjectFirst();', '    normalizeMessageListLayout();', 'connect subject hook')

css_marker = '''      html.ady-redesign #rl-sub-left .messageListItem > .sidebarParent::before {
        display: none !important;
        content: none !important;
      }
'''
css_patch = '''      /* Subject-first message list without changing RainLoop DOM order. */
      html.ady-redesign #rl-sub-left .messageListItem > .wrapper {
        display: grid !important;
        grid-template-columns: 30px minmax(0, 1fr) auto auto 31px !important;
        grid-template-rows: 21px 21px !important;
        align-content: center !important;
        align-items: center !important;
        padding: 5px 0 !important;
        box-sizing: border-box !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .checkedParent {
        grid-column: 1 !important;
        grid-row: 1 / 3 !important;
        position: static !important;
        float: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 30px !important;
        height: 42px !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .subjectParent {
        grid-column: 2 !important;
        grid-row: 1 !important;
        position: static !important;
        float: none !important;
        min-width: 0 !important;
        width: auto !important;
        height: 21px !important;
        margin: 0 !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .senderParent {
        grid-column: 2 / 5 !important;
        grid-row: 2 !important;
        position: static !important;
        float: none !important;
        min-width: 0 !important;
        width: auto !important;
        height: 21px !important;
        margin: 0 !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .dateParent {
        grid-column: 3 !important;
        grid-row: 1 !important;
        position: static !important;
        float: none !important;
        width: auto !important;
        height: 21px !important;
        margin: 0 5px !important;
        white-space: nowrap !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .threadsParent {
        grid-column: 4 !important;
        grid-row: 1 !important;
        position: static !important;
        float: none !important;
        height: 21px !important;
        margin: 0 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .flagParent {
        grid-column: 5 !important;
        grid-row: 1 !important;
        position: static !important;
        float: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 31px !important;
        height: 21px !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .attachmentParent {
        grid-column: 5 !important;
        grid-row: 2 !important;
        position: static !important;
        float: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 31px !important;
        height: 21px !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        box-sizing: border-box !important;
      }
      /* The subject is now the heading; sender/address is supporting text. */
      html.ady-redesign #rl-sub-left .messageListItem .subject,
      html.ady-redesign #rl-sub-left .messageListItem .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem .subject-suffix {
        color: var(--ady-ink) !important;
        font-weight: 600 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem .sender {
        color: var(--ady-muted) !important;
        font-weight: 400 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.unseen .subject-suffix {
        font-weight: 700 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.unseen .sender {
        color: var(--ady-ink-soft) !important;
        font-weight: 500 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject,
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.selected .subject-suffix,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-prefix,
      html.ady-redesign #rl-sub-left .messageListItem.focused .subject-suffix {
        font-weight: 600 !important;
      }
      html.ady-redesign #rl-sub-left .messageListItem.selected .sender,
      html.ady-redesign #rl-sub-left .messageListItem.focused .sender {
        color: var(--ady-muted) !important;
        font-weight: 400 !important;
      }
'''
replace_once(css_marker, css_patch + css_marker, 'message grid CSS marker')

path.write_text(text, encoding='utf-8')
