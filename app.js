// === Setup ===
const fileInput = document.getElementById("fileInput");
const pdfCanvas = document.getElementById("pdfCanvas");
const overlay = document.getElementById("overlay");
const pdfCtx = pdfCanvas.getContext("2d");
const ovCtx = overlay.getContext("2d");
const statusEl = document.getElementById("status"); // spinner/status div

let pdfDoc = null;
let currentPage = 1;
let pageCount = 0;
let pageImage = null;

const cam = { zoom: 1, offsetX: 0, offsetY: 0 };
let state = { tool: null, ops: {}, drawing: null, symbolScale: 2, selectedId: null };

const SYMBOLS = {
  pull: "M3 5h18v14H3z M6 8h12v2H6z M10 11h4v5h-4z",
  sd: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M7 12h10 M8 9.5h8 M8 14.5h8",
  hd: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 6v12 M6 12h12 M8.2 8.2l7.6 7.6 M15.8 8.2l-7.6 7.6",
  av: "M4 4h16v16H4z M8 8h8v8H8z"
};

// === Helpers ===
function makeId() {
  return Math.random().toString(36).substr(2, 9);
}
const statusTextEl = document.getElementById("statusText");

function showStatus(msg) {
  if (!statusEl) return;
  statusTextEl.textContent = msg;
  statusEl.style.display = msg ? "flex" : "none";
}

// === Project Save/Load ===
let pdfArrayBuffer = null;
let projectName = "FA-Markup";

function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Save project
document.getElementById("saveProject").addEventListener("click", () => {
  if (!pdfArrayBuffer) {
    alert("No PDF loaded to save!");
    return;
  }

  // ask for name if not already set
  const inputName = prompt("Enter project name:", projectName);
  if (inputName && inputName.trim()) {
    projectName = inputName.trim();
  }

  showStatus("Saving project…");

  const data = {
    projectName,
    cam,
    currentPage,
    ops: state.ops,
    symbolScale: state.symbolScale,
    pdf: arrayBufferToBase64(pdfArrayBuffer)
  };

  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${projectName}.famarkup`;  // ✅ custom extension, no .json
  a.click();

  showStatus(""); // hide spinner
});


// Load project
document.getElementById("loadProject").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".famarkup";

  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    showStatus("Loading project…");

    const text = await file.text();
    const data = JSON.parse(text);

    projectName = data.projectName || "FA-Markup";
    Object.assign(cam, data.cam || {});
    state.ops = data.ops || {};
    state.symbolScale = data.symbolScale || 2;
    currentPage = data.currentPage || 1;

    if (data.pdf) {
      // ✅ Safe permanent copy for saving
      pdfArrayBuffer = base64ToArrayBuffer(data.pdf).slice(0);

      // ✅ PDF.js gets its own clone
      pdfDoc = await pdfjsLib.getDocument({ data: pdfArrayBuffer.slice(0) }).promise;

      pageCount = pdfDoc.numPages;
      await showPage();
    }

    showStatus("");
  };
  input.click();
});


// === Load PDF ===
fileInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  showStatus("Loading PDF…");

  // read into ArrayBuffer
  const buf = await file.arrayBuffer();

  // ✅ Safe copy for save/load
  pdfArrayBuffer = buf.slice(0);

  // ✅ PDF.js gets its own clone
  pdfDoc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;

  pageCount = pdfDoc.numPages;
  currentPage = 1;
  await showPage();
  showStatus("");
});



async function showPage() {
  const page = await pdfDoc.getPage(currentPage);
  const viewport = page.getViewport({ scale: 2 }); // 2x DPI for clarity
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  pageImage = canvas;

  pdfCanvas.width = canvas.width;
  pdfCanvas.height = canvas.height;
  overlay.width = canvas.width;
  overlay.height = canvas.height;

  redraw();
  document.getElementById("pageInfo").textContent = `Page ${currentPage}/${pageCount}`;

  showStatus("");

}

// === Symbol scale control ===
document.getElementById("symSize")?.addEventListener("input", e => {
  state.symbolScale = parseFloat(e.target.value);
});

// === Redraw ===
function redraw() {
  // draw PDF
  pdfCtx.setTransform(1, 0, 0, 1, 0, 0);
  pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
  pdfCtx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.offsetX, cam.offsetY);
  pdfCtx.drawImage(pageImage, 0, 0);

  // draw overlay
  ovCtx.setTransform(1, 0, 0, 1, 0, 0);
  ovCtx.clearRect(0, 0, overlay.width, overlay.height);
  ovCtx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.offsetX, cam.offsetY);

  const ops = state.ops[currentPage] || [];
  ops.forEach(op => drawOp(op));
  if (state.drawing) drawOp(state.drawing, true);
}

function drawOp(op, preview = false) {
  ovCtx.save();
  ovCtx.lineWidth = 2;
  ovCtx.strokeStyle = preview ? "#888" : "#000";
  ovCtx.fillStyle = "#000";

  const isSelected = op.id === state.selectedId;
  if (isSelected) {
    ovCtx.strokeStyle = "red";
    ovCtx.lineWidth = 3;
  }

  if (op.type === "symbol") {
    ovCtx.translate(op.x, op.y);
    ovCtx.scale(op.scale || 1, op.scale || 1);
    const path = new Path2D(SYMBOLS[op.kind]);
    ovCtx.stroke(path);
    if (isSelected) {
      const boxSize = 30 * (op.scale || 1);
      ovCtx.strokeStyle = "red";
      ovCtx.lineWidth = 1;
      ovCtx.strokeRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
    }
  }

  if (op.type === "line" || op.type === "arrow") {
    ovCtx.beginPath();
    ovCtx.moveTo(op.x1, op.y1);
    ovCtx.lineTo(op.x2, op.y2);
    ovCtx.stroke();
    if (op.type === "arrow") drawArrowHead(op.x1, op.y1, op.x2, op.y2);
  }

  if (op.type === "cloud") {
    if (op.pts.length > 1) {
      ovCtx.beginPath();
      ovCtx.moveTo(op.pts[0][0], op.pts[0][1]);
      for (let i = 1; i < op.pts.length; i++) {
        const [x0, y0] = op.pts[i - 1], [x1, y1] = op.pts[i];
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        ovCtx.quadraticCurveTo(mx + nx * 4, my + ny * 4, x1, y1);
      }
      ovCtx.stroke();
    }
  }

  if (op.type === "text") {
    ovCtx.font = `${op.size || 16}px sans-serif`;
    ovCtx.fillText(op.content, op.x, op.y);
    if (isSelected) {
      const w = ovCtx.measureText(op.content).width;
      ovCtx.strokeStyle = "red";
      ovCtx.strokeRect(op.x, op.y - (op.size || 16), w, (op.size || 16));
    }
  }

  ovCtx.restore();
}

function drawArrowHead(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, w = 6, h = 10;
  ovCtx.beginPath();
  ovCtx.moveTo(x1, y1);
  ovCtx.lineTo(x1 - ux * h - uy * w, y1 - uy * h + ux * w);
  ovCtx.lineTo(x1 - ux * h + uy * w, y1 - uy * h - ux * w);
  ovCtx.closePath();
  ovCtx.fill();
}

// === Tool select ===
document.querySelectorAll(".tool").forEach(btn => {
  btn.addEventListener("click", () => {
    if (state.tool === btn.dataset.tool) {
      state.tool = null;
      btn.classList.remove("active");
    } else {
      state.tool = btn.dataset.tool;
      document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    }
  });
});

// === Place symbol / Draw / Pan / Move / Text ===
let dragging = false, lastX = 0, lastY = 0;
let movingOp = null;

overlay.addEventListener("mousedown", e => {
  const rect = overlay.getBoundingClientRect();
  const x = (e.clientX - rect.left - cam.offsetX) / cam.zoom;
  const y = (e.clientY - rect.top - cam.offsetY) / cam.zoom;
  const ops = state.ops[currentPage] || [];

  if (!state.tool) {
    const hit = ops.find(op => {
      if (op.type === "symbol") {
        return Math.abs(op.x - x) < 20 && Math.abs(op.y - y) < 20;
      }
      if (op.type === "text") {
        const w = ovCtx.measureText(op.content).width;
        const h = op.size || 16;
        return (x >= op.x && x <= op.x + w && y <= op.y && y >= op.y - h);
      }
      return false;
    });
    if (hit) {
      state.selectedId = hit.id;
      movingOp = hit;
      lastX = x; lastY = y;
      redraw();
      return;
    } else {
      state.selectedId = null;
      movingOp = null;
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      redraw();
      return;
    }
  }

  if (state.tool === "line" || state.tool === "arrow") {
    state.drawing = { id: makeId(), type: state.tool, x1: x, y1: y, x2: x, y2: y };
  } else if (state.tool === "cloud") {
    state.drawing = { id: makeId(), type: "cloud", pts: [[x, y]] };
  } else if (state.tool === "text") {
    const content = prompt("Enter label text:") || "";
    if (content.trim()) {
      if (!state.ops[currentPage]) state.ops[currentPage] = [];
      state.ops[currentPage].push({ id: makeId(), type: "text", x, y, content, size: 16 });
      redraw();
    }
  } else if (state.tool) {
    if (!state.ops[currentPage]) state.ops[currentPage] = [];
    state.ops[currentPage].push({ id: makeId(), type: "symbol", kind: state.tool, x, y, scale: state.symbolScale });
    redraw();
  }
});

overlay.addEventListener("mousemove", e => {
  const rect = overlay.getBoundingClientRect();
  const x = (e.clientX - rect.left - cam.offsetX) / cam.zoom;
  const y = (e.clientY - rect.top - cam.offsetY) / cam.zoom;

  if (movingOp) {
    const dx = x - lastX, dy = y - lastY;
    movingOp.x += dx; movingOp.y += dy;
    lastX = x; lastY = y;
    redraw();
    return;
  }

  if (state.drawing) {
    if (state.drawing.type === "line" || state.drawing.type === "arrow") {
      state.drawing.x2 = x; state.drawing.y2 = y;
    } else if (state.drawing.type === "cloud") {
      state.drawing.pts.push([x, y]);
    }
    redraw();
  } else if (dragging) {
    cam.offsetX += e.clientX - lastX;
    cam.offsetY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    redraw();
  }
});

overlay.addEventListener("mouseup", () => {
  if (state.drawing) {
    if (!state.ops[currentPage]) state.ops[currentPage] = [];
    state.ops[currentPage].push(state.drawing);
    state.drawing = null;
  }
  dragging = false;
  movingOp = null;
  redraw();
});

overlay.addEventListener("mouseleave", () => {
  dragging = false;
  movingOp = null;
  state.drawing = null;
});

// === Undo & Clear ===
document.getElementById("undo").addEventListener("click", () => {
  if (state.ops[currentPage]?.length) {
    state.ops[currentPage].pop();
    redraw();
  }
});
document.getElementById("clearPage").addEventListener("click", () => {
  state.ops[currentPage] = [];
  state.selectedId = null;
  redraw();
});

// === Double-click to re-edit text (prompt based) ===
overlay.addEventListener("dblclick", e => {
  const rect = overlay.getBoundingClientRect();
  const x = (e.clientX - rect.left - cam.offsetX) / cam.zoom;
  const y = (e.clientY - rect.top - cam.offsetY) / cam.zoom;
  const ops = state.ops[currentPage] || [];

  const hit = ops.find(op =>
    op.type === "text" &&
    x >= op.x - 2 &&
    x <= op.x + ovCtx.measureText(op.content).width + 2 &&
    y <= op.y &&
    y >= op.y - (op.size || 16)
  );

  if (hit) {
    const newText = prompt("Edit text:", hit.content);
    if (newText !== null && newText.trim() !== "") {
      hit.content = newText.trim();
      redraw();
    }
  }
});


// === Delete selected op ===
document.getElementById("delete").addEventListener("click", () => {
  if (!state.selectedId) return;
  const ops = state.ops[currentPage] || [];
  const idx = ops.findIndex(op => op.id === state.selectedId);
  if (idx >= 0) {
    ops.splice(idx, 1);
    state.selectedId = null;
    redraw();
  }
});


// === Zoom + Nav ===
function zoomAt(factor, cx, cy) {
  const prevZoom = cam.zoom;
  cam.zoom *= factor;
  cam.offsetX = cx - (cx - cam.offsetX) * (cam.zoom / prevZoom);
  cam.offsetY = cy - (cy - cam.offsetY) * (cam.zoom / prevZoom);
  redraw();
}
document.getElementById("zoomIn").addEventListener("click", () => zoomAt(1.2, overlay.width / 2, overlay.height / 2));
document.getElementById("zoomOut").addEventListener("click", () => zoomAt(1 / 1.2, overlay.width / 2, overlay.height / 2));
document.getElementById("resetView").addEventListener("click", () => { cam.zoom = 1; cam.offsetX = 0; cam.offsetY = 0; redraw(); });
document.getElementById("prevPage").addEventListener("click", async () => { if (currentPage > 1) { currentPage--; await showPage(); } });
document.getElementById("nextPage").addEventListener("click", async () => { if (currentPage < pageCount) { currentPage++; await showPage(); } });

// === Export ===
document.getElementById("exportPdf").addEventListener("click", async () => {
  showStatus("Exporting PDF…");

  const pdf = await PDFLib.PDFDocument.create();

  // open a fresh instance of pdf.js (so we don't fight with viewer)
  const tempDoc = await pdfjsLib.getDocument({ data: pdfArrayBuffer.slice(0) }).promise;

  for (let p = 1; p <= pageCount; p++) {
    const page = await tempDoc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });

    const c = document.createElement("canvas");
    c.width = viewport.width;
    c.height = viewport.height;

    await page.render({ canvasContext: c.getContext("2d"), viewport }).promise;

    // draw our markup
    const ctx = c.getContext("2d");
    (state.ops[p] || []).forEach(op => drawOpToCtx(ctx, op));

    // embed page image into export PDF
    const img = await pdf.embedPng(c.toDataURL("image/png"));
    const pdfPage = pdf.addPage([c.width, c.height]);
    pdfPage.drawImage(img, { x: 0, y: 0, width: c.width, height: c.height });
  }

  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${projectName}.pdf`;
  a.click();

  showStatus("");
});


function drawOpToCtx(ctx, op) {
  ctx.save();
  ctx.strokeStyle = "#000"; ctx.fillStyle = "#000"; ctx.lineWidth = 2;

  if (op.type === "symbol") {
    ctx.translate(op.x, op.y);
    ctx.scale(op.scale || 1, op.scale || 1);
    const path = new Path2D(SYMBOLS[op.kind]);
    ctx.stroke(path);
  }
  if (op.type === "line" || op.type === "arrow") {
    ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
    if (op.type === "arrow") {
      const dx = op.x2 - op.x1, dy = op.y2 - op.y1, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, w = 6, h = 10;
      ctx.beginPath();
      ctx.moveTo(op.x2, op.y2);
      ctx.lineTo(op.x2 - ux * h - uy * w, op.y2 - uy * h + ux * w);
      ctx.lineTo(op.x2 - ux * h + uy * w, op.y2 - uy * h - ux * w);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (op.type === "cloud" && op.pts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(op.pts[0][0], op.pts[0][1]);
    for (let i = 1; i < op.pts.length; i++) {
      const [x0, y0] = op.pts[i - 1], [x1, y1] = op.pts[i];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      ctx.quadraticCurveTo(mx + nx * 4, my + ny * 4, x1, y1);
    }
    ctx.stroke();
  }
  if (op.type === "text") {
    ctx.font = `${op.size || 16}px sans-serif`;
    ctx.fillText(op.content, op.x, op.y);
  }

  ctx.restore();
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(() => console.log("Service Worker registered"))
    .catch(err => console.error("SW registration failed:", err));
}
