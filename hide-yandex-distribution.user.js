// ==UserScript==
// @name         Hide Yandex Browser distribution window
// @namespace    https://github.com/Yoogai/userscripts
// @version      1.0.0
// @description  Убирает окно «Некоторые сайты недоступны»
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/Yoogai/userscripts/main/hide-yandex-distribution.user.js
// @downloadURL  https://raw.githubusercontent.com/Yoogai/userscripts/main/hide-yandex-distribution.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TITLE = 'Некоторые сайты недоступны';
    const SELECTOR = '.DistributionContent';

    function removeDistributionWindows(root = document) {
        const elements = root.querySelectorAll
            ? root.querySelectorAll(SELECTOR)
            : [];

        for (const element of elements) {
            const title = element.querySelector('.DistributionTitle');

            if (title && title.textContent.includes(TITLE)) {
                element.remove();
            }
        }
    }

    function startObserver() {
        removeDistributionWindows();

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        continue;
                    }

                    if (node.matches?.(SELECTOR)) {
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
