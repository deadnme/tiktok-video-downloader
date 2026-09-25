// ==UserScript==
// @name         TikTok Video/Audio Downloader - Fetch Highest Quality Video/Audio
// @namespace    none
// @version      1.3
// @description  Saves locally. One click downloads the TikTok video/audio, highest quality, no watermark
// @author       deadnme
// @license      GNU GPLv3
// @icon         https://www.tiktok.com/favicon.ico
// @match        *://*.tiktok.com/*
// @run-at       document-start
// @grant        none
// @downloadURL https://update.greasyfork.org/scripts/596966/TikTok%20VideoAudio%20Downloader%20-%20Fetch%20Highest%20Quality%20VideoAudio.user.js
// @updateURL https://update.greasyfork.org/scripts/596966/TikTok%20VideoAudio%20Downloader%20-%20Fetch%20Highest%20Quality%20VideoAudio.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = true;
    const log = (...args) => DEBUG && console.log('[TikTok HQ DL]', ...args);

    // ---------------------------------------------------------------
    // How this works
    // ---------------------------------------------------------------
    // Older versions opened the video's own page in a tab and read the
    // data out of it. TikTok now answers a direct load of
    // /@user/video/<id> with HTTP 403 (navigation and fetch alike), so
    // that route is dead.
    //
    // What still works: TikTok's own app fetches every video's data
    // itself -- /api/recommend/item_list/ for the feed, item_list for
    // profiles, plus the first couple of videos baked into the page's
    // hydration blob. Those responses carry the full bitrateInfo list.
    // So we hook fetch/XHR at document-start and keep every video
    // object that goes past. Clicking the button then looks up the
    // video on screen in that cache and downloads it straight away --
    // no extra tab, nothing to paste, no 403.
    //
    // @grant none is deliberate: the script runs in the page itself,
    // so it can hook the page's own fetch (a userscript sandbox can't,
    // and TikTok's CSP blocks injecting a <script> to get there).
    // ---------------------------------------------------------------

    const VIDEO_ID_PATTERN = /\/video\/(\d+)/;
    const NODE_ID_PATTERN = /(\d{15,})/; // ids are 19 digits: matches xgwrapper-0-<id>, ignores xgwrapper-0-
    // The box that holds one video. Detection never looks outside it --
    // the page is full of links to OTHER videos (sidebar, suggestions),
    // and a document-wide scan happily grabs one of those instead.
    const ITEM_SELECTOR = '[data-e2e="feed-video"], [data-e2e="user-post-item"], article, [id*="xgwrapper"]';

    // ---------------------------------------------------------------
    // Cache: every video object TikTok loads, keyed by id
    // ---------------------------------------------------------------

    const items = new Map();

    // Scope names differ per page type (itemList, itemModule,
    // updated-items, video-detail...), so don't chase key names --
    // just keep anything shaped like a video.
    const harvest = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach(harvest);
            return;
        }
        if (typeof node.id === 'string' && node.video && (node.video.bitrateInfo || node.video.playAddr)) {
            items.set(node.id, node);
        }
        for (const value of Object.values(node)) harvest(value);
    };

    const harvestText = (text) => {
        if (!text || !text.includes('bitrateInfo')) return;
        try {
            harvest(JSON.parse(text));
        } catch (e) {
            // not JSON, ignore
        }
    };

    // With @grant none we already run in the page. If a grant ever gets
    // added (which sandboxes the script), unsafeWindow is the way back
    // to the page's own fetch -- hooking the sandbox's copy sees nothing.
    const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;

    const originalFetch = W.fetch;
    W.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
            response.clone().text().then(harvestText);
        } catch (e) {
            // body already consumed / opaque response
        }
        return response;
    };

    const originalSend = W.XMLHttpRequest.prototype.send;
    W.XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', () => {
            try {
                harvestText(this.responseText);
            } catch (e) {
                // non-text response type
            }
        });
        return originalSend.apply(this, args);
    };

    // The first videos of a page are baked into the HTML, not fetched.
    const seedFromDocument = () => {
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__') || document.getElementById('SIGI_STATE');
        if (el) harvestText(el.textContent);
        log('Seeded from page,', items.size, 'video(s) cached');
    };

    // ---------------------------------------------------------------
    // Pick the best quality
    // ---------------------------------------------------------------

    // Resolution dominates (1080p should always beat 540p); bitrate
    // only breaks ties within a resolution, since different codecs
    // (h264 vs h265/bytevc1) use different bitrates for the same look.
    const scoreCandidate = (b) => {
        const width = b?.PlayAddr?.Width || b?.Width || 0;
        const height = b?.PlayAddr?.Height || b?.Height || 0;
        return width * height * 1e7 + (b?.Bitrate || 0);
    };

    // Best quality first, then its mirrors, then the plain play/download
    // URLs. Individual CDN URLs 403 at random, so always keep spares.
    const urlCandidates = (item) => {
        const urls = [];
        const bitrateInfo = item?.video?.bitrateInfo;
        if (Array.isArray(bitrateInfo) && bitrateInfo.length) {
            log('Available qualities:', bitrateInfo.map((b) => ({
                gear: b?.GearName,
                width: b?.PlayAddr?.Width || b?.Width,
                height: b?.PlayAddr?.Height || b?.Height,
                bitrate: b?.Bitrate,
                codec: b?.CodecType,
            })));
            const best = bitrateInfo.reduce((a, b) => (scoreCandidate(b) > scoreCandidate(a) ? b : a));
            log('Picked', best?.GearName);
            urls.push(...(best?.PlayAddr?.UrlList || []));
        }
        urls.push(item?.video?.playAddr, item?.video?.downloadAddr);
        return [...new Set(urls.filter(Boolean))];
    };

    // ---------------------------------------------------------------
    // Which video is on screen?
    // ---------------------------------------------------------------

    const detectId = () => {
        const start = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        const box = start?.closest(ITEM_SELECTOR);
        if (box) {
            // The player wrapper carries the id: xgwrapper-0-<id>
            const el = [box, ...box.querySelectorAll('[id]')].find((n) => NODE_ID_PATTERN.test(n.id || ''));
            if (el) return el.id.match(NODE_ID_PATTERN)[1];
            const href = box.querySelector('a[href*="/video/"]')?.getAttribute('href');
            const id = href?.match(VIDEO_ID_PATTERN)?.[1];
            if (id) return id;
        }
        return location.href.match(VIDEO_ID_PATTERN)?.[1] || null;
    };

    // ---------------------------------------------------------------
    // Download -- plain fetch + a blob link, no extension APIs needed
    // ---------------------------------------------------------------

    const save = (blob, name) => {
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 60000);
    };

    // The two CDNs disagree about cookies: the video one 403s without
    // them, the music one sends "Allow-Origin: *" and so refuses any
    // credentialed request outright. Try both ways rather than guess.
    const fetchFirst = async (urls) => {
        for (const url of urls) {
            for (const credentials of ['include', 'omit']) {
                try {
                    const res = await fetch(url, { credentials });
                    if (res.ok) return res;
                    log('HTTP', res.status, `(credentials: ${credentials})`, url);
                } catch (e) {
                    log('Blocked', `(credentials: ${credentials})`, e.message);
                }
            }
        }
        return null;
    };

    // ponytail: mp3 = the item's sound file, no transcoding. For an
    // original sound that IS the video's audio; for a borrowed sound
    // it's the original track, not this video's mix. Muxing in the
    // browser needs ffmpeg.wasm, which TikTok's CSP won't load anyway.
    const sourcesFor = (item, kind) => (kind === 'mp3'
        ? [item?.music?.playUrl].filter(Boolean)
        : urlCandidates(item));

    const download = async (item, kind) => {
        const sources = sourcesFor(item, kind);
        if (!sources.length) {
            toast(kind === 'mp3' ? 'No sound file on that video.' : 'No downloadable URL for that video.');
            return;
        }
        const name = `tiktok_${item.author?.uniqueId || 'video'}_${item.id}.${kind}`;
        toast(`Downloading ${kind.toUpperCase()} ${item.author?.uniqueId ? '@' + item.author.uniqueId : item.id}…`);
        const res = await fetchFirst(sources);
        if (!res) {
            toast('Download failed - every URL refused. See console.');
            return;
        }
        const blob = await res.blob();
        save(blob, name);
        log('Saved', name, blob.size, 'bytes');
        toast(`Saved ${name}`);
    };

    // ---------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------

    let buttonEl = null;

    const toast = (text) => {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = `
            position: fixed;
            right: ${buttonEl?.style.right || '16px'};
            bottom: 88px;
            z-index: 2147483647;
            max-width: 260px;
            background: rgba(0, 0, 0, 0.82);
            color: #fff;
            font: 12px/1.4 system-ui, sans-serif;
            padding: 6px 10px;
            border-radius: 4px;
            pointer-events: none;
        `;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    };

    const pick = (kind) => {
        const id = detectId();
        if (!id) {
            toast("Couldn't tell which video is on screen (a live stream?).");
            return;
        }
        const item = items.get(id);
        if (!item) {
            log('Id', id, 'not in cache of', items.size);
            toast('That video’s data never loaded. Reload the page and scroll to it.');
            return;
        }
        download(item, kind);
    };

    // Shaped like TikTok's own action items (like/comment/share): a
    // 48px translucent circle with a 21px icon.
    // Values lifted from their computed styles.
    const IDLE_BG = 'rgba(255, 255, 255, 0.13)';
    const HOVER_BG = 'rgba(255, 255, 255, 0.2)';

    // The comment sidebar docks against the right edge, right on top of
    // the button, so slide the button to its left while it's open.
    const COMMENT_PANEL_SELECTOR = '[class*="CommentSidebar"], [class*="OneColumnSidebar"], [class*="CommentContainer"]';

    const dockedPanel = () => {
        for (const el of document.querySelectorAll(COMMENT_PANEL_SELECTOR)) {
            const r = el.getBoundingClientRect();
            if (r.width > 100 && r.height > 200 && r.right >= window.innerWidth - 8) return r;
        }
        return null;
    };

    // Only offer a download when the video on screen is one we can
    // actually save. Lives never land in the cache (no bitrateInfo /
    // playAddr), and their boxes carry no video id, so they fail here.
    const downloadable = () => items.has(detectId());

    const keepClearOfComments = (button, closeMenu) => {
        const reposition = () => {
            const panel = dockedPanel();
            button.style.right = panel ? `${Math.round(window.innerWidth - panel.left) + 16}px` : '16px';
            const show = downloadable();
            if (!show) closeMenu();
            button.style.display = show ? 'flex' : 'none';
        };
        reposition();
        // ponytail: a 400ms poll of one getBoundingClientRect, rather than
        // watching TikTok's constant re-renders. Swap for a ResizeObserver
        // if it ever shows up in a profile.
        setInterval(reposition, 400);
    };

    const addButton = () => {
        const button = document.createElement('div');
        button.id = 'ttdl-button';
        button.title = 'Download the TikTok video on screen';
        button.style.cssText = `
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483647;
            width: 48px;
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            user-select: none;
            transition: right 0.2s ease;
        `;

        const circle = document.createElement('div');
        circle.style.cssText = `
            width: 48px;
            height: 48px;
            border-radius: 9999px;
            background: ${IDLE_BG};
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s ease;
        `;
        circle.innerHTML = '<svg width="21" height="21" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" aria-hidden="true">'
            + '<path d="M12 3a1.3 1.3 0 0 1 1.3 1.3v8.5l2.6-2.6a1.3 1.3 0 1 1 1.84 1.84l-4.82 4.82a1.3 1.3 0 0 1-1.84 0L6.26 12.04A1.3 1.3 0 1 1 8.1 10.2l2.6 2.6V4.3A1.3 1.3 0 0 1 12 3Z"/>'
            + '<path d="M4.3 15.2a1.3 1.3 0 0 1 1.3 1.3v2.2h12.8v-2.2a1.3 1.3 0 1 1 2.6 0v2.7a1.8 1.8 0 0 1-1.8 1.8H5.1a1.8 1.8 0 0 1-1.8-1.8v-2.7a1.3 1.3 0 0 1 1-1.3Z"/></svg>';

        // Format menu, anchored to the button so it rides along when the
        // comment sidebar pushes the button left.
        const menu = document.createElement('div');
        menu.style.cssText = `
            position: absolute;
            right: 0;
            bottom: 56px;
            display: none;
            flex-direction: column;
            overflow: hidden;
            min-width: 108px;
            border-radius: 8px;
            background: rgba(30, 30, 30, 0.96);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
            font: 600 13px/1 TikTokFont, Arial, Tahoma, PingFangSC, sans-serif;
            color: rgba(255, 255, 255, 0.9);
        `;

        const option = (kind, caption) => {
            const row = document.createElement('div');
            row.textContent = caption;
            row.style.cssText = 'padding: 11px 14px; white-space: nowrap; transition: background 0.15s ease;';
            row.addEventListener('mouseover', () => { row.style.background = 'rgba(255, 255, 255, 0.12)'; });
            row.addEventListener('mouseout', () => { row.style.background = 'transparent'; });
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                closeMenu();
                pick(kind);
            });
            return row;
        };

        const closeMenu = () => { menu.style.display = 'none'; };
        menu.append(option('mp4', 'MP4 · video'), option('mp3', 'MP3 · audio'));

        button.append(menu, circle);
        button.addEventListener('mouseover', () => { circle.style.background = HOVER_BG; });
        button.addEventListener('mouseout', () => { circle.style.background = IDLE_BG; });
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
        });
        document.addEventListener('click', closeMenu);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

        document.body.appendChild(button);
        buttonEl = button;
        keepClearOfComments(button, closeMenu);
    };

    const start = () => {
        seedFromDocument();
        addButton();
        if (location.hash === '#tiktokdl-selftest') selfTest();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    // ---------------------------------------------------------------
    // Self-check: load any tiktok.com page with #tiktokdl-selftest
    // ---------------------------------------------------------------

    function selfTest() {
        const ok = (cond, name) => console[cond ? 'log' : 'error'](`[selftest] ${cond ? 'PASS' : 'FAIL'} - ${name}`);
        const ID = '7234567890123456789';
        const hd = { GearName: 'normal_1080', PlayAddr: { Width: 1080, Height: 1920, UrlList: ['hd.mp4'] }, Bitrate: 900000 };
        const sd = { GearName: 'normal_540', PlayAddr: { Width: 540, Height: 960, UrlList: ['sd.mp4'] }, Bitrate: 5000000 };

        ok(scoreCandidate(hd) > scoreCandidate(sd), 'resolution outranks a fatter low-res bitrate');
        ok(urlCandidates({ video: { bitrateInfo: [sd, hd] } })[0] === 'hd.mp4', 'best gear is tried first');
        ok(urlCandidates({ video: { bitrateInfo: [sd, hd], playAddr: 'p.mp4' } }).join() === 'hd.mp4,p.mp4', 'playAddr kept as a spare');
        ok(urlCandidates({ video: { playAddr: 'p.mp4', downloadAddr: 'p.mp4' } }).length === 1, 'duplicate URLs collapse');

        const withSound = { music: { playUrl: 'a.mp3' }, video: { playAddr: 'v.mp4' } };
        ok(sourcesFor(withSound, 'mp3')[0] === 'a.mp3', 'mp3 comes from the sound file');
        ok(sourcesFor(withSound, 'mp4')[0] === 'v.mp4', 'mp4 comes from the video');
        ok(sourcesFor({ video: { playAddr: 'v.mp4' } }, 'mp3').length === 0, 'no sound file means nothing to try');

        const before = items.size;
        harvest({ some: { nest: [{ id: ID, video: { bitrateInfo: [hd] } }, { id: 'x', notAVideo: 1 }] } });
        ok(items.get(ID)?.video?.bitrateInfo?.length === 1, 'harvest finds items at any depth');
        ok(items.size === before + 1, 'harvest keeps only video-shaped objects');
        items.delete(ID);

        ok(`/@u/video/${ID}`.match(VIDEO_ID_PATTERN)?.[1] === ID, 'video id regex');
        ok(`xgwrapper-0-${ID}`.match(NODE_ID_PATTERN)?.[1] === ID, 'node id regex finds the long id');
        ok(!NODE_ID_PATTERN.test('xgwrapper-0-'), 'node id regex ignores short numbers');
    }
})();
