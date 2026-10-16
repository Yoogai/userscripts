// ==UserScript==
// @name         Hide Mail.ru Popups
// @namespace    https://github.com/Yoogai/userscripts
// @version      1.0.1
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
    const HEADING_SELECTOR = 'h1, h2, h3, [role="heading"]';

    function hidePromoForHeading(heading) {
        if (!heading?.matches?.(HEADING_SELECTOR)) return;

        const title = heading.textContent.replace(/\s+/g, ' ').trim();
        const card = heading.closest('.vkuiCard, [role="dialog"], [aria-modal="true"]');
        if (!card || HIDDEN.has(card)) return;

        const text = card.textContent.replace(/\s+/g, ' ').trim();
        const isKnownStorageWarning = title.includes(KNOWN_PROMO_TITLE);
        const isOtherPromo = PROMO_WORDS.test(text)
            && card.querySelector('button, a[role="button"]')
            && !/написать письмо|ответить|переслать/i.test(text);

        if (!isKnownStorageWarning && !isOtherPromo) return;

        HIDDEN.add(card);
        // Leave framework-owned nodes in place so the mail app can keep rendering.
        card.style.setProperty('display', 'none', 'important');
    }

    function hideMailPromos(root = document) {
        if (!root.querySelectorAll) return;

        if (root.nodeType === Node.ELEMENT_NODE && root.matches(HEADING_SELECTOR)) {
            hidePromoForHeading(root);
        }

        for (const heading of root.querySelectorAll(HEADING_SELECTOR)) {
            hidePromoForHeading(heading);
        }
    }

    function hideForTextNode(node) {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        const heading = element?.closest?.(HEADING_SELECTOR);
        if (heading) hidePromoForHeading(heading);
    }

    function start() {
        hideMailPromos();
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) hideMailPromos(node);
                    else if (node.nodeType === Node.TEXT_NODE) hideForTextNode(node);
                }
                if (mutation.type === 'characterData') hideForTextNode(mutation.target);
            }
        });
        observer.observe(document.documentElement, {
            childList: true,
            characterData: true,
            subtree: true,
        });
    }

    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
})();

