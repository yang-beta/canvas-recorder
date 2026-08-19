洸限｜品牌故事 WebM 錄影版

檔案結構：
index.html
export.js
img/man-s.png

使用方式：
1. 保持上述三個檔案/資料夾相對位置不變。
2. 用 Chrome 或 Edge 開啟 index.html。
3. 頁面會先等待 Noto Serif TC 與人物圖片載入完成。
4. export.js 會建立獨立的 1920×1080 exportCanvas。
5. exportCanvas 會同步重建：背景 Canvas、人物、人物陰影、聚焦模糊、括號、前後文字。
6. 使用 exportCanvas.captureStream(60) + MediaRecorder 錄成 WebM。
7. 「拾洸記憶展」1.5 秒進場完成後，再停留 2 秒，自動停止並下載 brand-story-1920x1080.webm。

錄影規格：
1920×1080
60 FPS
30 Mbps
WebM（優先 VP9，瀏覽器不支援時自動改 VP8 / WebM）

暫時關閉自動錄影：
打開 export.js，將：
AUTO_RECORD:true
改成：
AUTO_RECORD:false

手動錄影（Console）：
window.brandStoryExporter.startRecording()
window.brandStoryExporter.stopRecording()

注意：
- 網頁原本的 DOM / CSS 動畫仍照常播放，exportCanvas 是獨立輸出層。
- 不使用 html2canvas、CCapture 或其他第三方錄影套件。
- 瀏覽器對 MediaRecorder 編碼能力不同，因此實際碼率可能由瀏覽器做些微調整。
