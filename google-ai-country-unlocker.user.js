// ==UserScript==
// @name         Google AI Country Unlocker (Flow + Gemini)
// @namespace    https://github.com/Yoogai/userscripts
// @version      1.2.0
// @description  Restores client-side availability flags for Google Flow, Labs and Gemini
// @author       Yoogai
// @license      MIT
// @match        https://flow.google.com/*
// @match        https://labs.google/*
// @match        https://gemini.google.com/*
// @run-at       document-start
// @grant        none
// @all-frames   true
// @updateURL    https://raw.githubusercontent.com/Yoogai/userscripts/main/google-ai-country-unlocker.user.js
// @downloadURL  https://raw.githubusercontent.com/Yoogai/userscripts/main/google-ai-country-unlocker.user.js
// ==/UserScript==

(function () {
    'use strict';

    const win = window;
    const FLOW_RPCS = new Set(['cPZSdc', 'KV2T2d', 'rThb8d', 'cO7JOb', 'md9xJf']);
    const GEMINI_RPC = 'otAQ7b';
    const GEMINI_CAPABILITY_IDS = [142, 187, 200];
    const GEMINI_STATUS_AVAILABLE = 1000;
    const LOG_PREFIX = '[Google AI Unlocker]';
    let patchCount = 0;
    let targetResponseCount = 0;

    function hasTargetRpc(value) {
        return value.includes(GEMINI_RPC) || [...FLOW_RPCS].some((rpcId) => value.includes(rpcId));
    }

    // Flow's Angular bootstrap uses this flag before its normal data has loaded.
    // Keep the hook at document-start so a later page assignment cannot undo it.
    try {
        let wizData = win.WIZ_global_data || {};
        const forceSignedInFlag = (value) => {
            if (!value || typeof value !== 'object') return value;
            value.awbSEf = true;
            return new Proxy(value, {
                set(target, property, nextValue) {
                    target[property] = nextValue;
                    target.awbSEf = true;
                    return true;
                },
            });
        };

        wizData = forceSignedInFlag(wizData);
        Object.defineProperty(win, 'WIZ_global_data', {
            configurable: true,
            enumerable: true,
            get: () => wizData,
            set: (value) => {
                wizData = forceSignedInFlag(value || {});
            },
        });
    } catch (error) {
        console.warn(LOG_PREFIX, 'WIZ_global_data hook failed', error);
    }

    function patchFlowPayload(value, rpcId) {
        try {
            const data = JSON.parse(value);
            if (!Array.isArray(data)) return value;

            if (rpcId === 'cPZSdc') {
                while (data.length < 32) data.push(null);
                data[30] = 1;
                data[31] = 1;
            } else {
                if (data.length === 0) data.push(1);
                else data[0] = 1;
            }

            return JSON.stringify(data);
        } catch (_) {
            return value;
        }
    }

    function patchGeminiPayload(value) {
        let patched = value;
        try {
            const data = JSON.parse(value);
            if (Array.isArray(data) && typeof data[14] === 'number' && data[14] !== GEMINI_STATUS_AVAILABLE) {
                // GetUserStatus places the client eligibility code at index 14.
                // Keep the live model catalogue at index 15 intact.
                data[14] = GEMINI_STATUS_AVAILABLE;
                patched = JSON.stringify(data);
            }
        } catch (_) {
            // The capability pass below still works on a JSON-shaped string.
        }

        // GetUserStatus returns capability lists as runs of small integer IDs.
        // Keep the change narrow: short arrays are not capability lists.
        return patched.replace(/\[((?:\d{1,4},){8,}\d{1,4})\]/g, (whole, inner) => {
            const ids = inner.split(',').map(Number);
            const missing = GEMINI_CAPABILITY_IDS.filter((id) => !ids.includes(id));
            return missing.length ? '[' + inner + ',' + missing.join(',') + ']' : whole;
        });
    }

    function patchEntry(entry) {
        if (!Array.isArray(entry) || entry[0] !== 'wrb.fr' || typeof entry[1] !== 'string') {
            return false;
        }

        const rpcId = entry[1];
        if (typeof entry[2] !== 'string') return false;

        let patched = entry[2];
        if (FLOW_RPCS.has(rpcId)) patched = patchFlowPayload(patched, rpcId);
        else if (rpcId === GEMINI_RPC) patched = patchGeminiPayload(patched);
        else return false;

        if (patched === entry[2]) return false;
        entry[2] = patched;
        return true;
    }

    function patchFrame(frame) {
        if (!Array.isArray(frame)) return false;
        let changed = false;
        for (const entry of frame) {
            if (patchEntry(entry)) changed = true;
        }
        return changed;
    }

    function patchGoogleStream(raw) {
        if (typeof raw !== 'string' || !raw || !hasTargetRpc(raw)) return raw;

        let start = 0;
        let prefix = '';
        if (raw.startsWith(")]}'")) {
            const firstNewline = raw.indexOf('\n');
            if (firstNewline < 0) return raw;
            start = firstNewline + 1;
            if (raw[start] === '\n') start++;
            prefix = raw.slice(0, start);
        }

        const body = raw.slice(start);

        // Some Google responses are a regular JSON batch rather than a framed stream.
        try {
            const data = JSON.parse(body);
            if (Array.isArray(data) && patchFrame(data)) {
                patchCount++;
                return prefix + JSON.stringify(data);
            }
        } catch (_) {
            // Continue with the framed batchexecute parser.
        }

        let position = start;
        let output = prefix;
        let changed = false;

        while (position < raw.length) {
            const newline = raw.indexOf('\n', position);
            if (newline < 0) {
                output += raw.slice(position);
                break;
            }

            const lengthText = raw.slice(position, newline);
            if (!/^\d+$/.test(lengthText)) {
                output += raw.slice(position);
                break;
            }

            // Google's batchexecute framing is counted against the JavaScript
            // response string. Do not convert it to UTF-8 bytes: a localized
            // response (for example, Russian Gemini labels) then lands mid-codepoint.
            const declaredLength = Number(lengthText);
            const segment = raw.substr(newline, declaredLength);
            if (!segment.startsWith('\n') || segment.length !== declaredLength) {
                output += raw.slice(position);
                break;
            }

            const payloadText = segment.slice(1);
            let payload;
            let frameChanged = false;
            try {
                payload = JSON.parse(payloadText);
                frameChanged = patchFrame(payload);
            } catch (_) {
                // Preserve an unknown frame byte-for-byte.
            }

            if (frameChanged) {
                const rebuilt = '\n' + JSON.stringify(payload);
                output += String(rebuilt.length) + rebuilt;
                changed = true;
                patchCount++;
            } else {
                output += lengthText + segment;
            }

            position = newline + declaredLength;
        }

        return changed ? output : raw;
    }

    function patchDeepJson(value) {
        if (!value || typeof value !== 'object') return false;
        let changed = false;

        if (Array.isArray(value)) {
            for (const item of value) {
                if (patchDeepJson(item)) changed = true;
            }
            return changed;
        }

        for (const key of Object.keys(value)) {
            if (key === 'availabilityState' && value[key] !== 'AVAILABLE') {
                value[key] = 'AVAILABLE';
                changed = true;
            } else if (key === 'isCountrySupported' || key === 'is_country_supported') {
                if (value[key] !== true) {
                    value[key] = true;
                    changed = true;
                }
            } else if (key === 'isAgeSupported' || key === 'is_age_supported') {
                if (value[key] !== true) {
                    value[key] = true;
                    changed = true;
                }
            } else if (value[key] && typeof value[key] === 'object') {
                if (patchDeepJson(value[key])) changed = true;
            }
        }

        return changed;
    }

    function shouldPatchJsonEndpoint(url) {
        return /fetchToolAvailability|checkAppAvailability|trpc\/general\./.test(url);
    }

    function getRequestUrl(input) {
        return typeof input === 'string' ? input : (input && input.url) || '';
    }

    function patchResponse(response, url) {
        if (!url.includes('batchexecute') && !shouldPatchJsonEndpoint(url)) return response;
        targetResponseCount++;

        return response.clone().text().then((raw) => {
            let patched = raw;
            if (url.includes('batchexecute')) {
                patched = patchGoogleStream(raw);
            } else {
                try {
                    const data = JSON.parse(raw);
                    if (!patchDeepJson(data)) return response;
                    patched = JSON.stringify(data);
                } catch (_) {
                    return response;
                }
            }

            if (patched === raw) return response;
            const headers = new Headers(response.headers);
            headers.delete('content-length');
            headers.delete('content-encoding');
            return new Response(patched, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        }).catch(() => response);
    }

    // Gemini normally uses XHR for batchexecute; Flow and Labs use both XHR and fetch.
    try {
        const nativeFetch = win.fetch;
        win.fetch = function (...args) {
            const url = getRequestUrl(args[0]);
            return nativeFetch.apply(this, args).then((response) => patchResponse(response, url));
        };
    } catch (error) {
        console.warn(LOG_PREFIX, 'fetch hook failed', error);
    }

    try {
        const XHR = win.XMLHttpRequest;
        const nativeOpen = XHR && XHR.prototype && XHR.prototype.open;
        if (!nativeOpen) throw new Error('XMLHttpRequest.open is unavailable');

        XHR.prototype.open = function (method, url) {
            this.__googleAiUrl = String(url || '');
            return nativeOpen.apply(this, arguments);
        };

        for (const property of ['responseText', 'response']) {
            const nativeDescriptor = Object.getOwnPropertyDescriptor(XHR.prototype, property);
            if (!nativeDescriptor || !nativeDescriptor.get) continue;

            Object.defineProperty(XHR.prototype, property, {
                configurable: true,
                enumerable: nativeDescriptor.enumerable,
                get: function () {
                    const raw = nativeDescriptor.get.call(this);
                    const url = this.__googleAiUrl || '';
                    const isTextResponse = property === 'responseText'
                        || !this.responseType
                        || this.responseType === 'text';
                    if (!isTextResponse || typeof raw !== 'string' || !raw) return raw;
                    if (!url.includes('batchexecute') && !shouldPatchJsonEndpoint(url)) return raw;
                    targetResponseCount++;

                    if (this.__googleAiCacheRaw === raw) return this.__googleAiCachePatched;
                    let patched = raw;
                    try {
                        patched = url.includes('batchexecute')
                            ? patchGoogleStream(raw)
                            : (() => {
                                const data = JSON.parse(raw);
                                return patchDeepJson(data) ? JSON.stringify(data) : raw;
                            })();
                    } catch (_) {
                        patched = raw;
                    }

                    this.__googleAiCacheRaw = raw;
                    this.__googleAiCachePatched = patched;
                    return patched;
                },
            });
        }
    } catch (error) {
        console.warn(LOG_PREFIX, 'XHR hook failed', error);
    }

    win.__googleAiUnlockStatus = () => ({
        patches: patchCount,
        targetResponses: targetResponseCount,
        flowRpcs: [...FLOW_RPCS],
        geminiRpc: GEMINI_RPC,
        geminiCapabilityIds: [...GEMINI_CAPABILITY_IDS],
        geminiAvailableStatus: GEMINI_STATUS_AVAILABLE,
    });

    console.info(LOG_PREFIX, 'active on', location.host);
})();
