const fileInput = document.getElementById("fileInput");
const pdfCanvas = document.getElementById("pdfCanvas");
const overlay = document.getElementById("overlay");
const pdfCtx = pdfCanvas.getContext("2d");
const ovCtx = overlay.getContext("2d");

let pdfDoc = null;
let currentPage = 1;
let pageCount = 0;
let pageImage = null;

const cam = { zoom: 1, offsetX: 0, offsetY: 0 };
let state = { tool: null, ops: {} };

const SYMBOLS = {
    pull: "M3 5h18v14H3z M6 8h12v2H6z M10 11h4v5h-4z",
    sd: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M7 12h10 M8 9.5h8 M8 14.5h8",
    hd: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 6v12 M6 12h12 M8.2 8.2l7.6 7.6 M15.8 8.2l-7.6 7.6"
};

// === Load PDF ===
fileInput.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    pageCount = pdfDoc.numPages;
    currentPage = 1;
    await showPage();
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
}

state.symbolScale = 1;
document.getElementById("symSize").addEventListener("input", e => {
    state.symbolScale = parseFloat(e.target.value);
});


// === Redraw ===
function redraw() {
    pdfCtx.setTransform(1, 0, 0, 1, 0, 0);
    pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
    pdfCtx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.offsetX, cam.offsetY);
    pdfCtx.drawImage(pageImage, 0, 0);

    ovCtx.setTransform(1, 0, 0, 1, 0, 0);
    ovCtx.clearRect(0, 0, overlay.width, overlay.height);
    ovCtx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.offsetX, cam.offsetY);

    (state.ops[currentPage] || []).forEach(op => {
        if (op.type === "symbol") {
            ovCtx.save();
            ovCtx.translate(op.x, op.y);
            ovCtx.scale(op.scale || state.symbolScale, op.scale || state.symbolScale);
            const path = new Path2D(SYMBOLS[op.kind]);
            ovCtx.stroke(path);
            ovCtx.restore();

        }
    });
}

// === Tool select ===
document.querySelectorAll(".tool").forEach(btn => {
    btn.addEventListener("click", () => {
        if (state.tool === btn.dataset.tool) {
            state.tool = null; btn.classList.remove("active");
        } else {
            state.tool = btn.dataset.tool;
            document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        }
    });
});

// === Place symbol / Pan ===
let dragging = false, lastX = 0, lastY = 0;
overlay.addEventListener("mousedown", e => {
    if (state.tool) {
        const rect = overlay.getBoundingClientRect();
        const x = (e.clientX - rect.left - cam.offsetX) / cam.zoom;
        const y = (e.clientY - rect.top - cam.offsetY) / cam.zoom;
        if (!state.ops[currentPage]) state.ops[currentPage] = [];
        state.ops[currentPage].push({
            type: "symbol",
            kind: state.tool,
            x, y,
            scale: state.symbolScale
        });
        redraw();
    } else {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
    }
});

overlay.addEventListener("mousemove", e => {
    if (!dragging) return;
    cam.offsetX += e.clientX - lastX;
    cam.offsetY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    redraw();
});
overlay.addEventListener("mouseup", () => dragging = false);
overlay.addEventListener("mouseleave", () => dragging = false);

// === Zoom + Nav ===
function zoomAt(factor, cx, cy) {
    const prevZoom = cam.zoom;
    cam.zoom *= factor;

    // keep point (cx,cy) fixed
    cam.offsetX = cx - (cx - cam.offsetX) * (cam.zoom / prevZoom);
    cam.offsetY = cy - (cy - cam.offsetY) * (cam.zoom / prevZoom);

    redraw();
}

document.getElementById("zoomIn").addEventListener("click", () => {
    zoomAt(1.2, overlay.width / 2, overlay.height / 2);
});

document.getElementById("zoomOut").addEventListener("click", () => {
    zoomAt(1 / 1.2, overlay.width / 2, overlay.height / 2);
});

document.getElementById("resetView").addEventListener("click", () => { cam.zoom = 1; cam.offsetX = 0; cam.offsetY = 0; redraw(); });
document.getElementById("prevPage").addEventListener("click", async () => { if (currentPage > 1) { currentPage--; await showPage(); } });
document.getElementById("nextPage").addEventListener("click", async () => { if (currentPage < pageCount) { currentPage++; await showPage(); } });

// === Export ===
document.getElementById("exportPdf").addEventListener("click", async () => {
    const pdf = await PDFLib.PDFDocument.create();
    for (let p = 1; p <= pageCount; p++) {
        // flatten page into one canvas
        const c = document.createElement("canvas");
        c.width = pdfCanvas.width; c.height = pdfCanvas.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(pageImage, 0, 0);
        (state.ops[p] || []).forEach(op => {
            if (op.type === "symbol") {
                ctx.save(); ctx.translate(op.x, op.y);
                const path = new Path2D(SYMBOLS[op.kind]);
                ctx.stroke(path); ctx.restore();
            }
        });
        const img = await pdf.embedPng(c.toDataURL("image/png"));
        const page = pdf.addPage([c.width, c.height]);
        page.drawImage(img, { x: 0, y: 0, width: c.width, height: c.height });
    }
    const bytes = await pdf.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "FA-Markup.pdf"; a.click();
});
