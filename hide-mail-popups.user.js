// ==UserScript==
// @name         Hide Mail.ru Popups
// @namespace    https://github.com/Yoogai/userscripts
// @version      1.0.0
// @description  Скрывает рекламные и подписочные окна во входящих Mail.ru
// @match        https://e.mail.ru/inbox/*
// @match        https://e.mail.ru/inbox
// @updateURL    https://raw.githubusercontent.com/Yoogai/userscripts/main/hide-mail-popups.user.js
// @downloadURL  https://raw.githubusercontent.com/Yoogai/userscripts/main/hide-mail-popups.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const KNOWN_PROMO_TITLE = 'Заканчивается место в едином пространстве Почты и Облака';
    const PROMO_WORDS = /скидк|подписк|выбрать тариф|увеличьте место|почта и облак/i;
    const HIDDEN = new WeakSet();

    function hideMailPromos(root = document) {
        if (!root.querySelectorAll) return;

        const headings = [];
        if (root.nodeType === Node.ELEMENT_NODE && root.matches('h1, h2, h3, [role="heading"]')) {
            headings.push(root);
        }
        headings.push(...root.querySelectorAll('h1, h2, h3, [role="heading"]'));

        for (const heading of headings) {
            const title = heading.textContent.replace(/\s+/g, ' ').trim();
            const card = heading.closest('.vkuiCard, [role="dialog"], [aria-modal="true"]');
            if (!card || HIDDEN.has(card)) continue;

            const text = card.textContent.replace(/\s+/g, ' ').trim();
            const isKnownStorageWarning = title.includes(KNOWN_PROMO_TITLE);
            const isOtherPromo = PROMO_WORDS.test(text)
                && card.querySelector('button, a[role="button"]')
                && !/написать письмо|ответить|переслать/i.test(text);

            if (!isKnownStorageWarning && !isOtherPromo) continue;

            HIDDEN.add(card);
            // Leave framework-owned nodes in place so the mail app can keep rendering.
            card.style.setProperty('display', 'none', 'important');
        }
    }

    function start() {
        hideMailPromos();
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) hideMailPromos(node);
                }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
})();

