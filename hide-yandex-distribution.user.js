// ==UserScript==
// @name         Hide Annoying Popups
// @namespace    https://github.com/Yoogai/userscripts
// @version      1.2.0
// @description  Скрывает назойливые окна Яндекса и Mail о пуш-уведомлениях
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/Yoogai/userscripts/main/hide-yandex-distribution.user.js
// @downloadURL  https://raw.githubusercontent.com/Yoogai/userscripts/main/hide-yandex-distribution.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TITLE = 'Некоторые сайты недоступны';
    const DISTRIBUTION_SELECTOR = '.DistributionContent';
    const SPLASH_MODAL_SELECTOR = '.Modal-Content[role="dialog"]';
    const dismissedMailWindows = new WeakSet();

    function dismissMailWindows() {
        for (const image of document.querySelectorAll('img[src*="/static/nocode/wsconf-5230/"]')) {
            const popup = image.closest('div[dir="ltr"]');
            if (!popup || dismissedMailWindows.has(popup) || !popup.textContent.replace(/\s+/g, ' ').includes('Компания Apple отключила пуши от Почты Mail')) {
                continue;
            }

            const close = popup.querySelector('button img[src$="/cancel-light.svg"]')?.closest('button');
            dismissedMailWindows.add(popup);
            close?.click();
            // Keep framework-owned nodes intact if the close handler is not ready yet.
            popup.style.setProperty('display', 'none', 'important');
        }
    }

    function isDistributionSplashModal(element) {
        return element.matches(SPLASH_MODAL_SELECTOR)
            && (
                element.matches('[aria-labelledby^="distribution-title-"]')
                || element.querySelector('.DistributionSplashScreenModalScene')
                || element.querySelector('.DistributionSplashScreenModalCloseButtonOuter')
            );
    }

    function removeModal(element) {
        const modal = element.closest('.Modal');
        (modal || element).remove();
    }

    function removeDistributionWindows(root = document) {
        if (!root.querySelectorAll) {
            return;
        }

        const elements = root.querySelectorAll(DISTRIBUTION_SELECTOR);

        for (const element of elements) {
            const title = element.querySelector('.DistributionTitle');

            if (title && title.textContent.includes(TITLE)) {
                element.remove();
            }
        }

        const modalElements = [];

        if (root.matches?.(SPLASH_MODAL_SELECTOR)) {
            modalElements.push(root);
        }

        modalElements.push(...root.querySelectorAll(SPLASH_MODAL_SELECTOR));

        for (const element of modalElements) {
            if (isDistributionSplashModal(element)) {
                removeModal(element);
            }
        }
    }

    function startObserver() {
        removeDistributionWindows();
        dismissMailWindows();

        const observer = new MutationObserver((mutations) => {
            dismissMailWindows();
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        continue;
                    }

                    if (node.matches?.(DISTRIBUTION_SELECTOR)) {
                        removeDistributionWindows(node.parentElement || document);
                    } else {
                        removeDistributionWindows(node);
                    }
                }
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    if (document.documentElement) {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    }
})();
