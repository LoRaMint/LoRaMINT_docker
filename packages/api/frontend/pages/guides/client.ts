/**
 * Browser "island" for every guide page. Two conveniences, no framework: a
 * "copy" button on each code block, and a click-to-zoom lightbox for each
 * picture. Server-rendered content stays fully usable without it.
 *
 * It used to belong to one page and its markup was written by hand
 * (`frontend/pages/guides/esp32/page.tsx`), so the button was a `<button>` in
 * the JSX and this file only wired it up. Guides are Markdown now: there is no
 * JSX to put a button in, and `renderMarkdown` deliberately produces the same
 * `<pre>` for every code block rather than growing a second spelling for the
 * ones that want a button.
 *
 * So the button is *built* here rather than found. That is also why the zoom
 * cursor is set here: `zoomable` in the markup is only a hook, and a page that
 * does not load this script - the Impressum renders the same Markdown - must
 * not offer a zoom cursor over a picture that will not zoom.
 */

//====================================
// COPY BUTTONS
//====================================

const LABEL = "Kopieren";

/**
 * Wraps one code block so a button can sit in its corner.
 *
 * The `<pre>` is moved into a `position: relative` wrapper rather than being
 * given one itself: it scrolls sideways (`overflow-x-auto`), and an absolutely
 * positioned child of a scrolling box scrolls away with the content. The button
 * has to stay where it is while a long line slides underneath it.
 */
const wireCodeBlock = (pre: HTMLPreElement) => {
  if (pre.parentElement?.dataset.copyWrapper === "") return;

  const wrapper = document.createElement("div");
  wrapper.dataset.copyWrapper = "";
  wrapper.className = "relative";
  pre.replaceWith(wrapper);
  wrapper.appendChild(pre);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-xs btn-neutral absolute right-2 top-2 z-10";
  button.textContent = LABEL;

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent ?? "");
      button.textContent = "Kopiert ✓";
    } catch {
      // Refused, or no clipboard at all - over plain http the API is simply not
      // there. Saying so is better than a button that looks like it worked.
      button.textContent = "Fehler";
    }
    setTimeout(() => {
      button.textContent = LABEL;
    }, 1500);
  });

  wrapper.appendChild(button);
};

const wireCopyButtons = () => {
  for (const pre of document.querySelectorAll<HTMLPreElement>("main pre")) {
    wireCodeBlock(pre);
  }
};

//====================================
// IMAGE LIGHTBOX
//====================================

const openLightbox = (src: string, alt: string) => {
  const overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-zoom-out";

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.className = "max-h-full max-w-full rounded-box";
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
};

const wireLightbox = () => {
  for (const img of document.querySelectorAll<HTMLImageElement>("img.zoomable")) {
    // The affordance is added with the handler, never before it.
    img.classList.add("cursor-zoom-in");
    img.addEventListener("click", () => openLightbox(img.src, img.alt));
  }
};

wireCopyButtons();
wireLightbox();
