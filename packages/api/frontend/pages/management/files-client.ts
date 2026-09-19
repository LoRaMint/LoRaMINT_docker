/**
 * Dropping files onto the upload form.
 *
 * The form works without this file, and that is the arrangement: the field
 * takes several files through the usual dialogue, the button sends them, the
 * server judges each one. What is added here is the second way in - dragging
 * them onto the box - and a list of what is about to be sent.
 *
 * Which is why the invitation to drag is `hidden` in the markup and revealed
 * from here. A page that says "Dateien hierher ziehen" to somebody whose
 * browser will do nothing of the sort is worse than one that stays quiet.
 *
 * Written against the DOM directly, like the other islands in this project.
 */

const zone = document.querySelector<HTMLElement>("[data-dropzone]");
const input = zone?.querySelector<HTMLInputElement>('input[type="file"]');

if (zone && input) {
  const hint = zone.querySelector<HTMLElement>("[data-dropzone-hint]");
  const list = zone.querySelector<HTMLElement>("[data-dropzone-list]");

  if (hint) hint.hidden = false;

  /** The classes that say "let go here". Removed again on every exit. */
  const ACTIVE = ["border-primary", "bg-primary/5"];

  /**
   * What the field will send, shown as names.
   *
   * A drop changes nothing visible on its own - the field keeps saying "Keine
   * Datei ausgewählt" in some browsers - so without this the only way to find
   * out whether the drop arrived is to press the button.
   */
  const render = () => {
    if (!list) return;
    list.textContent = "";
    for (const file of input.files ?? []) {
      const item = document.createElement("li");
      item.className = "font-mono";
      item.textContent = file.name;
      list.append(item);
    }
  };

  /**
   * Adds to what is already there rather than replacing it, because files are
   * dragged in batches - one folder, then another - and a second drop that
   * silently discarded the first would be found out at the worst moment.
   *
   * Name and size together decide a duplicate. Dropping the same file twice is
   * an accident; two different files of the same name cannot both be stored
   * anyway, and the server says so by name.
   */
  const add = (dropped: FileList) => {
    const carrier = new DataTransfer();
    const seen = new Set<string>();

    for (const file of [...(input.files ?? []), ...dropped]) {
      const key = `${file.name}:${file.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      carrier.items.add(file);
    }

    input.files = carrier.files;
    render();
  };

  // Both events have to be cancelled, and dragover on every single move: the
  // browser's default is to open the dropped file as a page, and it takes the
  // absence of a cancelled dragover as permission to do exactly that.
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add(...ACTIVE);
  });

  zone.addEventListener("dragleave", (event) => {
    // Leaving towards a child element is not leaving the box. Without this the
    // highlight flickers off every time the pointer crosses the field inside.
    if (event.relatedTarget instanceof Node && zone.contains(event.relatedTarget)) {
      return;
    }
    zone.classList.remove(...ACTIVE);
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove(...ACTIVE);
    const dropped = event.dataTransfer?.files;
    if (dropped && dropped.length > 0) add(dropped);
  });

  // Picking through the dialogue replaces the selection - that is the browser's
  // doing and not worth fighting - so the list follows rather than accumulates.
  input.addEventListener("change", render);

  render();
}
