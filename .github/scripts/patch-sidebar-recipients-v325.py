from pathlib import Path

p = Path('mail-adygheya-redesign.user.js')
s = p.read_text(encoding='utf-8')

if '// @version      3.1.24' not in s:
    raise SystemExit('Expected userscript version 3.1.24')

s = s.replace('// @version      3.1.24', '// @version      3.1.25', 1)
s = s.replace("console.log('[Почта Адыгеи Redesign v3.1.24] Скрипт инициализирован');", "console.log('[Почта Адыгеи Redesign v3.1.25] Скрипт инициализирован');", 1)

old_sidebar = '''      /* A 56px rail cannot represent nested folder hierarchy clearly. */
      html.ady-redesign.ady-collapsed #rl-left .b-sub-folders {
        display: none !important;
      }
      html.ady-redesign.ady-collapsed #rl-left .ady-folder-icon { margin: 0 !important; }
'''
new_sidebar = '''      /* Keep real nested folders available; only RainLoop-hidden folders are removed above. */
      html.ady-redesign.ady-collapsed #rl-left .ady-folder-icon {
        margin: 0 !important;
        pointer-events: none !important;
      }
'''
if old_sidebar not in s:
    raise SystemExit('Collapsed sidebar block not found')
s = s.replace(old_sidebar, new_sidebar, 1)

start = s.index('  function installRecipientMenu() {')
end = s.index('\n  let copyToastTimer = 0;', start)

replacement = r'''  function installRecipientMenu() {
    if (document.querySelector('.ady-recipient-menu')) return;
    const menu = document.createElement('div');
    menu.className = 'ady-recipient-menu';
    menu.setAttribute('role', 'listbox');
    document.body.appendChild(menu);

    const pinnedAddresses = new Set(FREQUENT_RECIPIENTS.map(([, address]) => address.toLowerCase()));
    const emailPattern = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
    const cleanName = (value) => (value || '').replace(/[<>\"]/g, '').trim();
    const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);

    const normalizeStoredRecipients = () => {
      const now = Date.now();
      const seen = new Set();
      recentRecipients = recentRecipients
        .filter((entry) => entry && typeof entry.address === 'string' && emailPattern.test(entry.address))
        .map((entry, index) => ({
          name: cleanName(entry.name),
          address: entry.address.trim(),
          uses: Math.max(1, Number(entry.uses) || 1),
          lastUsed: Number(entry.lastUsed) || (now - index)
        }))
        .filter((entry) => {
          const key = entry.address.toLowerCase();
          if (seen.has(key) || pinnedAddresses.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 40);
      GM_setValue(KEYS.recentRecipients, recentRecipients);
    };

    const saveRecentRecipients = () => {
      recentRecipients.sort((a, b) => (Number(b.uses) || 0) - (Number(a.uses) || 0) || (Number(b.lastUsed) || 0) - (Number(a.lastUsed) || 0));
      recentRecipients = recentRecipients.slice(0, 40);
      GM_setValue(KEYS.recentRecipients, recentRecipients);
    };

    const rememberRecipient = (name, address, bumpUsage = false) => {
      const normalizedAddress = (address || '').trim();
      if (!emailPattern.test(normalizedAddress)) return false;
      const key = normalizedAddress.toLowerCase();
      if (pinnedAddresses.has(key)) return false;

      const normalizedName = cleanName(name);
      const existing = recentRecipients.find((entry) => entry.address.toLowerCase() === key);
      if (existing) {
        let changed = false;
        if (normalizedName && normalizedName !== existing.name) {
          existing.name = normalizedName;
          changed = true;
        }
        if (bumpUsage) {
          existing.uses = Math.max(1, Number(existing.uses) || 1) + 1;
          existing.lastUsed = Date.now();
          changed = true;
        }
        return changed;
      }

      recentRecipients.push({
        name: normalizedName,
        address: normalizedAddress,
        uses: bumpUsage ? 1 : 0,
        lastUsed: bumpUsage ? Date.now() : 0
      });
      return true;
    };

    const recipientFromNode = (node) => {
      if (!node) return null;
      const sources = [
        node.getAttribute?.('data-value'),
        node.getAttribute?.('data-email'),
        node.getAttribute?.('title'),
        node.textContent
      ].filter(Boolean);
      for (const source of sources) {
        const address = String(source).match(emailPattern)?.[0];
        if (!address) continue;
        return {
          address,
          name: cleanName(node.textContent.replace(address, ''))
        };
      }
      return null;
    };

    const rememberStockSuggestions = () => {
      let changed = false;
      const nodes = new Set(document.querySelectorAll([
        '.ui-autocomplete li',
        '.ui-autocomplete .ui-menu-item',
        '.ui-autocomplete [data-value]',
        '.ui-autocomplete [data-email]'
      ].join(',')));
      for (const node of nodes) {
        const recipient = recipientFromNode(node);
        if (recipient && rememberRecipient(recipient.name, recipient.address, false)) changed = true;
      }
      if (changed) saveRecentRecipients();
      return changed;
    };

    const rememberChosenRecipients = () => {
      let changed = false;
      document.querySelectorAll('.inputosaurus-container li:not(.inputosaurus-input)').forEach((item) => {
        if (item.dataset.adyRecipientRemembered === 'true') return;
        const recipient = recipientFromNode(item);
        if (!recipient) return;
        item.dataset.adyRecipientRemembered = 'true';
        if (rememberRecipient(recipient.name, recipient.address, true)) changed = true;
      });
      if (changed) saveRecentRecipients();
      return changed;
    };

    normalizeStoredRecipients();

    let activeInput = null;
    const getInput = () => {
      if (activeInput?.isConnected && activeInput.getClientRects().length) return activeInput;
      return [...document.querySelectorAll('input.ui-autocomplete-input')].find((item) => item.getClientRects().length) || null;
    };

    const render = () => {
      const input = getInput();
      if (!input) return false;
      rememberStockSuggestions();
      rememberChosenRecipients();

      const query = input.value.trim().toLocaleLowerCase('ru');
      const added = new Set([...input.closest('.inputosaurus-container')?.querySelectorAll('li:not(.inputosaurus-input)') || []]
        .flatMap((item) => (item.textContent.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || []).map((address) => address.toLowerCase())));
      const matches = ([name, address]) => !added.has(address.toLowerCase()) && (!query || `${name} ${address}`.toLocaleLowerCase('ru').includes(query));
      const primary = FREQUENT_RECIPIENTS.filter(matches);
      const recent = recentRecipients
        .filter((entry) => entry?.address && !added.has(entry.address.toLowerCase()) && !pinnedAddresses.has(entry.address.toLowerCase()))
        .filter((entry) => !query || `${entry.name || ''} ${entry.address}`.toLocaleLowerCase('ru').includes(query))
        .sort((a, b) => (Number(b.uses) || 0) - (Number(a.uses) || 0) || (Number(b.lastUsed) || 0) - (Number(a.lastUsed) || 0))
        .slice(0, 20);
      const button = ([name, address]) => `<button type="button" class="ady-recipient-item" role="option" data-address="${escapeHtml(address)}"><span class="ady-recipient-name">${escapeHtml(name || address)}</span><span class="ady-recipient-address">${escapeHtml(address)}</span></button>`;
      menu.innerHTML = `${primary.length ? '<div class="ady-recipient-section">Закреплённые</div>' : ''}${primary.map(button).join('')}${recent.length ? '<div class="ady-recipient-section">Часто используемые</div>' : ''}${recent.map(({name, address}) => button([name, address])).join('')}`;
      return primary.length + recent.length > 0;
    };

    const place = () => {
      const input = getInput();
      if (!input) return;
      const rect = input.getBoundingClientRect();
      menu.style.left = `${Math.round(rect.left)}px`;
      menu.style.top = `${Math.round(rect.bottom + 6)}px`;
      menu.style.width = `${Math.max(260, Math.round(rect.width + 150))}px`;
    };

    const open = (input) => {
      activeInput = input;
      rememberStockSuggestions();
      rememberChosenRecipients();
      place();
      if (render()) menu.classList.add('is-open');
    };

    const stockObserver = new MutationObserver(() => {
      const changed = rememberStockSuggestions() || rememberChosenRecipients();
      if (changed && menu.classList.contains('is-open')) render();
    });
    stockObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener('focusin', (event) => {
      const input = event.target.closest?.('input.ui-autocomplete-input');
      if (input && input.getClientRects().length) open(input);
    });
    document.addEventListener('input', (event) => {
      const input = event.target.closest?.('input.ui-autocomplete-input');
      if (input && input.getClientRects().length) open(input);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        menu.classList.remove('is-open');
        return;
      }
      const input = event.target.closest?.('input.ui-autocomplete-input');
      if (!input || event.key !== 'Enter') return;
      const address = input.value.match(emailPattern)?.[0];
      if (address && rememberRecipient('', address, true)) saveRecentRecipients();
    });

    menu.addEventListener('mousedown', (event) => {
      const item = event.target.closest('.ady-recipient-item');
      if (!item) return;
      event.preventDefault();
      const input = getInput();
      if (!input) return;
      const name = item.querySelector('.ady-recipient-name')?.textContent || '';
      if (rememberRecipient(name, item.dataset.address, true)) saveRecentRecipients();
      activeInput = input;
      input.focus();
      input.value = item.dataset.address;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      for (const type of ['keydown', 'keypress', 'keyup']) {
        input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      }
      window.setTimeout(() => {
        rememberChosenRecipients();
        input.focus();
        place();
        render();
        menu.classList.add('is-open');
      }, 80);
    });

    document.addEventListener('click', (event) => {
      const input = getInput();
      const region = input?.closest('.inputosaurus-container');
      if (event.target !== input && !menu.contains(event.target) && !region?.contains(event.target)) menu.classList.remove('is-open');
    });
    window.addEventListener('resize', () => { if (menu.classList.contains('is-open')) place(); });
  }
'''

s = s[:start] + replacement + s[end:]
p.write_text(s, encoding='utf-8')
