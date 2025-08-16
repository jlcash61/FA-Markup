// ===== Fire Alarm Markup Tool =====

// DOM helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const setStatus = (msg) => { $("#status").textContent = msg; console.log(msg); };

// State
const state = {
  pdf: null,
  pdfBytes: null,
  page: 1,
  scale: 1,
  tool: null,
  symScale: 1,
  rotation: 0,
  overlayOps: {},  // { pageNum: [ops] }
  drawing: null
};

// Fire alarm symbol paths (24x24 viewBox)
const SYMBOLS = {
  pull: "M3 5h18v14H3z M6 8h12v2H6z M10 11h4v5h-4z",
  sd:   "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M7 12h10 M8 9.5h8 M8 14.5h8",
  hd:   "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 6v12 M6 12h12 M8.2 8.2l7.6 7.6 M15.8 8.2l-7.6 7.6",
  mm:   "M4 6h16v12H4z M7 9h10v6H7z M9 10.5h6M9 13.5h6"
};

let viewport = null;

// PDF + overlay canvases
const pdfCanvas = $("#pdfCanvas");
const overlay = $("#overlay");
const pdfCtx = pdfCanvas.getContext("2d");
const ovCtx = overlay.getContext("2d");

// Page ops array
function pageOps(p) {
  if (!state.overlayOps[p]) state.overlayOps[p] = [];
  return state.overlayOps[p];
}

// Coordinate transforms
function clientToPdf(x, y) {
  return [x / state.scale, viewport.height - (y / state.scale)];
}
function pdfToClient(px, py) {
  return [px * state.scale, (viewport.height - py) * state.scale];
}

// ===== PDF loading =====
$("#fileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  state.pdfBytes = buf;
  state.pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  state.page = 1;
  state.overlayOps = {};
  await renderFitWidth();
});

// ===== Tool selection =====
$$(".tool").forEach(btn => btn.addEventListener("click", () => {
  state.tool = btn.dataset.tool;
  $$(".tool").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}));
$("#scale").addEventListener("input", (e) => state.symScale = parseFloat(e.target.value));
$("#rotL").addEventListener("click", () => rotate(-90));
$("#rotR").addEventListener("click", () => rotate(90));

function rotate(deg) {
  state.rotation = ((state.rotation + deg) % 360 + 360) % 360;
}

// ===== Navigation =====
$("#prevPage").addEventListener("click", async () => {
  if (!state.pdf) return;
  state.page = Math.max(1, state.page - 1);
  await renderFitWidth();
});
$("#nextPage").addEventListener("click", async () => {
  if (!state.pdf) return;
  state.page = Math.min(state.pdf.numPages, state.page + 1);
  await renderFitWidth();
});
$("#fitW").addEventListener("click", renderFitWidth);
$("#fitP").addEventListener("click", renderFitPage);

// ===== Undo/Clear =====
$("#undo").addEventListener("click", () => { pageOps(state.page).pop(); redrawOverlay(); });
$("#clearPg").addEventListener("click", () => { state.overlayOps[state.page] = []; redrawOverlay(); });

// ===== Overlay drawing =====
overlay.addEventListener("mousedown", (e) => {
  if (!state.tool) return;
  const rect = overlay.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;

  if (["pull","sd","hd","mm"].includes(state.tool)) {
    placeSymbol(x, y);
    return;
  }
  if (state.tool === "text") {
    const text = prompt("Enter label text:");
    if (text) placeText(x, y, text);
    return;
  }
  if (state.tool === "arrow" || state.tool === "line") {
    state.drawing = { type: state.tool, from: [x,y], to: [x,y] };
  }
  if (state.tool === "cloud") {
    state.drawing = { type: "cloud", pts: [[x,y]] };
  }
});

overlay.addEventListener("mousemove", (e) => {
  if (!state.drawing) return;
  const rect = overlay.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;

  if (state.drawing.type === "arrow" || state.drawing.type === "line") {
    state.drawing.to = [x,y];
  }
  if (state.drawing.type === "cloud") {
    state.drawing.pts.push([x,y]);
  }
  redrawOverlay();
});

overlay.addEventListener("mouseup", () => {
  if (!state.drawing) return;
  pageOps(state.page).push({ page: state.page, ...state.drawing });
  state.drawing = null;
  redrawOverlay();
});

// ===== Place ops =====
function placeSymbol(cx, cy) {
  const at = clientToPdf(cx, cy);
  pageOps(state.page).push({
    type: "symbol",
    kind: state.tool,
    at,
    scale: state.symScale,
    rot: state.rotation
  });
  redrawOverlay();
}
function placeText(cx, cy, text) {
  const at = clientToPdf(cx, cy);
  pageOps(state.page).push({
    type: "text",
    text,
    at
  });
  redrawOverlay();
}

// ===== Render PDF page =====
async function renderFitWidth() {
  if (!state.pdf) return;
  const page = await state.pdf.getPage(state.page);
  viewport = page.getViewport({ scale: 1 });
  const targetW = Math.min($("#canvasWrap").clientWidth || 1000, 1200);
  state.scale = targetW / viewport.width;
  await drawPage(page, state.scale);
}
async function renderFitPage() {
  if (!state.pdf) return;
  const page = await state.pdf.getPage(state.page);
  viewport = page.getViewport({ scale: 1 });
  const maxW = Math.min($("#canvasWrap").clientWidth || 1000, 1200);
  const maxH = (window.innerHeight - 32) * 0.9;
  const sW = maxW / viewport.width;
  const sH = maxH / viewport.height;
  state.scale = Math.min(sW, sH);
  await drawPage(page, state.scale);
}
async function drawPage(page, scale) {
  pdfCanvas.width = Math.floor(viewport.width * scale);
  pdfCanvas.height = Math.floor(viewport.height * scale);
  overlay.width = pdfCanvas.width;
  overlay.height = pdfCanvas.height;
  await page.render({ canvasContext: pdfCtx, viewport: page.getViewport({ scale }) }).promise;
  $("#pageInfo").textContent = `Page ${state.page} / ${state.pdf.numPages}`;
  redrawOverlay();
}

// ===== Overlay redraw =====
function redrawOverlay() {
  ovCtx.clearRect(0,0,overlay.width,overlay.height);
  const ops = pageOps(state.page);
  for (const op of ops) drawOp(op);
  if (state.drawing) drawOp(state.drawing, true);
}
function drawOp(op, preview=false) {
  ovCtx.save();
  ovCtx.lineWidth = 2;
  ovCtx.strokeStyle = preview ? "#999" : "#111";
  ovCtx.fillStyle = "#111";

  if (op.type === "symbol") {
    const [cx, cy] = pdfToClient(op.at[0], op.at[1]);
    ovCtx.translate(cx, cy);
    ovCtx.rotate((op.rot || 0) * Math.PI/180);
    const path = new Path2D(SYMBOLS[op.kind]);
    const scale = (op.scale || 1) * (24/24);
    ovCtx.scale(scale, scale);
    ovCtx.stroke(path);
  }
  else if (op.type === "text") {
    const [cx, cy] = pdfToClient(op.at[0], op.at[1]);
    ovCtx.font = "14px sans-serif";
    ovCtx.fillText(op.text, cx, cy);
  }
  else if (op.type === "line" || op.type === "arrow") {
    const [x0,y0] = op.from, [x1,y1] = op.to;
    ovCtx.beginPath();
    ovCtx.moveTo(x0,y0);
    ovCtx.lineTo(x1,y1);
    ovCtx.stroke();
    if (op.type === "arrow") drawArrowHead(x0,y0,x1,y1);
  }
  else if (op.type === "cloud") {
    const pts = op.pts;
    if (pts.length < 2) return;
    ovCtx.beginPath();
    ovCtx.moveTo(pts[0][0], pts[0][1]);
    for (let i=1;i<pts.length;i++) {
      const [x0,y0] = pts[i-1], [x1,y1] = pts[i];
      const dx=x1-x0, dy=y1-y0, len=Math.hypot(dx,dy)||1;
      const nx=-dy/len, ny=dx/len;
      const mx=(x0+x1)/2, my=(y0+y1)/2;
      ovCtx.quadraticCurveTo(mx+nx*4, my+ny*4, x1,y1);
    }
    ovCtx.closePath();
    ovCtx.stroke();
  }
  ovCtx.restore();
}
function drawArrowHead(x0,y0,x1,y1) {
  const dx=x1-x0, dy=y1-y0, len=Math.hypot(dx,dy)||1;
  const ux=dx/len, uy=dy/len, w=6, h=10;
  ovCtx.beginPath();
  ovCtx.moveTo(x1,y1);
  ovCtx.lineTo(x1-ux*h - uy*w, y1-uy*h + ux*w);
  ovCtx.lineTo(x1-ux*h + uy*w, y1-uy*h - ux*w);
  ovCtx.closePath();
  ovCtx.fill();
}

// ===== Export to PDF =====
$("#exportPdf").addEventListener("click", exportFlattened);

async function exportFlattened() {
  if (!state.pdfBytes || !state.pdf) return;
  const pdfDoc = await PDFLib.PDFDocument.load(state.pdfBytes);
  const rgb = PDFLib.rgb;
  const helv = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

  const pagesWithOps = Object.keys(state.overlayOps).map(n=>parseInt(n,10));
  for (const pNum of pagesWithOps) {
    const page = pdfDoc.getPage(pNum-1);
    const ops = state.overlayOps[pNum] || [];
    for (const op of ops) {
      if (op.type === "symbol") {
        const s = 24 * (op.scale || 1);
        const tx = op.at[0] - s/2, ty = op.at[1] - s/2;
        const a = Math.cos(rad(op.rot||0)), b = Math.sin(rad(op.rot||0));
        const transform = [ a, b, -b, a, tx, ty ];
        page.drawSvgPath(SYMBOLS[op.kind], { borderWidth: 1, color: rgb(0,0,0), transform });
      }
      if (op.type === "text") {
        page.drawText(op.text, { x: op.at[0], y: op.at[1], size: 12, font: helv, color: rgb(0,0,0) });
      }
      if (op.type === "line" || op.type === "arrow") {
        page.drawLine({ start: {x:op.from[0]/state.scale, y:viewport.height - op.from[1]/state.scale},
                        end:   {x:op.to[0]/state.scale,   y:viewport.height - op.to[1]/state.scale},
                        thickness: 1.2, color: rgb(0,0,0) });
        if (op.type === "arrow") {
          const start = {x:op.from[0]/state.scale, y:viewport.height - op.from[1]/state.scale};
          const end   = {x:op.to[0]/state.scale,   y:viewport.height - op.to[1]/state.scale};
          drawArrowHeadPdf(page, start, end);
        }
      }
      if (op.type === "cloud") {
        const pts = op.pts.map(([cx,cy]) => ({x:cx/state.scale, y:viewport.height - cy/state.scale}));
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i=1;i<pts.length;i++) {
          const x0=pts[i-1].x, y0=pts[i-1].y, x1=pts[i].x, y1=pts[i].y;
          const dx=x1-x0, dy=y1-y0, len=Math.hypot(dx,dy)||1;
          const nx=-dy/len, ny=dx/len;
          const mx=(x0+x1)/2, my=(y0+y1)/2;
          d += ` Q ${mx + nx*4} ${my + ny*4}, ${x1} ${y1}`;
        }
        d += " Z";
        page.drawSvgPath(d, { borderWidth: 1.2, color: rgb(0,0,0) });
      }
    }
  }

  const bytes = await pdfDoc.save();
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), "FA-annotated.pdf");
}

function rad(d) { return (d||0) * Math.PI/180; }
function drawArrowHeadPdf(page, start, end) {
  const dx=end.x-start.x, dy=end.y-start.y, len=Math.hypot(dx,dy)||1;
  const ux=dx/len, uy=dy/len, w=4, h=8;
  const a = [ end.x, end.y ];
  const b = [ end.x-ux*h - uy*w, end.y-uy*h + ux*w ];
  const c = [ end.x-ux*h + uy*w, end.y-uy*h - ux*w ];
  page.drawPolygon([a,b,c], { color: PDFLib.rgb(0,0,0), borderWidth: 0 });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Default tool
$$(".tool")[1].click(); // Default to SD
