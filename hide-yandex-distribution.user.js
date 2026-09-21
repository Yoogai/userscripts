// ==UserScript==
// @name         Hide Yandex Browser distribution window
// @namespace    https://github.com/Yoogai/userscripts
// @version      1.1.0
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
    const DISTRIBUTION_SELECTOR = '.DistributionContent';
    const SPLASH_MODAL_SELECTOR = '.Modal-Content[role="dialog"]';

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

        const observer = new MutationObserver((mutations) => {
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
