# DMovie روی هاست Node (سی‌پنل)

یک اپ: `/api` سرویس زیرنویس، بقیه مسیرها خود وب‌اپ.

## فایل‌ها

- `package.json`
- `server.js`
- `folderListingProxy.cjs`
- `mkvSubtitles.js`
- `dist/` (خروجی Expo)

## سی‌پنل

این بسته را **جایگزین** اپ قبلی روی `movie.mr-div.ir` کن (همان Application root).

- Node ۱۸+
- Application startup file: `server.js`
- فقط **Start App** (نه Run Start جداگانه)
- پورت از `PORT`

بعد از استارت:

- `http://movie.mr-div.ir/` → اپ
- `http://movie.mr-div.ir/health` → `{"ok":true,"service":"dmovie-host"}`
- `http://movie.mr-div.ir/title/tt0111161` → صفحه فیلم
- `http://movie.mr-div.ir/api/episodes?url=` → لیست قسمت‌های سریال
- `http://movie.mr-div.ir/api/media-stream?url=` → remux زندهٔ MKV→MP4 برای Safari/آیفون
- `http://movie.mr-div.ir/health` → باید `"ffmpeg": true` باشد

برای پخش SoftSub روی آیفون، باینری ffmpeg لینوکس در `vendor/ffmpeg` لازم است
(`npm run host:ffmpeg` قبل از دیپلوی آن را می‌گیرد).

`npm start` یا `node server.js`.
