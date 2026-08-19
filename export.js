(() => {
  "use strict";

  /* ============================================================
     品牌故事影片輸出
     - 不修改原畫面 DOM 動畫
     - 另外建立 exportCanvas 重建目前畫面
     - exportCanvas.captureStream() + MediaRecorder 輸出 WebM
     ============================================================ */

  const CONFIG = {
    AUTO_RECORD:true,
    WIDTH:1920,
    HEIGHT:1080,
    FPS:60,
    VIDEO_BITS_PER_SECOND:30000000,
    FILE_NAME:"brand-story-1920x1080.webm",
    FINAL_HOLD_MS:2000
  };

  let exportCanvas = null;
  let exportCtx = null;
  let sceneCanvas = null;
  let sceneCtx = null;
  let blurCanvas = null;
  let blurCtx = null;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let rafId = null;
  let recording = false;
  let stopRequested = false;
  let completionTimer = null;

  function clamp(value,min,max) {
    return Math.max(min,Math.min(max,value));
  }

  function number(value,fallback = 0) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getPage() {
    return document.getElementById("brandStorySection");
  }

  function getSourceCanvas() {
    return document.getElementById("brandStoryCanvas");
  }

  function createCanvas(width,height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function ensureCanvases() {
    if (exportCanvas) return;

    exportCanvas = createCanvas(CONFIG.WIDTH,CONFIG.HEIGHT);
    exportCtx = exportCanvas.getContext("2d",{alpha:false});

    sceneCanvas = createCanvas(CONFIG.WIDTH,CONFIG.HEIGHT);
    sceneCtx = sceneCanvas.getContext("2d",{alpha:false});

    blurCanvas = createCanvas(CONFIG.WIDTH,CONFIG.HEIGHT);
    blurCtx = blurCanvas.getContext("2d",{alpha:false});
  }

  function getScale() {
    const page = getPage();
    if (!page) return null;

    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      pageRect:rect,
      sx:CONFIG.WIDTH / rect.width,
      sy:CONFIG.HEIGHT / rect.height
    };
  }

  function rectToExport(rect,scale) {
    return {
      x:(rect.left - scale.pageRect.left) * scale.sx,
      y:(rect.top - scale.pageRect.top) * scale.sy,
      width:rect.width * scale.sx,
      height:rect.height * scale.sy
    };
  }

  function drawBackground(scale) {
    const source = getSourceCanvas();

    sceneCtx.save();
    sceneCtx.fillStyle = "#1a1a1a";
    sceneCtx.fillRect(0,0,CONFIG.WIDTH,CONFIG.HEIGHT);

    if (source && source.width && source.height) {
      sceneCtx.drawImage(
        source,
        0,0,source.width,source.height,
        0,0,CONFIG.WIDTH,CONFIG.HEIGHT
      );
    }

    sceneCtx.restore();
  }

  function drawPersonShadow(scale) {
    const shadow = document.querySelector(".brand-story-person-shadow");
    const wrap = document.querySelector(".brand-story-person-wrap");
    if (!shadow || !wrap) return;

    const wrapStyle = getComputedStyle(wrap);
    const wrapOpacity = clamp(number(wrapStyle.opacity,0),0,1);
    if (wrapOpacity <= .001) return;

    const wrapRect = rectToExport(wrap.getBoundingClientRect(),scale);
    if (wrapRect.width <= 0 || wrapRect.height <= 0) return;

    /*
      不再使用 shadow.getBoundingClientRect()。
      getBoundingClientRect() 取得的是旋轉後的外接矩形，會遺失原 CSS 的
      rotate(120deg)、transform-origin、402% 寬度與 ::after 第二層陰影。
      這裡直接依網站 CSS 尺寸與 transform 重建。
    */
    const shadowWidth = wrapRect.width * 4.02;
    const shadowHeight = 34 * scale.sy;
    const left = wrapRect.x + wrapRect.width * .50;
    const top = wrapRect.y + wrapRect.height - shadowHeight;
    const originX = left;
    const originY = top + shadowHeight * .50;
    const translateX = shadowWidth * .04;
    const translateY = 5 * scale.sy;
    const angle = 120 * Math.PI / 180;

    function applyShadowTransform(ctx) {
      ctx.translate(originX,originY);
      ctx.translate(translateX,translateY);
      ctx.rotate(angle);
      ctx.translate(-originX,-originY);
    }

    sceneCtx.save();
    sceneCtx.globalAlpha = .90 * wrapOpacity;
    applyShadowTransform(sceneCtx);

    const gradient = sceneCtx.createLinearGradient(
      left,top,
      left + shadowWidth,top
    );
    gradient.addColorStop(0,"rgba(25,17,14,.70)");
    gradient.addColorStop(.30,"rgba(35,23,18,.50)");
    gradient.addColorStop(.67,"rgba(35,23,18,.24)");
    gradient.addColorStop(1,"rgba(35,23,18,0)");

    sceneCtx.filter = `blur(${Math.max(.5,.9 * scale.sx)}px)`;
    sceneCtx.fillStyle = gradient;
    sceneCtx.beginPath();
    sceneCtx.moveTo(left,top + shadowHeight * .43);
    sceneCtx.lineTo(left + shadowWidth,top);
    sceneCtx.lineTo(left + shadowWidth,top + shadowHeight);
    sceneCtx.lineTo(left,top + shadowHeight * .57);
    sceneCtx.closePath();
    sceneCtx.fill();
    sceneCtx.restore();

    /* 對應 .brand-story-person-shadow::after */
    const afterLeft = left + shadowWidth * .45;
    const afterTop = top + shadowHeight * .50 - (shadowHeight * 1.50) * .50;
    const afterWidth = shadowWidth * .55;
    const afterHeight = shadowHeight * 1.50;

    sceneCtx.save();
    sceneCtx.globalAlpha = .58 * wrapOpacity;
    applyShadowTransform(sceneCtx);

    const afterGradient = sceneCtx.createLinearGradient(
      afterLeft,afterTop,
      afterLeft + afterWidth,afterTop
    );
    afterGradient.addColorStop(0,"rgba(35,23,18,.18)");
    afterGradient.addColorStop(.52,"rgba(35,23,18,.08)");
    afterGradient.addColorStop(1,"rgba(35,23,18,0)");

    sceneCtx.filter = `blur(${Math.max(.5,4.6 * scale.sx)}px)`;
    sceneCtx.fillStyle = afterGradient;
    sceneCtx.beginPath();
    sceneCtx.moveTo(afterLeft,afterTop + afterHeight * .34);
    sceneCtx.lineTo(afterLeft + afterWidth,afterTop);
    sceneCtx.lineTo(afterLeft + afterWidth,afterTop + afterHeight);
    sceneCtx.lineTo(afterLeft,afterTop + afterHeight * .66);
    sceneCtx.closePath();
    sceneCtx.fill();
    sceneCtx.restore();
  }

  function drawPerson(scale) {
    const img = document.querySelector(".brand-story-person");
    const wrap = document.querySelector(".brand-story-person-wrap");
    if (!img || !wrap || !img.complete || !img.naturalWidth || !img.naturalHeight) return;

    const imgStyle = getComputedStyle(img);
    const wrapStyle = getComputedStyle(wrap);
    const opacity =
      clamp(number(imgStyle.opacity,1),0,1) *
      clamp(number(wrapStyle.opacity,0),0,1);

    if (opacity <= .001) return;

    const domRect = img.getBoundingClientRect();
    if (domRect.width <= 0 || domRect.height <= 0) return;

    /*
      重要：人物不能使用 sx / sy 分別拉伸寬高。
      當瀏覽器視窗比例與 1920×1080 不完全一致時，sx !== sy，
      直接 rectToExport() 會把人物左右壓扁或上下拉長。

      這裡改成：
      1. X / Y 位置仍依輸出畫布座標換算。
      2. 人物寬度依網頁實際寬度換算。
      3. 高度永遠由 PNG 原始長寬比計算。
      4. 以人物腳底（bottom）為錨點，避免修正比例後人物上下飄移。
    */
    const exportX =
      (domRect.left - scale.pageRect.left) * scale.sx;
    const exportBottom =
      (domRect.bottom - scale.pageRect.top) * scale.sy;

    const exportWidth = domRect.width * scale.sx;
    const imageRatio = img.naturalWidth / img.naturalHeight;
    const exportHeight = exportWidth / imageRatio;
    const exportY = exportBottom - exportHeight;

    sceneCtx.save();
    sceneCtx.globalAlpha = opacity;

    /* 保留現有網頁人物的黑色剪影效果 */
    sceneCtx.filter =
      `brightness(0) drop-shadow(0 0 ${Math.max(1,2 * scale.sx)}px rgba(0,0,0,.60))`;

    sceneCtx.drawImage(
      img,
      exportX,
      exportY,
      exportWidth,
      exportHeight
    );
    sceneCtx.restore();
  }

  function getFocusRect(scale) {
    const page = getPage();
    const style = getComputedStyle(page);

    const left = number(style.getPropertyValue("--focus-left"),35) / 100;
    const top = number(style.getPropertyValue("--focus-top"),30) / 100;
    const width = number(style.getPropertyValue("--focus-width"),30) / 100;
    const height = number(style.getPropertyValue("--focus-height"),20) / 100;

    return {
      x:CONFIG.WIDTH * left,
      y:CONFIG.HEIGHT * top,
      width:CONFIG.WIDTH * width,
      height:CONFIG.HEIGHT * height
    };
  }

  function clipOutsideFocus(ctx,focus) {
    const fx = clamp(focus.x,0,CONFIG.WIDTH);
    const fy = clamp(focus.y,0,CONFIG.HEIGHT);
    const fw = clamp(focus.width,0,CONFIG.WIDTH - fx);
    const fh = clamp(focus.height,0,CONFIG.HEIGHT - fy);

    /*
      用 even-odd 規則一次建立「全畫面扣掉中央焦點」的遮罩。
      不再把上／下／左／右切成四個矩形分別貼回，
      可避免焦點右側出現灰黑色矩形接縫。
    */
    ctx.beginPath();
    ctx.rect(0,0,CONFIG.WIDTH,CONFIG.HEIGHT);
    ctx.rect(fx,fy,fw,fh);
    ctx.clip("evenodd");
  }

  function drawBlurLayer(focus,blurPx,overlayColor,opacity) {
    if (opacity <= .001) return;

    blurCtx.save();
    blurCtx.globalAlpha = 1;
    blurCtx.filter = "none";
    blurCtx.fillStyle = "#1a1a1a";
    blurCtx.fillRect(0,0,CONFIG.WIDTH,CONFIG.HEIGHT);

    /*
      先在完整尺寸的 offscreen canvas 上建立整張模糊畫面，
      再由 exportCtx 的 inverse mask 決定哪些區域顯示。
      如此不會因分段 drawImage 產生色塊或邊界。
    */
    blurCtx.filter = `blur(${blurPx}px)`;
    blurCtx.drawImage(sceneCanvas,0,0,CONFIG.WIDTH,CONFIG.HEIGHT);
    blurCtx.restore();

    exportCtx.save();
    clipOutsideFocus(exportCtx,focus);
    exportCtx.globalAlpha = opacity;
    exportCtx.filter = "none";
    exportCtx.drawImage(blurCanvas,0,0,CONFIG.WIDTH,CONFIG.HEIGHT);
    exportCtx.fillStyle = overlayColor;
    exportCtx.fillRect(0,0,CONFIG.WIDTH,CONFIG.HEIGHT);
    exportCtx.restore();
  }

  function drawFocusBlur(scale) {
    const page = getPage();
    if (!page) return;

    const beforeStyle = getComputedStyle(page,"::before");
    const afterStyle = getComputedStyle(page,"::after");
    const beforeOpacity = clamp(number(beforeStyle.opacity,0),0,1);
    const afterOpacity = clamp(number(afterStyle.opacity,0),0,1);

    if (beforeOpacity <= .001 && afterOpacity <= .001) return;

    const focus = getFocusRect(scale);

    if (beforeOpacity > .001) {
      drawBlurLayer(
        focus,
        2.4 * scale.sx,
        "rgba(18,18,18,.025)",
        beforeOpacity
      );
    }

    if (afterOpacity > .001) {
      drawBlurLayer(
        focus,
        6.8 * scale.sx,
        "rgba(18,18,18,.045)",
        afterOpacity
      );
    }
  }

  function getFontString(style,scale) {
    const size = number(style.fontSize,16) * scale.sy;
    const family = style.fontFamily || '"Noto Serif TC",serif';
    const weight = style.fontWeight || "400";
    const fontStyle = style.fontStyle || "normal";
    return `${fontStyle} ${weight} ${size}px ${family}`;
  }

  function drawLetterSpacedText(ctx,text,x,y,letterSpacing) {
    if (!text) return;

    const chars = Array.from(text);
    const widths = chars.map(char => ctx.measureText(char).width);
    const total =
      widths.reduce((sum,width) => sum + width,0) +
      Math.max(0,chars.length - 1) * letterSpacing;

    let cursor = x - total / 2;

    chars.forEach((char,index) => {
      const width = widths[index];
      ctx.fillText(char,cursor + width / 2,y);
      cursor += width + letterSpacing;
    });
  }

  function drawTextElement(el,scale,clipEl = null,parentOpacity = 1) {
    if (!el) return;

    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return;

    const opacity =
      clamp(number(style.opacity,1),0,1) *
      clamp(parentOpacity,0,1);

    if (opacity <= .001) return;

    const rect = rectToExport(el.getBoundingClientRect(),scale);
    if (rect.width <= 0 || rect.height <= 0) return;

    exportCtx.save();

    if (clipEl) {
      const clipRect = rectToExport(clipEl.getBoundingClientRect(),scale);
      /*
        DOM 的 mask 寬度是依瀏覽器字型排版計算；Canvas measureText 在
        Noto Serif TC 載入／字距計算上可能多出數個像素。
        只放寬左右裁切區，垂直方向仍保持原 reveal 遮罩效果。
      */
      const clipSafeX = 32 * scale.sx;
      exportCtx.beginPath();
      exportCtx.rect(
        clipRect.x - clipSafeX,
        clipRect.y,
        clipRect.width + clipSafeX * 2,
        clipRect.height
      );
      exportCtx.clip();
    }

    exportCtx.globalAlpha = opacity;
    exportCtx.fillStyle = style.color;
    exportCtx.font = getFontString(style,scale);
    exportCtx.textAlign = "center";
    exportCtx.textBaseline = "middle";

    const letterSpacing = number(style.letterSpacing,0) * scale.sx;
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;

    drawLetterSpacedText(
      exportCtx,
      el.textContent || "",
      centerX,
      centerY,
      letterSpacing
    );

    exportCtx.restore();
  }

  function drawFinalText(scale) {
    const finalCopy = document.querySelector(".brand-story-final-copy");
    if (!finalCopy) return;

    const parentOpacity = clamp(
      number(getComputedStyle(finalCopy).opacity,1),
      0,1
    );

    document.querySelectorAll(".brand-story-final-line").forEach(el => {
      drawTextElement(el,scale,el.parentElement,parentOpacity);
    });
  }

  function drawPromoText(scale) {
    document.querySelectorAll(".brand-story-promo-item").forEach(item => {
      const itemStyle = getComputedStyle(item);
      if (itemStyle.visibility === "hidden") return;

      const itemOpacity = clamp(number(itemStyle.opacity,1),0,1);
      const line = item.querySelector(".brand-story-promo-line");
      drawTextElement(line,scale,item,itemOpacity);
    });
  }

  function drawBrackets(scale) {
    const finalCopy = document.querySelector(".brand-story-final-copy");
    const finalCopyOpacity = finalCopy
      ? clamp(number(getComputedStyle(finalCopy).opacity,1),0,1)
      : 1;

    /* 父層已隱藏後，錄影 Canvas 也必須立即停止畫括號。 */
    if (finalCopyOpacity <= .001) return;

    document.querySelectorAll(".brand-story-final-bracket").forEach(el => {
      const style = getComputedStyle(el);
      const opacity =
        clamp(number(style.opacity,0),0,1) * finalCopyOpacity;
      if (opacity <= .001) return;

      const rect = rectToExport(el.getBoundingClientRect(),scale);
      if (rect.width <= 0 || rect.height <= 0) return;

      const lineWidth = Math.max(1,scale.sx);
      const arm = Math.min(rect.width,22 * scale.sx);
      const isLeft = el.classList.contains("brand-story-final-bracket-left");

      exportCtx.save();
      exportCtx.globalAlpha = opacity;
      exportCtx.strokeStyle = "rgba(230,230,232,.64)";
      exportCtx.lineWidth = lineWidth;
      exportCtx.beginPath();

      if (isLeft) {
        exportCtx.moveTo(rect.x,rect.y);
        exportCtx.lineTo(rect.x,rect.y + rect.height);
        exportCtx.moveTo(rect.x,rect.y);
        exportCtx.lineTo(rect.x + arm,rect.y);
        exportCtx.moveTo(rect.x,rect.y + rect.height);
        exportCtx.lineTo(rect.x + arm,rect.y + rect.height);
      } else {
        const x = rect.x + rect.width;
        exportCtx.moveTo(x,rect.y);
        exportCtx.lineTo(x,rect.y + rect.height);
        exportCtx.moveTo(x,rect.y);
        exportCtx.lineTo(x - arm,rect.y);
        exportCtx.moveTo(x,rect.y + rect.height);
        exportCtx.lineTo(x - arm,rect.y + rect.height);
      }

      exportCtx.stroke();
      exportCtx.restore();
    });
  }

  function renderExportFrame() {
    if (!exportCtx) return;

    const scale = getScale();
    if (!scale) return;

    sceneCtx.clearRect(0,0,CONFIG.WIDTH,CONFIG.HEIGHT);
    drawBackground(scale);
    drawPersonShadow(scale);
    drawPerson(scale);

    exportCtx.save();
    exportCtx.globalAlpha = 1;
    exportCtx.filter = "none";
    exportCtx.drawImage(sceneCanvas,0,0);
    exportCtx.restore();

    /* CSS backdrop-filter 位於人物上方、文字下方 */
    drawFocusBlur(scale);

    /* 文字與括號仍維持在模糊層上方 */
    drawFinalText(scale);
    drawBrackets(scale);
    drawPromoText(scale);
  }

  function renderLoop() {
    renderExportFrame();
    rafId = requestAnimationFrame(renderLoop);
  }

  function getMimeType() {
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];

    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  function downloadRecording(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = CONFIG.FILE_NAME;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    },2000);
  }

  async function startRecording() {
    if (recording) return true;

    if (!HTMLCanvasElement.prototype.captureStream) {
      console.error("目前瀏覽器不支援 canvas.captureStream()。");
      return false;
    }

    if (!window.MediaRecorder) {
      console.error("目前瀏覽器不支援 MediaRecorder。");
      return false;
    }

    ensureCanvases();
    renderExportFrame();

    if (rafId === null) {
      rafId = requestAnimationFrame(renderLoop);
    }

    stream = exportCanvas.captureStream(CONFIG.FPS);
    chunks = [];
    stopRequested = false;

    const mimeType = getMimeType();
    const options = {
      videoBitsPerSecond:CONFIG.VIDEO_BITS_PER_SECOND
    };

    if (mimeType) {
      options.mimeType = mimeType;
    }

    try {
      recorder = new MediaRecorder(stream,options);
    } catch (error) {
      console.error("MediaRecorder 建立失敗：",error);
      stream.getTracks().forEach(track => track.stop());
      stream = null;
      return false;
    }

    recorder.addEventListener("dataavailable",event => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    recorder.addEventListener("stop",() => {
      recording = false;

      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunks,{type});

      if (blob.size > 0) {
        downloadRecording(blob);
      } else {
        console.error("錄影資料為空，未建立影片。");
      }

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      stream = null;
      recorder = null;
      chunks = [];
      console.log("品牌故事影片錄製完成。");
    });

    recorder.start(1000);
    recording = true;
    console.log("開始錄製品牌故事：1920×1080 / 60 FPS / WebM");
    return true;
  }

  function stopRecording() {
    if (stopRequested) return;
    stopRequested = true;

    if (completionTimer) {
      clearTimeout(completionTimer);
      completionTimer = null;
    }

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function stopAfterFinalHold() {
    if (!recording || completionTimer) return;

    completionTimer = window.setTimeout(() => {
      completionTimer = null;
      stopRecording();
    },CONFIG.FINAL_HOLD_MS);
  }

  window.addEventListener("brandstory:visual-complete",stopAfterFinalHold);

  window.brandStoryExporter = {
    CONFIG,
    get autoRecord() {
      return CONFIG.AUTO_RECORD;
    },
    startRecording,
    stopRecording,
    renderExportFrame
  };
})();
