📘 Developer Documentation (FA Markup Tool)
Overview

The FA Markup Tool is a browser-based app (PWA-ready) that allows users to:

Import PDF drawings.

Add symbols, text, and markup annotations.

Pan/zoom the drawing.

Edit, move, or delete annotations.

Save/load projects for later editing.

Export the marked-up PDF for sharing.

It’s lightweight, ad-free, and optimized for field engineers + associates who need quick redlining without Adobe tools.

Application Flow

Startup

App loads index.html.

Two canvases are stacked in #canvasWrap:

pdfCanvas → base PDF page.

overlay → drawings & symbols.

Event listeners are bound to tool buttons, navigation, file input, etc.

Import PDF

User selects file → fileInput change event.

PDF.js parses file → sets pdfDoc and pageCount.

First page renders to pdfCanvas.

Drawing Layer

overlay listens for mouse events.

If a tool is selected:

Places new symbol/text/line/etc at mouse position.

Saves it in state.ops[page].

If no tool is selected:

Dragging pans the camera view.

Mouse wheel zooms.

Redraw Loop

redraw() clears overlay → iterates over state.ops[page].

Symbols/text are drawn using drawOp() with Path2D or ctx.fillText.

Camera zoom & offset are applied.

Editing

Click an existing op → marks as selectedId.

Drag moves it.

Press Delete → removes it.

Undo → pops last op.

Clear Page → wipes state.ops[currentPage].

Save/Load Projects

Save: Exports { state, projectName, pdfBase64 } as JSON file.

Load: Re-imports JSON, restores PDF & state.

Export PDF

Loops through PDF pages.

For each page:

Render original page → temporary canvas.

Overlay annotations drawn on top.

Re-embed into new PDF using pdf-lib.

Result is downloaded as projectName.pdf.

Core Functions
Setup / Helpers

makeId() → Generates random ID for annotations.

showStatus(msg) → Displays centered spinner/status overlay.

PDF Loading

showPage() → Renders current page to canvas.

renderPage(n) → Switches pages and refreshes drawings.

Drawing

drawOpToCtx(ctx, op) → Draws a single operation (symbol, text, line, etc).

redraw() → Clears and redraws overlay with all current ops.

Event Handling

mousedown/mousemove/mouseup → Places symbols, pans, or drags selected ops.

keydown (Delete/Undo) → Removes selected ops or undoes.

Project Management

saveProject() → Saves PDF + state into .json.

loadProject() → Imports .json and restores session.

Export

exportPdf() → Creates new annotated PDF and downloads it.

Data Structures
state object
state = {
  tool: null,            // active tool (symbol, text, line, etc)
  ops: {},               // annotations per page { [pageNum]: [ { id, type, ... } ] }
  drawing: null,         // current drawing op (for lines, clouds, arrows)
  symbolScale: 2,        // default size multiplier
  selectedId: null       // ID of selected symbol/text for editing
}

cam object
cam = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0
}

Symbols

Stored in SYMBOLS as SVG path strings:

const SYMBOLS = {
  pull: "...",
  sd: "...",
  hd: "...",
  av: "...",
  vo: "..."
};

📑 README (for GitHub)
# FA Markup Tool

FA Markup Tool is a lightweight browser-based **PDF markup and annotation app**, designed for engineers and associates who need to quickly redline fire alarm and building drawings.

🚀 **Features**
- Open PDFs directly in browser.
- Place standard fire alarm symbols (Pull, Smoke, Heat, AV, VO, etc).
- Add text labels, lines, arrows, and clouds.
- Pan and zoom like a CAD viewer.
- Edit, move, or delete symbols after placing.
- Undo and Clear Page for fast corrections.
- Save/load projects (with PDF embedded).
- Export final annotated PDF for sharing.
- Runs standalone or as a **PWA** (desktop/mobile installable).

🛠 **Tech Stack**
- [PDF.js](https://mozilla.github.io/pdf.js/) → PDF rendering
- [PDF-Lib](https://pdf-lib.js.org/) → PDF export
- Vanilla JS, HTML5 Canvas
- PWA-ready manifest + service worker

📦 **Installation**
1. Clone this repo:
   ```bash
   git clone https://github.com/jlcash61/fa-markup-tool.git
   cd fa-markup-tool


Serve locally (e.g. with VSCode Live Server or python -m http.server).

Open in browser → http://127.0.0.1:5500.

📱 PWA Install

Chrome/Edge: “Install App” option in URL bar.

iOS Safari: Add to Home Screen.

💾 Usage

Click Choose File to open a PDF.

Select a tool (Pull, Smoke, Heat, etc).

Click to place annotations.

Use Undo, Clear Page, or Delete for editing.

Save Project → resumes later.

Export PDF → downloads marked-up copy.

🔮 Planned

User preferences (default sizes, fonts, line thickness).

Symbol library expansion.

Hotkeys for fast workflows.

Mobile optimization (touch gestures).

Cloud sync (optional).

👨‍💻 Built by BorgworX with the help of AI.


---

⚡ Question for you:  
Do you want me to **combine dev-doc + README into one long Markdown doc**, or keep them **separate** (README for GitHub, full docs for internal reference)?


📦 Deployment

Supports static hosting (GitHub Pages, Firebase Hosting, Cloudflare Pages).
Make sure to serve with HTTPS for full PWA install support.

🔮 Roadmap

Symbol library expansion (AV, VO, custom).

User preferences (line thickness, text font/size).

Toolbar grouping & dropdown menus.

Export with editable metadata.

Keyboard shortcuts.

Easter eggs / branding (BorgworX ✨).

🏷️ License

MIT (Free to use & modify)


---

Next step → I’ll write the **Developer Docs** with a full program flow & function reference (based on `app.js`).

👉 Do you want that doc dropped in the repo as `/docs/DeveloperGuide.md` so you can keep it versioned?
