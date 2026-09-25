# TikTok Video/Audio Downloader


Posted just in case somebody else wants it. Personal project.

[![License](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Greasy Fork](https://img.shields.io/badge/greasyfork-v1.3-red.svg)](https://greasyfork.org/en/scripts/596966)


---

## Overview


This userscript adds a download button to TikTok on the web. One click saves the video on screen to your computer in the **highest quality TikTok has for it, with no watermark**, or saves just its audio.

The button sits in the bottom-right corner and looks like TikTok's own like/comment/share buttons. Click it and choose:

- **MP4 · video**: the video, at the best resolution available.
- **MP3 · audio**: the video's sound file.

Everything is saved locally. Nothing is sent to any third-party site or download service.

### Before / After

| | Behavior |
|---|---|
| **Without this script** | No download option, or a watermarked, lower-quality copy from TikTok's own "Save video" |
| **With this script** | One click saves the highest quality file, without a watermark |

---

## What are user scripts?

User scripts put you in control of your browsing experience. Once installed, they automatically make the sites you visit better by adding features, making them easier to use, or taking out the annoying bits. The user scripts on Greasy Fork were written by other users and posted to share with the world. They're free to install and easy to use.

---

## Installation

### Greasy Fork

1. Install a user script manager.

   To use user scripts you need to first install a user script manager. Which user script manager you can use depends on which browser you use.

   - **Chrome:** [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
   - **Firefox:** [Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/), [Tampermonkey](https://www.tampermonkey.net/), or [Violentmonkey](https://violentmonkey.github.io/)
   - **Safari:** [Tampermonkey](https://www.tampermonkey.net/) or [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)
   - **Microsoft Edge:** [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
   - **Opera:** [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
   - **Maxthon:** [Violentmonkey](https://violentmonkey.github.io/)

   *(Note: If you are using the Tampermonkey extension in a Chrome-based browser, follow [these instructions](https://www.tampermonkey.net/faq.php#Q209) to enable Developer Mode.)*

2. Install this script by visiting Greasy Fork: `(https://greasyfork.org/en/scripts/596966)`

   Or install it straight from this repo by opening [`tiktok-video-downloader.user.js`](tiktok-video-downloader.user.js) and clicking **Raw**. Your script manager will offer to install it.


---

## How to Use

Visit [tiktok.com](https://www.tiktok.com/) or hard-refresh your browser (ctrl + shift + R), then:

1. Scroll to the video you want.
2. Click the download button in the bottom-right corner.
3. Choose **MP4 · video** or **MP3 · audio**.

The file saves as `tiktok_<username>_<video id>.mp4` (or `.mp3`).

No configuration is needed. The script:

- Picks the best quality by **resolution first**, so 1080p always beats 540p, and uses bitrate only to break ties.
- Keeps backup download links for every video, because TikTok's servers sometimes refuse a link at random.
- Moves the button to the left when the comment panel is open, so the panel never covers it.
- **Hides the button while a LIVE is on screen**, since a live stream can't be saved as a file. It comes back as soon as you scroll to a normal video.

### Works on

- The **For You** feed
- Profile pages
- Individual video pages

### Things to know

- **MP3 is the video's sound file, not a recording of the video.** For a video with its own original sound, that's the video's audio. For a video that uses someone else's sound, you get that original sound track, not this video's mix of it.
- The button only appears once TikTok has loaded the data for the video on screen. If it doesn't show up on a video, reload the page and scroll back to it.

---

## Changelog

### 1.3

- The download button now hides while a LIVE is on screen, and comes back on the next normal video.

Older release notes are on [Greasy Fork](https://greasyfork.org/en/scripts/596966).

---

## Contributing

I welcome contributions from the community! If you'd like to contribute to TikTok Video/Audio Downloader, follow these steps:

### Reporting Issues

If you find a bug, compatibility issue, or have a feature request, please:

1. Check if the issue has already been reported in the **Issues** tab.
2. If not, create a new issue with a clear title and description. Attach screenshots, a screen recording, or console logs if applicable.

Please include:

- Your browser + version
- Your userscript manager (Tampermonkey / Violentmonkey) + version
- A link to the video that failed (if known)
- What you expected vs. what happened

The console logs start with `[TikTok HQ DL]` (press F12 → Console to see them).


## Support Author

If you like this script, you can [buy me a coffee ☕](https://ko-fi.com/deadnme)
