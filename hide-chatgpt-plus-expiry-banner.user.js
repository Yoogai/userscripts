// ==UserScript==
// @name         Hide ChatGPT Plus expiry banner
// @namespace    https://github.com/Yoogai/userscripts
// @version      1.0.0
// @description  Убирает баннер о скором окончании подписки ChatGPT Plus
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/Yoogai/userscripts/main/hide-chatgpt-plus-expiry-banner.user.js
// @downloadURL  https://raw.githubusercontent.com/Yoogai/userscripts/main/hide-chatgpt-plus-expiry-banner.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const HEADER_SELECTOR = '[data-prompt-textarea-header]';
    const TITLE = 'Срок действия вашей подписки Plus скоро истечет';

    function removeEmptyAncestors(element) {
        let parent = element;

        while (parent && !parent.matches(HEADER_SELECTOR)) {
            if (parent.children.length > 0 || parent.textContent.trim() !== '') {
                break;
            }

            const nextParent = parent.parentElement;
            parent.remove();
            parent = nextParent;
        }
    }

    function removeExpiryBanners(root = document) {
        if (!root.querySelectorAll) {
            return;
        }

        const headings = [];

        if (root.nodeType === Node.ELEMENT_NODE && root.matches('h3')) {
            headings.push(root);
        }

        headings.push(...root.querySelectorAll(`${HEADER_SELECTOR} h3`));

        for (const heading of headings) {
            if (!heading.textContent.includes(TITLE)) {
                continue;
            }

            const banner = heading.closest(`${HEADER_SELECTOR} aside`);

            if (!banner) {
                continue;
            }

            const bannerParent = banner.parentElement;
            banner.remove();

            if (bannerParent) {
                removeEmptyAncestors(bannerParent);
            }
        }
    }

    function startObserver() {
        removeExpiryBanners();

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        removeExpiryBanners(node);
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
