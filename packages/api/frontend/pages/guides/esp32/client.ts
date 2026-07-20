/**
 * Browser "island" for the /anleitung guide. Adds two conveniences with no
 * framework: a "copy" button on every code block, and a click-to-zoom lightbox
 * for the images. Server-rendered content stays fully usable without this.
 */

// ---- Copy buttons ---------------------------------------------------------
function wireCopyButtons() {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".copy-btn");
  for (const btn of buttons) {
    btn.addEventListener("click", async () => {
      const pre = btn.parentElement?.querySelector("pre");
      const text = pre?.textContent ?? "";
      try {
        await navigator.clipboard.writeText(text);
        const original = btn.textContent;
        btn.textContent = "Kopiert ✓";
        setTimeout(() => {
          btn.textContent = original;
        }, 1500);
      } catch {
        btn.textContent = "Fehler";
      }
    });
  }
}

// ---- Image lightbox -------------------------------------------------------
function openLightbox(src: string, alt: string) {
  const overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-zoom-out";

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.className = "max-h-full max-w-full rounded-box shadow-2xl";
  overlay.appendChild(img);

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  overlay.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

function wireLightbox() {
  const images = document.querySelectorAll<HTMLImageElement>("img.zoomable");
  for (const img of images) {
    img.addEventListener("click", () => openLightbox(img.src, img.alt));
  }
}

wireCopyButtons();
wireLightbox();
