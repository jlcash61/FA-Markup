# FA Markup Tool

FA Markup is a lightweight, browser-based Fire Alarm drawing markup tool.  
It allows you to open PDF floor plans, add symbols, text, and annotations, and export the result as a new PDF.

---

## ✨ Features

- **PDF Viewing**  
  - Load multipage PDFs (via PDF.js).  
  - Navigate pages, zoom, and pan with smooth camera controls.

- **Markup Tools**  
  - Place symbols (Smoke, Heat, Pull, etc).  
  - Draw lines, arrows, and clouds.  
  - Add text labels.  
  - Select & move annotations.  
  - Delete annotations.  
  - Undo and clear page.

- **Editing Options**  
  - Adjustable symbol size.  
  - Symbol rotation & scaling (future extension).  
  - Text re-editing.

- **Project Management**  
  - Save your markup session as a `.fam` project file (JSON).  
  - Reload later to continue editing.  
  - Flatten & export to PDF.

- **PWA (Progressive Web App)**  
  - Installable as an app (desktop/mobile).  
  - Works offline with Service Worker caching.  
  - Launch fullscreen with custom icon & theme.

---

## 🚀 Usage

1. Open [FA Markup](https://your-deploy-link.com) in your browser.  
2. Upload a PDF file using the **File → Open** button.  
3. Use the sidebar tools to place symbols, draw, or add text.  
4. Pan/Zoom with mouse drag or zoom buttons.  
5. Save progress (`Save Project`) or export final PDF (`Export PDF`).

---

## 🔧 Developer Guide

- `index.html` → Main layout and UI buttons.  
- `styles.css` → App styling, including sidebar and overlay.  
- `app.js` → Core logic (PDF rendering, annotation state, tools, save/export).  
- `manifest.json` → PWA config.  
- `service-worker.js` → Offline caching.  

---

## 💻 Local Development

Clone and serve locally:

```bash
git clone https://github.com/jlcash61/fa-markup.git
cd fa-markup
python -m http.server 8080
