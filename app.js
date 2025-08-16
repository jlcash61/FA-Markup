// ====== FA Markup App with Zoom & Pan ======

// Helpers
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const setStatus = (msg) => {
  const el = $("#status");
  if (el) el.innerHTML = msg;
  console.log("[FA]", msg.replace(/<[^>]+>/g, ""));
};

/* -------------------- State -------------------- */
const state = {
  pdf: null,
  pdfBytes: null,
  page: 1,
  baseScale: null,
  viewScale: 1,    // user zoom level
  panX: 0,
  panY: 0,
  rotation: 0,
  tool: null,
  symScale: 1,
  overlayOps: {},   // { pageNumber: [ ops... ] }
  drawing: null,
};

const SYMBOLS = {
  pull: { size: 24, path: "M3 5h18v14H3z M6 8h12v2H6z M10 11h4v5h-4z" },
  sd:   { size: 24, path: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M7 12h10 M8 9.5h8 M8 14.5h8" },
  hd:   { size: 24, path: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 6v12 M6 12h12 M8.2 8.2l7.6 7.6 M15.8 8.2l-7.6 7.6" },
  mm:   { size: 24, path: "M4 6h16v12H4z M7 9h10v6H7z M9 10.5h6M9 13.5h6" },
};

function pageOps(p) {
  if (!state.overlayOps[p]) state.overlayOps[p] = [];
  return state.overlayOps[p];
}

/* -------------------- Canvas setup -------------------- */
const pdfCanvas = $("#pdfCanvas");
const overlay = $("#overlay");
const pdfCtx = pdfCanvas.getContext("2d");
const ovCtx = overlay.getContext("2d");
let viewport = null;

// Convert client → PDF coords
function clientToPdf(x, y) {
  const px = (x - state.panX) / (state.baseScale * state.viewScale);
  const py = viewport.height - (y - state.panY) / (state.baseScale * state.viewScale);
  return [px, py];
}

// Convert PDF → client coords
function pdfToClient(px, py) {
  const x = px * state.baseScale * state.viewScale + state.panX;
  const y = (viewport.height - py) * state.baseScale * state.viewScale + state.panY;
  return [x, y];
}

/* -------------------- UI wiring -------------------- */
$("#fileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  state.pdfBytes = buf;
  state.pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  state.page = 1;
  state.viewScale = 1;
  state.panX = 0;
  state.panY = 0;
  state.baseScale = null;
  await renderPage();
});

$("#prevPage").addEventListener("click", async () => {
  if (!state.pdf) return;
  state.page = Math.max(1, state.page - 1);
  await renderPage();
});
$("#nextPage").addEventListener("click", async () => {
  if (!state.pdf) return;
  state.page = Math.min(state.pdf.numPages, state.page + 1);
  await renderPage();
});

$("#fitW").addEventListener("click", () => { state.viewScale=1; state.panX=0; state.panY=0; fitWidth(); });
$("#fitP").addEventListener("click", () => { state.viewScale=1; state.panX=0; state.panY=0; fitPage(); });

$("#scale").addEventListener("input", (e) => state.symScale = parseFloat(e.target.value));
$("#rotL").addEventListener("click", () => rotate(-90));
$("#rotR").addEventListener("click", () => rotate(90));

$$(".tool").forEach(btn => btn.addEventListener("click", () => {
  state.tool = btn.dataset.tool;
  $$(".tool").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}));

$("#undo").addEventListener("click", () => {
  pageOps(state.page).pop();
  redrawOverlay();
});
$("#clearPg").addEventListener("click", () => {
  state.overlayOps[state.page] = [];
  redrawOverlay();
});
$("#exportPdf").addEventListener("click", exportFlattened);

// Hotkeys
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const k = e.key.toLowerCase();
  if (k === "1") selectTool("pull");
  else if (k === "2") selectTool("sd");
  else if (k === "3") selectTool("hd");
  else if (k === "4") selectTool("mm");
  else if (k === "a") selectTool("arrow");
  else if (k === "l") selectTool("line");
  else if (k === "c") selectTool("cloud");
  else if (k === "t") selectTool("tag");
  else if (k === "r") rotate(90);
  else if (k === "+") bumpScale(0.25);
  else if (k === "-") bumpScale(-0.25);
});

function selectTool(t) {
  const target = document.querySelector(`[data-tool="${t}"]`);
  if (target) target.click();
}
function rotate(deg) {
  state.rotation = ((state.rotation + deg) % 360 + 360) % 360;
}
function bumpScale(d) {
  state.symScale = Math.max(0.5, Math.min(2, state.symScale + d));
  $("#scale").value = String(state.symScale);
}

/* -------------------- Zoom & Pan -------------------- */
function zoomAt(factor, cx, cy) {
  cx = cx ?? pdfCanvas.width/2;
  cy = cy ?? pdfCanvas.height/2;
  const [px, py] = clientToPdf(cx, cy);
  state.viewScale *= factor;
  const [nx, ny] = pdfToClient(px, py);
  state.panX += cx - nx;
  state.panY += cy - ny;
  renderPage();
}

$("#zoomIn")?.addEventListener("click", () => zoomAt(1.25));
$("#zoomOut")?.addEventListener("click", () => zoomAt(0.8));

let panning = false, lastX=0,lastY=0, spaceDown=false;
window.addEventListener("keydown", e => { if (e.code==="Space") spaceDown=true; });
window.addEventListener("keyup", e => { if (e.code==="Space") spaceDown=false; });

overlay.addEventListener("mousedown", (e) => {
  if (e.button===1 || spaceDown) {
    panning=true;
    lastX=e.clientX; lastY=e.clientY;
    e.preventDefault();
  }
});
window.addEventListener("mousemove", (e) => {
  if (panning) {
    const dx = e.clientX-lastX;
    const dy = e.clientY-lastY;
    lastX=e.clientX; lastY=e.clientY;
    state.panX += dx;
    state.panY += dy;
    renderPage();
  }
});
window.addEventListener("mouseup", ()=>panning=false);

/* -------------------- Render PDF page -------------------- */
let isRendering = false, needsRender = false;

async function renderPage() {
  if (!state.pdf) return;
  if (isRendering) { needsRender = true; return; }
  isRendering = true;

  const page = await state.pdf.getPage(state.page);
  viewport = page.getViewport({ scale: 1 });

  if (!state.baseScale) {
    const wrap = $("#canvasWrap");
    const targetW = Math.min(wrap?.clientWidth || 1000, 1200);
    state.baseScale = targetW / viewport.width;
  }

  const scale = state.baseScale * state.viewScale;

  pdfCanvas.width  = viewport.width  * scale;
  pdfCanvas.height = viewport.height * scale;
  overlay.width    = pdfCanvas.width;
  overlay.height   = pdfCanvas.height;

  pdfCtx.setTransform(1,0,0,1,0,0);
  pdfCtx.clearRect(0,0,pdfCanvas.width,pdfCanvas.height);

  pdfCtx.save();
  pdfCtx.translate(state.panX, state.panY);
  pdfCtx.scale(scale, scale);
  await page.render({ canvasContext: pdfCtx, viewport }).promise;
  pdfCtx.restore();

  $("#pageInfo").textContent = `Page ${state.page} / ${state.pdf.numPages}`;
  redrawOverlay();

  isRendering = false;
  if (needsRender) { needsRender=false; renderPage(); }
}

function fitWidth(){
  if (!state.pdf) return;
  state.baseScale = ($("#canvasWrap").clientWidth || 1000) / viewport.width;
  state.viewScale=1; state.panX=0; state.panY=0;
  renderPage();
}
function fitPage(){
  if (!state.pdf) return;
  const wrap = $("#canvasWrap");
  const maxW = wrap?.clientWidth || 1000;
  const maxH = (window.innerHeight - 32) * 0.9;
  const sW = maxW / viewport.width;
  const sH = maxH / viewport.height;
  state.baseScale = Math.min(sW,sH);
  state.viewScale=1; state.panX=0; state.panY=0;
  renderPage();
}

/* -------------------- Overlay interaction -------------------- */
overlay.addEventListener("mousedown", (e) => {
  if (!state.tool || panning) return;
  const rect = overlay.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  const [px, py] = clientToPdf(cx, cy); // normalize to PDF coords

  if (["pull","sd","hd","mm","tag"].includes(state.tool)) { 
    placeOne(cx, cy); 
    return; 
  }

  if (state.tool === "arrow" || state.tool === "line") {
    state.drawing = { type: state.tool, from:[px,py], to:[px,py] };
    redrawOverlay();
  }

  if (state.tool === "cloud") {
    state.drawing = { type: "cloud", pts:[[px,py]] };
  }
});

overlay.addEventListener("mousemove", (e) => {
  if (!state.drawing) return;
  const rect = overlay.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  const [px, py] = clientToPdf(cx, cy);

  if (state.drawing.type==="arrow"||state.drawing.type==="line") 
    state.drawing.to=[px,py];
  else if (state.drawing.type==="cloud") 
    state.drawing.pts.push([px,py]);

  redrawOverlay();
});

overlay.addEventListener("mouseup", () => {
  if (!state.drawing) return;
  pageOps(state.page).push({ page: state.page, ...state.drawing });
  state.drawing=null; redrawOverlay();
});


/* -------------------- Place symbol -------------------- */
function placeOne(cx, cy) {
  const [px, py] = clientToPdf(cx, cy);
  const op = {
    page: state.page,
    type: "symbol",
    kind: state.tool,
    at: [px, py],
    scale: state.symScale,
    rot: state.rotation,
  };
  pageOps(state.page).push(op);
  redrawOverlay();
}

/* -------------------- Overlay redraw -------------------- */
function redrawOverlay() {
  ovCtx.setTransform(1,0,0,1,0,0); // reset transform
  ovCtx.clearRect(0,0,overlay.width,overlay.height);

  // Apply same transform as PDF canvas
  const scale = state.baseScale * state.viewScale;
  ovCtx.save();
  ovCtx.translate(state.panX, state.panY);
  ovCtx.scale(scale, scale);

  const ops = pageOps(state.page);
  for (const op of ops) drawOp(op);
  if (state.drawing) drawOp(state.drawing, true);

  ovCtx.restore();
}

function drawOp(op, isPreview=false) {
  ovCtx.save();
  ovCtx.lineWidth = 2 / (state.baseScale * state.viewScale); // keep thickness constant
  ovCtx.strokeStyle = isPreview ? "#999" : "#111";
  ovCtx.fillStyle   = "#111";

  if (op.type==="symbol") {
    const [px, py] = op.at; // already in PDF coords
    ovCtx.beginPath(); 
    ovCtx.arc(px, viewport.height - py, 3, 0, Math.PI*2); 
    ovCtx.fill();
    ovCtx.font = `${12/(state.baseScale*state.viewScale)}px system-ui`;
    ovCtx.textAlign = "center";
    ovCtx.fillText(
      op.kind.toUpperCase(), 
      px, 
      viewport.height - py + 12/(state.baseScale*state.viewScale)
    );
  }
  else if (op.type==="arrow"||op.type==="line") {
    const [x0,y0] = op.from;
    const [x1,y1] = op.to;
    ovCtx.beginPath(); 
    ovCtx.moveTo(x0, viewport.height-y0); 
    ovCtx.lineTo(x1, viewport.height-y1); 
    ovCtx.stroke();
    if (op.type==="arrow") drawArrowHead(x0, viewport.height-y0, x1, viewport.height-y1);
  }
  else if (op.type==="cloud") {
    const pts=op.pts; 
    if (pts.length<2){ovCtx.restore();return;}
    ovCtx.beginPath();
    ovCtx.moveTo(pts[0][0], viewport.height-pts[0][1]);
    for(let i=1;i<pts.length;i++){
      const [px0,py0] = pts[i-1];
      const [px,py]   = pts[i];
      const dx=px-px0, dy=py-py0, len=Math.hypot(dx,dy)||1;
      const nx=-dy/len, ny=dx/len, amp=4;
      const mx=(px0+px)/2, my=(py0+py)/2;
      ovCtx.quadraticCurveTo(mx+nx*amp, viewport.height-(my+ny*amp), px, viewport.height-py);
    }
    ovCtx.closePath(); 
    ovCtx.stroke();
  }

  ovCtx.restore();
}



/* -------------------- Flatten export -------------------- */
async function exportFlattened(){
  alert("Export still TODO with zoom/pan support!");
}

/* -------------------- Kickoff -------------------- */
(() => { selectTool("sd"); })();
