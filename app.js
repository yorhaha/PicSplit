(function () {
  'use strict';

  const uploadScreen = document.getElementById('uploadScreen');
  const uploadArea = document.getElementById('uploadArea');
  const uploadInner = document.querySelector('.upload-inner');
  const fileInput = document.getElementById('fileInput');
  const workspace = document.getElementById('workspace');
  const rowsInput = document.getElementById('rowsInput');
  const colsInput = document.getElementById('colsInput');
  const backBtn = document.getElementById('backBtn');
  const smartBtn = document.getElementById('smartBtn');
  const cropBtn = document.getElementById('cropBtn');
  const undoCropBtn = document.getElementById('undoCropBtn');
  const bgColorInput = document.getElementById('bgColor');
  const autoColorBtn = document.getElementById('autoColorBtn');
  const prefixInput = document.getElementById('prefixInput');
  const formatSelect = document.getElementById('formatSelect');
  const downloadBtn = document.getElementById('downloadBtn');
  const canvasContainer = document.getElementById('canvasContainer');
  const imageCanvas = document.getElementById('imageCanvas');
  const gridOverlay = document.getElementById('gridOverlay');
  const imageInfo = document.getElementById('imageInfo');
  const gridBadge = document.getElementById('gridBadge');
  const cropInputs = document.getElementById('cropInputs');
  const statusBar = document.querySelector('.status-tip');

  const ctx = imageCanvas.getContext('2d');

  let originalImage = null;
  let imgNaturalWidth = 0;
  let imgNaturalHeight = 0;
  let hLines = [];
  let vLines = [];
  let dragState = null;
  let cropHistory = [];  // { img, w, h, hLines, vLines }
  let cropRect = null;   // { x, y, w, h } in relative 0-1 (preview)

  // ===== Upload =====

  uploadInner.addEventListener('click', () => fileInput.click());

  uploadInner.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadInner.classList.add('dragover');
  });

  uploadInner.addEventListener('dragleave', () => {
    uploadInner.classList.remove('dragover');
  });

  uploadInner.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadInner.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
  });

  // Paste from clipboard
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const blob = items[i].getAsFile();
        loadFile(blob);
        break;
      }
    }
  });

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        imgNaturalWidth = img.naturalWidth;
        imgNaturalHeight = img.naturalHeight;
        cropHistory = [];
        cropRect = null;
        updateUndoButton();
        // Auto-derive prefix from filename
        const name = file.name.replace(/\.[^.]+$/, '') || 'image';
        prefixInput.value = name;
        showWorkspace();
        requestAnimationFrame(() => {
          fitCanvas();
          applyGrid(parseInt(rowsInput.value) || 2, parseInt(colsInput.value) || 2);
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function fitCanvas() {
    const area = document.getElementById('canvasArea');
    const maxW = area.clientWidth - 64;
    const maxH = area.clientHeight - 32;
    const ratio = Math.min(maxW / imgNaturalWidth, maxH / imgNaturalHeight, 1);
    const dw = Math.round(imgNaturalWidth * ratio);
    const dh = Math.round(imgNaturalHeight * ratio);
    imageCanvas.width = dw;
    imageCanvas.height = dh;
    ctx.drawImage(originalImage, 0, 0, dw, dh);
    imageInfo.textContent = `${imgNaturalWidth} × ${imgNaturalHeight} px`;
  }

  function showWorkspace() {
    uploadScreen.classList.add('hidden');
    workspace.classList.remove('hidden');
  }

  function showUpload() {
    uploadScreen.classList.remove('hidden');
    workspace.classList.add('hidden');
    originalImage = null;
    fileInput.value = '';
    cropRect = null;
    cropHistory = [];
    updateUndoButton();
    resetCropBtn();
  }

  // ===== Grid =====

  function applyGrid(rows, cols) {
    rows = Math.max(1, Math.min(50, rows));
    cols = Math.max(1, Math.min(50, cols));
    rowsInput.value = rows;
    colsInput.value = cols;

    hLines = [];
    vLines = [];
    for (let i = 1; i < rows; i++) hLines.push(i / rows);
    for (let j = 1; j < cols; j++) vLines.push(j / cols);

    renderGrid();
    gridBadge.textContent = `${rows} × ${cols} = ${rows * cols} 块`;
  }

  function renderGrid() {
    gridOverlay.innerHTML = '';

    hLines.forEach((pos, i) => {
      const el = document.createElement('div');
      el.className = 'grid-line horizontal';
      el.style.top = (pos * 100) + '%';
      el.dataset.type = 'h';
      el.dataset.index = i;
      gridOverlay.appendChild(el);
    });

    vLines.forEach((pos, i) => {
      const el = document.createElement('div');
      el.className = 'grid-line vertical';
      el.style.left = (pos * 100) + '%';
      el.dataset.type = 'v';
      el.dataset.index = i;
      gridOverlay.appendChild(el);
    });

    if (cropRect) {
      const r = cropRect;
      const sides = [
        { side: 'top',    prop: 'top',    val: r.y },
        { side: 'bottom', prop: 'top',    val: r.y + r.h },
        { side: 'left',   prop: 'left',   val: r.x },
        { side: 'right',  prop: 'left',   val: r.x + r.w },
      ];
      sides.forEach(({ side, prop, val }) => {
        const el = document.createElement('div');
        el.className = 'crop-line crop-line-' + side;
        el.style[prop] = (val * 100) + '%';
        gridOverlay.appendChild(el);
      });
    }
  }

  // ===== Input events (auto-apply) =====

  rowsInput.addEventListener('input', () => {
    applyGrid(parseInt(rowsInput.value) || 1, parseInt(colsInput.value) || 1);
  });

  colsInput.addEventListener('input', () => {
    applyGrid(parseInt(rowsInput.value) || 1, parseInt(colsInput.value) || 1);
  });

  // Stepper buttons
  document.querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      const dir = parseInt(btn.dataset.dir);
      const minVal = parseInt(target.min) || 1;
      const maxVal = parseInt(target.max) || 50;
      let val = parseInt(target.value) || minVal;
      val = Math.max(minVal, Math.min(maxVal, val + dir));
      target.value = val;
      target.dispatchEvent(new Event('input'));
    });
  });

  // ===== Drag =====

  gridOverlay.addEventListener('mousedown', (e) => {
    const line = e.target.closest('.grid-line');
    if (!line) return;
    e.preventDefault();
    dragState = { type: line.dataset.type, index: parseInt(line.dataset.index) };
    document.body.style.cursor = dragState.type === 'h' ? 'row-resize' : 'col-resize';
  });

  gridOverlay.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    e.preventDefault();
    const rect = canvasContainer.getBoundingClientRect();
    const pos = dragState.type === 'h'
      ? (e.clientY - rect.top) / rect.height
      : (e.clientX - rect.left) / rect.width;
    clampLinePos(dragState.type, dragState.index, pos);
    renderGrid();
  });

  document.addEventListener('mouseup', () => {
    if (dragState) { dragState = null; document.body.style.cursor = ''; }
  });

  // Touch support
  gridOverlay.addEventListener('touchstart', (e) => {
    const line = e.target.closest('.grid-line');
    if (!line) return;
    e.preventDefault();
    dragState = { type: line.dataset.type, index: parseInt(line.dataset.index) };
  }, { passive: false });

  gridOverlay.addEventListener('touchmove', (e) => {
    if (!dragState) return;
    e.preventDefault();
    const t = e.touches[0];
    const rect = canvasContainer.getBoundingClientRect();
    const pos = dragState.type === 'h'
      ? (t.clientY - rect.top) / rect.height
      : (t.clientX - rect.left) / rect.width;
    clampLinePos(dragState.type, dragState.index, pos);
    renderGrid();
  }, { passive: false });

  gridOverlay.addEventListener('touchend', () => { dragState = null; });

  function clampLinePos(type, idx, pos) {
    pos = Math.max(0.01, Math.min(0.99, pos));
    const arr = type === 'h' ? hLines : vLines;
    const margin = 0.02;
    if (idx > 0 && pos <= arr[idx - 1] + margin) pos = arr[idx - 1] + margin;
    if (idx < arr.length - 1 && pos >= arr[idx + 1] - margin) pos = arr[idx + 1] - margin;
    if (type === 'h') hLines[idx] = pos; else vLines[idx] = pos;
  }

  // ===== Back button =====

  backBtn.addEventListener('click', showUpload);

  // ===== Auto detect background color =====

  autoColorBtn.addEventListener('click', () => {
    if (!originalImage) return;
    const w = imgNaturalWidth, h = imgNaturalHeight;

    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tc = tmp.getContext('2d', { willReadFrequently: true });
    tc.drawImage(originalImage, 0, 0);
    const pixelData = tc.getImageData(0, 0, w, h).data;

    // Sample a strip along each edge to find the most common background color
    const stripW = Math.max(4, Math.floor(Math.min(w, h) / 20));
    const colorCount = {};

    const regions = [
      [0, 0, w, stripW],                          // top
      [0, h - stripW, w, stripW],                 // bottom
      [0, stripW, stripW, Math.max(0, h - stripW * 2)],        // left (remaining)
      [w - stripW, stripW, stripW, Math.max(0, h - stripW * 2)], // right (remaining)
    ];

    for (const [sx, sy, sw, sh] of regions) {
      if (sx < 0 || sy < 0 || sw <= 0 || sh <= 0) continue;
      const d = tc.getImageData(sx, sy, sw, sh).data;
      for (let i = 0; i < sw * sh; i++) {
        const idx = i * 4;
        const a = d[idx + 3];
        if (a < 128) continue; // skip transparent pixels
        const r = Math.min(255, Math.round(d[idx] / 8) * 8);
        const g = Math.min(255, Math.round(d[idx + 1] / 8) * 8);
        const b = Math.min(255, Math.round(d[idx + 2] / 8) * 8);
        const key = `${r},${g},${b}`;
        colorCount[key] = (colorCount[key] || 0) + 1;
      }
    }

    let maxCount = 0, bgColor = '255,255,255';
    for (const [key, count] of Object.entries(colorCount)) {
      if (count > maxCount) { maxCount = count; bgColor = key; }
    }
    const [br, bg, bb] = bgColor.split(',').map(Number);
    bgColorInput.value = rgbToHex(br, bg, bb);
  });

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  // ===== Smart split =====

  smartBtn.addEventListener('click', () => {
    if (!originalImage) return;
    smartBtn.classList.add('btn-loading');
    smartBtn.textContent = '计算中...';

    setTimeout(() => {
      try {
        performSmartSplit();
        statusBar.textContent = '智能分割完成';
      } catch (err) {
        console.error(err);
        statusBar.textContent = '智能分割失败: ' + err.message;
      } finally {
        smartBtn.classList.remove('btn-loading');
        smartBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> 智能分割';
      }
    }, 50);
  });

  function performSmartSplit() {
    const rows = parseInt(rowsInput.value) || 2;
    const cols = parseInt(colsInput.value) || 2;
    const w = imgNaturalWidth;
    const h = imgNaturalHeight;

    // Get pixel data at original resolution
    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    offCtx.drawImage(originalImage, 0, 0);
    const pixels = offCtx.getImageData(0, 0, w, h).data;

    // Parse background color from picker
    const bgRGB = hexToRgb(bgColorInput.value);
    const tolerance = 40;

    // Detect if image has alpha channel
    let hasAlpha = false;
    for (const [cx, cy] of [[0, 0], [w-1, 0], [0, h-1], [w-1, h-1]]) {
      if (pixels[(cy * w + cx) * 4 + 3] < 255) { hasAlpha = true; break; }
    }

    function isBg(x, y) {
      const i = (y * w + x) * 4;
      if (hasAlpha && pixels[i + 3] < 128) return true;
      const dr = pixels[i] - bgRGB[0];
      const dg = pixels[i + 1] - bgRGB[1];
      const db = pixels[i + 2] - bgRGB[2];
      return Math.abs(dr) + Math.abs(dg) + Math.abs(db) < tolerance;
    }

    // For each row: does it have any non-bg pixel? (sampled)
    const xStep = Math.max(1, Math.floor(w / 500));
    const rowHasContent = new Uint8Array(h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x += xStep) {
        if (!isBg(x, y)) { rowHasContent[y] = 1; break; }
      }
    }

    // For each column: does it have any non-bg pixel? (sampled)
    const yStep = Math.max(1, Math.floor(h / 500));
    const colHasContent = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y += yStep) {
        if (!isBg(x, y)) { colHasContent[x] = 1; break; }
      }
    }

    // Build nearest-content arrays: for each position, distance to nearest content row above/below
    function buildNearest(hasContent, length) {
      const nearAbove = new Int32Array(length);  // distance upward to content (-1 if none)
      const nearBelow = new Int32Array(length);   // distance downward to content (-1 if none)
      let last = -99999;
      for (let i = 0; i < length; i++) {
        if (hasContent[i]) last = i;
        nearAbove[i] = last === -99999 ? -1 : i - last;
      }
      last = 99999;
      for (let i = length - 1; i >= 0; i--) {
        if (hasContent[i]) last = i;
        nearBelow[i] = last === 99999 ? -1 : last - i;
      }
      return { nearAbove, nearBelow };
    }

    const { nearAbove: hAbove, nearBelow: hBelow } = buildNearest(rowHasContent, h);
    const { nearAbove: vAbove, nearBelow: vBelow } = buildNearest(colHasContent, w);

    // Score for a candidate cut: min distance to content on either side
    // Higher = better (more centered in the gap)
    function scoreH(y) {
      const a = hAbove[y], b = hBelow[y];
      if (a < 0 || b < 0) return -1; // can't reach content on one side
      return Math.min(a, b);
    }

    function scoreV(x) {
      const a = vAbove[x], b = vBelow[x];
      if (a < 0 || b < 0) return -1;
      return Math.min(a, b);
    }

    // Adjust horizontal lines (top to bottom)
    const uniformH = [];
    for (let i = 1; i < rows; i++) uniformH.push(i / rows);
    const newH = [];

    for (let i = 0; i < uniformH.length; i++) {
      const defaultY = Math.round(uniformH[i] * h);
      const maxShift = Math.round(h / rows * 0.4);
      const prevY = i > 0 ? Math.round(uniformH[i - 1] * h) : -1;
      const nextY = i < uniformH.length - 1 ? Math.round(uniformH[i + 1] * h) : h;
      const midPrev = i > 0 ? Math.round((prevY + defaultY) / 2) : 0;
      const midNext = i < uniformH.length - 1 ? Math.round((defaultY + nextY) / 2) : h - 1;

      const lo = Math.max(midPrev + 1, defaultY - maxShift);
      const hi = Math.min(midNext - 1, defaultY + maxShift);

      let bestY = defaultY;
      let bestScore = -1;

      for (let y = lo; y <= hi; y++) {
        const s = scoreH(y);
        if (s > bestScore) {
          bestScore = s;
          bestY = y;
        }
      }

      newH.push(bestY / h);
    }
    hLines = newH;

    // Adjust vertical lines (left to right)
    const uniformV = [];
    for (let j = 1; j < cols; j++) uniformV.push(j / cols);
    const newV = [];

    for (let j = 0; j < uniformV.length; j++) {
      const defaultX = Math.round(uniformV[j] * w);
      const maxShift = Math.round(w / cols * 0.4);
      const prevX = j > 0 ? Math.round(uniformV[j - 1] * w) : -1;
      const nextX = j < uniformV.length - 1 ? Math.round(uniformV[j + 1] * w) : w;
      const midPrev = j > 0 ? Math.round((prevX + defaultX) / 2) : 0;
      const midNext = j < uniformV.length - 1 ? Math.round((defaultX + nextX) / 2) : w - 1;

      const lo = Math.max(midPrev + 1, defaultX - maxShift);
      const hi = Math.min(midNext - 1, defaultX + maxShift);

      let bestX = defaultX;
      let bestScore = -1;

      for (let x = lo; x <= hi; x++) {
        const s = scoreV(x);
        if (s > bestScore) {
          bestScore = s;
          bestX = x;
        }
      }

      newV.push(bestX / w);
    }
    vLines = newV;

    renderGrid();
  }

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  // ===== Edge crop =====

  const cropMarginInputs = {
    top: document.getElementById('cropMarginTopInput'),
    right: document.getElementById('cropMarginRightInput'),
    bottom: document.getElementById('cropMarginBottomInput'),
    left: document.getElementById('cropMarginLeftInput'),
  };

  cropBtn.addEventListener('click', () => {
    if (!originalImage) return;

    if (cropRect) {
      // Second click: execute crop
      executeCrop();
      return;
    }

    // First click: auto-detect content boundaries and show preview
    cropBtn.classList.add('btn-loading');
    cropBtn.textContent = '计算中...';

    setTimeout(() => {
      try {
        const result = detectContentBounds();
        if (!result) {
          statusBar.textContent = '没有可裁切的背景边缘';
        } else {
          // Fill margin inputs with detected distances from edges
          cropMarginInputs.top.value = result.top;
          cropMarginInputs.right.value = result.right;
          cropMarginInputs.bottom.value = result.bottom;
          cropMarginInputs.left.value = result.left;
          cropInputs.classList.remove('hidden');
          // Show preview based on input values
          updateCropPreview();
          statusBar.textContent = `检测到内容边界，可手动调整裁切值后确认`;
          cropBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> 确认裁切';
          cropBtn.classList.add('btn-crop-confirm');
        }
      } catch (err) {
        console.error(err);
        statusBar.textContent = '裁切失败: ' + err.message;
      } finally {
        cropBtn.classList.remove('btn-loading');
      }
    }, 50);
  });

  function detectContentBounds() {
    const w = imgNaturalWidth;
    const h = imgNaturalHeight;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    offCtx.drawImage(originalImage, 0, 0);
    const pixels = offCtx.getImageData(0, 0, w, h).data;

    const bgRGB = hexToRgb(bgColorInput.value);
    const tolerance = 40;

    let hasAlpha = false;
    for (const [cx, cy] of [[0, 0], [w-1, 0], [0, h-1], [w-1, h-1]]) {
      if (pixels[(cy * w + cx) * 4 + 3] < 255) { hasAlpha = true; break; }
    }

    function isBg(x, y) {
      const i = (y * w + x) * 4;
      if (hasAlpha && pixels[i + 3] < 128) return true;
      const dr = pixels[i] - bgRGB[0];
      const dg = pixels[i + 1] - bgRGB[1];
      const db = pixels[i + 2] - bgRGB[2];
      return Math.abs(dr) + Math.abs(dg) + Math.abs(db) < tolerance;
    }

    const step = Math.max(1, Math.floor(Math.min(w, h) / 800));
    let minY = h, minX = w, maxY = -1, maxX = -1;

    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (!isBg(x, y)) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }

    if (minX > maxX || minY > maxY) return null; // no content found
    if (minX <= 1 && minY <= 1 && maxX >= w - 2 && maxY >= h - 2) return null; // content fills the image

    return {
      top: minY,
      right: w - 1 - maxX,
      bottom: h - 1 - maxY,
      left: minX,
    };
  }

  function updateCropPreview() {
    const w = imgNaturalWidth;
    const h = imgNaturalHeight;
    const top = Math.max(0, parseInt(cropMarginInputs.top.value) || 0);
    const right = Math.max(0, parseInt(cropMarginInputs.right.value) || 0);
    const bottom = Math.max(0, parseInt(cropMarginInputs.bottom.value) || 0);
    const left = Math.max(0, parseInt(cropMarginInputs.left.value) || 0);

    const x = Math.min(left, w - 1);
    const y = Math.min(top, h - 1);
    const r = Math.max(x + 1, w - 1 - Math.min(right, w - 1));
    const b = Math.max(y + 1, h - 1 - Math.min(bottom, h - 1));

    if (x <= 0 && y <= 0 && r >= w - 1 && b >= h - 1) {
      cropRect = null;
      renderGrid();
      return;
    }

    cropRect = {
      x: x / w,
      y: y / h,
      w: (r - x + 1) / w,
      h: (b - y + 1) / h,
    };
    renderGrid();
    statusBar.textContent = `裁切范围: ${Math.round(cropRect.w * w)} × ${Math.round(cropRect.h * h)} px`;
  }

  function executeCrop() {
    if (!cropRect) return;

    const minX = Math.round(cropRect.x * imgNaturalWidth);
    const minY = Math.round(cropRect.y * imgNaturalHeight);
    const cropW = Math.round(cropRect.w * imgNaturalWidth);
    const cropH = Math.round(cropRect.h * imgNaturalHeight);
    const oldW = imgNaturalWidth;
    const oldH = imgNaturalHeight;

    // 保存历史（当前完整状态）
    cropHistory.push({ img: originalImage, w: oldW, h: oldH, hLines: [...hLines], vLines: [...vLines] });
    updateUndoButton();

    // 重新映射分割线到裁切后的坐标空间
    const newHLines = hLines
      .map(p => (p * oldH - minY) / cropH)
      .filter(p => p > 0.01 && p < 0.99);
    const newVLines = vLines
      .map(p => (p * oldW - minX) / cropW)
      .filter(p => p > 0.01 && p < 0.99);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = oldW;
    offCanvas.height = oldH;
    offCanvas.getContext('2d').drawImage(originalImage, 0, 0);

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    cropCanvas.getContext('2d').drawImage(offCanvas, -minX, -minY, cropW, cropH, 0, 0, cropW, cropH);

    const newImg = new Image();
    newImg.onload = () => {
      originalImage = newImg;
      imgNaturalWidth = cropW;
      imgNaturalHeight = cropH;
      cropRect = null;
      hLines = newHLines;
      vLines = newVLines;
      cropInputs.classList.add('hidden');
      fitCanvas();
      renderGrid();
      // 如果裁切后分割线全部消失，刷新行/列显示
      rowsInput.value = (hLines.length + 1) || 1;
      colsInput.value = (vLines.length + 1) || 1;
      updateGridBadge();
      statusBar.textContent = `已裁切至 ${cropW} × ${cropH} px`;
      resetCropBtn();
    };
    newImg.src = cropCanvas.toDataURL();
  }

  // Update preview when any margin changes (if preview is showing)
  Object.values(cropMarginInputs).forEach(input => {
    input.addEventListener('input', () => {
      if (cropRect) updateCropPreview();
    });
  });

  // ===== Undo crop (multi-level) =====

  undoCropBtn.addEventListener('click', () => {
    if (cropHistory.length === 0) return;
    const prev = cropHistory.pop();
    originalImage = prev.img;
    imgNaturalWidth = prev.w;
    imgNaturalHeight = prev.h;
    cropRect = null;
    hLines = prev.hLines;
    vLines = prev.vLines;
    fitCanvas();
    renderGrid();
    rowsInput.value = hLines.length + 1;
    colsInput.value = vLines.length + 1;
    updateGridBadge();
    updateUndoButton();
    resetCropBtn();
    statusBar.textContent = `已恢复至 ${prev.w} × ${prev.h} px（剩余 ${cropHistory.length} 步可撤销）`;
  });

  function updateUndoButton() {
    if (cropHistory.length > 0) {
      undoCropBtn.classList.remove('hidden');
      undoCropBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6.69 3L3 13"/></svg> 撤销 (${cropHistory.length})`;
    } else {
      undoCropBtn.classList.add('hidden');
    }
  }

  function updateGridBadge() {
    const r = hLines.length + 1;
    const c = vLines.length + 1;
    gridBadge.textContent = `${r} × ${c} = ${r * c} 块`;
  }

  function resetCropBtn() {
    cropBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v6H2v2h4v8h8v4h2v-4h6v-6h-6V6h-2zm4 10V8h2v4h-2zm6 0h-2V8h2v4z"/></svg> 边缘裁切';
    cropBtn.classList.remove('btn-crop-confirm');
    cropInputs.classList.add('hidden');
  }

  // ===== Download =====

  downloadBtn.addEventListener('click', async () => {
    if (!originalImage) return;
    downloadBtn.classList.add('btn-loading');
    downloadBtn.textContent = '生成中...';
    await new Promise(r => setTimeout(r, 50));

    try {
      const prefix = prefixInput.value.trim() || 'image';
      const format = formatSelect.value;
      const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
      const ext = format === 'jpg' ? 'jpg' : format;
      const rowEdges = [0, ...hLines, 1];
      const colEdges = [0, ...vLines, 1];
      const rows = rowEdges.length - 1;
      const cols = colEdges.length - 1;

      const offscreen = document.createElement('canvas');
      offscreen.width = imgNaturalWidth;
      offscreen.height = imgNaturalHeight;
      const offCtx = offscreen.getContext('2d');
      offCtx.drawImage(originalImage, 0, 0, imgNaturalWidth, imgNaturalHeight);

      const zip = new JSZip();

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const x = Math.round(colEdges[j] * imgNaturalWidth);
          const y = Math.round(rowEdges[i] * imgNaturalHeight);
          const w = Math.round((colEdges[j + 1] - colEdges[j]) * imgNaturalWidth);
          const h = Math.round((rowEdges[i + 1] - rowEdges[i]) * imgNaturalHeight);

          const slice = document.createElement('canvas');
          slice.width = w;
          slice.height = h;
          slice.getContext('2d').drawImage(offscreen, x, y, w, h, 0, 0, w, h);

          const blob = await new Promise(r => slice.toBlob(r, mimeType, 0.95));
          zip.file(`${prefix}_r${i + 1}_c${j + 1}.${ext}`, blob);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prefix}_${rows}x${cols}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      statusBar.textContent = `已导出 ${rows * cols} 张图片`;
    } catch (err) {
      console.error(err);
      statusBar.textContent = '导出失败: ' + err.message;
    } finally {
      downloadBtn.classList.remove('btn-loading');
      downloadBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> 下载 ZIP';
    }
  });

  // ===== Resize =====

  window.addEventListener('resize', () => {
    if (!originalImage) return;
    const savedH = [...hLines];
    const savedV = [...vLines];
    fitCanvas();
    hLines = savedH;
    vLines = savedV;
    renderGrid();
  });
})();
