# Tomato Upload Checkpoint 2026-07-03

Current browser/tab:
- Active Tomato upload tab: 1472918173, URL https://www.novelfm.com/creator/music/finished/ugc/uploadProduct
- Audio already uploaded on current page: 时间把我落在雨里.mp3, MP3 上传完成 4.7MB
- Lyrics already uploaded: 时间把我落在雨里.txt, 上传完成 1.2KB
- Cover crop dialog was confirmed successfully. DOM now contains song-cover image.
- Remaining visible missing fields after cover: 作品名称 empty (0/40), 词作者/曲作者/制作人/歌手 show 添加自己, AI作品 radio, optional copyright/platform.
- Next button exists and is enabled at the DOM level, but platform may still validate required fields on click.

Local generated package:
- E:\music\runs\ZN7lsKIkvp\快去发光.mp3
- E:\music\runs\ZN7lsKIkvp\快去发光.lyrics.txt
- E:\music\runs\ZN7lsKIkvp\快去发光.png
- E:\music\runs\ZN7lsKIkvp\快去发光.tomato-package.zip
- CORS local server running on http://127.0.0.1:8870/ and verified readable for mp3/txt/png.

Tried approaches / boundaries:
- Clicking Tomato upload box creates hidden input[type=file] accept=.wav,.mp3 on tab 1472918087.
- tmwebdriver CDP bridge tabs works, but cdp Runtime.evaluate / DOM.setFileInputFiles to Tomato tabs fails with: Cannot access a chrome-extension:// URL of different extension. Stop retrying same CDP bridge path.
- Physical ljqCtrl click failed because foreground became Windows 默认锁屏界面; do not blindly keep physical clicking.
- Chrome has no --remote-debugging-port open, so direct DevTools HTTP/CDP was unavailable.
- Page-injected DataTransfer+File from local CORS is viable for visible-generated file inputs, but current active tab already has audio/lyrics and only cover/copyright inputs remained.

Next engineering task:
- Inspect E:\music code, find publisher/auto-upload module.
- Implement robust Tomato auto-upload by extracting package, opening Tomato page, injecting files via browser context where possible, and filling metadata fields (song name, lyricist/composer/producer/singer, AI declaration).
- Also finish earlier app requirements: dropdown click issue and 5s auto-advance if not already implemented/verified.
