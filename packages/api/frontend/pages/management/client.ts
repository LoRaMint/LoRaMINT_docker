/**
 * The three conveniences of a management table.
 *
 * Everything the page can do works without this file: filtering, sorting,
 * paging, editing, saving and deleting are forms and links. What is added here
 * is only ease - ticking a whole page at once, seeing which cells were touched,
 * and being asked before unsaved edits are thrown away.
 *
 * Written against the DOM directly, like the other islands in this project;
 * there is no framework on the page to hook into.
 */

const form = document.querySelector<HTMLFormElement>("[data-manage-form]");

if (form) {
  const selectAll = form.querySelector<HTMLInputElement>("[data-select-all]");
  const counter = form.querySelector<HTMLElement>("[data-selected-count]");
  const rowBoxes = () =>
    [...form.querySelectorAll<HTMLInputElement>('input[name="sel"]')];
  const editableCells = () =>
    [...form.querySelectorAll<HTMLInputElement>("input[data-previous]")];

  //====================================
  // SELECTION
  //====================================

  /**
   * Keeps the header checkbox honest: ticked when everything on the page is,
   * empty when nothing is, and `indeterminate` in between. The third state is
   * the point - without it "nothing selected" and "some selected" look the same,
   * and the next click does something different than expected.
   */
  const refreshSelection = () => {
    const boxes = rowBoxes();
    const selected = boxes.filter((box) => box.checked).length;

    if (selectAll) {
      selectAll.checked = selected > 0 && selected === boxes.length;
      selectAll.indeterminate = selected > 0 && selected < boxes.length;
    }
    if (counter) {
      counter.textContent =
        selected === 0
          ? "Nichts ausgewählt"
          : selected === 1
            ? "1 ausgewählt"
            : `${selected} ausgewählt`;
    }
  };

  selectAll?.addEventListener("change", () => {
    // Clicking a partially filled box leaves it checked, so this selects the
    // rest rather than clearing the few that were already ticked - which is the
    // way round people expect.
    for (const box of rowBoxes()) box.checked = selectAll.checked;
    refreshSelection();
  });

  for (const box of rowBoxes()) {
    box.addEventListener("change", refreshSelection);
  }
  refreshSelection();

  //====================================
  // TOUCHED CELLS
  //====================================

  /**
   * Marks a cell that no longer holds the value it started with, and says what
   * that was. Purely a hint: which fields really differ is decided on the
   * server, which compares against the hidden `prev` field rather than against
   * anything shown here.
   */
  const markChanged = (cell: HTMLInputElement) => {
    const changed = cell.value !== (cell.dataset.previous ?? "");
    cell.classList.toggle("border-l-4", changed);
    cell.classList.toggle("border-warning", changed);
    cell.title = changed ? `vorher: ${cell.dataset.previous}` : "";
  };

  for (const cell of editableCells()) {
    cell.addEventListener("input", () => markChanged(cell));
  }

  //====================================
  // EDITS THAT SURVIVE A SAVE
  //====================================

  /**
   * Saving one row - or a selection - reloads the page, and a reload would throw
   * away what was typed into every other row. So every touched cell is put aside
   * before the form leaves and written back when the new page arrives.
   *
   * Including the rows being saved, deliberately. Once a save succeeds the
   * server sends the new value back, the stored one is identical, and writing it
   * back changes nothing. Leaving them out instead would get the cancelled
   * confirmation wrong, where nothing was saved and everything should return.
   *
   * sessionStorage rather than a hidden field: this is the browser's own
   * scratchpad, it belongs to this tab, and the server has no business knowing
   * about half-typed corrections.
   */
  const STASH_KEY = `manage-edits:${location.pathname}`;
  /** Long enough for a confirmation step, short enough not to haunt the tab. */
  const STASH_MAX_AGE_MS = 30 * 60 * 1000;

  const stashEdits = () => {
    const dirty = editableCells().filter(
      (cell) => cell.value !== (cell.dataset.previous ?? ""),
    );
    if (dirty.length === 0) {
      sessionStorage.removeItem(STASH_KEY);
      return;
    }
    sessionStorage.setItem(
      STASH_KEY,
      JSON.stringify({
        at: Date.now(),
        values: Object.fromEntries(dirty.map((cell) => [cell.name, cell.value])),
      }),
    );
  };

  const restoreEdits = () => {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return;
    // Taken out immediately: edits are restored across one save, not kept
    // reappearing on every later visit.
    sessionStorage.removeItem(STASH_KEY);

    let stash: { at?: number; values?: Record<string, string> };
    try {
      stash = JSON.parse(raw);
    } catch {
      return;
    }
    if (!stash.values || Date.now() - (stash.at ?? 0) > STASH_MAX_AGE_MS) return;

    for (const cell of editableCells()) {
      const value = stash.values[cell.name];
      // A row that is no longer on this page simply has no cell to write to.
      if (value === undefined) continue;
      cell.value = value;
      // Decides for itself whether this still differs from what the server now
      // holds - a saved row ends up unmarked, an untouched one stays marked.
      markChanged(cell);
    }
  };

  restoreEdits();

  //====================================
  // THE REQUIRED REASON
  //====================================

  const reason = form.querySelector<HTMLInputElement>('input[name="reason"]');
  const reasonDialog =
    document.querySelector<HTMLDialogElement>("#reason-required");

  /**
   * Stops a write that carries no reason, and says so in a dialog.
   *
   * The field is also marked `required`, which is what catches this without
   * JavaScript - the browser refuses to submit and shows its own bubble. Here
   * that native validation is switched off, because our own wording explains
   * why the field exists rather than just that it is empty.
   *
   * Catching it in the browser matters beyond the message: the server refuses
   * too, but only by redirecting, and that throws away everything typed into
   * the table. Stopping here keeps the work.
   */
  if (reason && reasonDialog) {
    form.noValidate = true;
    reasonDialog.addEventListener("close", () => reason.focus());
  }

  const reasonMissing = () =>
    reason !== null && reasonDialog !== null && reason.value.trim().length === 0;

  //====================================
  // UNSAVED EDITS
  //====================================

  const hasUnsavedEdits = () =>
    editableCells().some((cell) => cell.value !== (cell.dataset.previous ?? ""));

  // Submitting is not leaving: the edits are on their way to the server. The
  // flag is only set once the submit is actually going through, so a request
  // stopped below still counts as staying on the page.
  let submitting = false;
  form.addEventListener("submit", (event) => {
    if (reasonMissing()) {
      event.preventDefault();
      reasonDialog!.showModal();
      return;
    }
    // Put the other rows' work aside before the page is replaced.
    stashEdits();
    submitting = true;
  });

  // Filtering, sorting and paging are links, so leaving the page really does
  // discard what was typed. The browser decides the wording; setting
  // returnValue is what asks for the prompt at all.
  window.addEventListener("beforeunload", (event) => {
    if (submitting || !hasUnsavedEdits()) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

//====================================
// A DELETION THAT KEEPS GOING
//====================================

/**
 * Clicks "next block" for you.
 *
 * A deletion by filter runs in blocks so the table is free between them; forty
 * blocks would otherwise be forty clicks. This does nothing the button does not
 * already do - it submits the same form with the same fields - so the page works
 * exactly as well without JavaScript, only more manually.
 *
 * The pause is not decoration. It is the window in which "Hier anhalten" can be
 * hit, and it is why the button keeps its own label: what happens next has to be
 * legible before it happens.
 */
const continueForm = document.querySelector<HTMLFormElement>(
  "form[data-continue-delete]",
);

if (continueForm) {
  const PAUSE_MS = 1500;
  const status = document.querySelector<HTMLElement>("[data-continue-status]");
  const stop = document.querySelector<HTMLButtonElement>("[data-continue-stop]");

  let timer: ReturnType<typeof setTimeout> | undefined;

  const halt = (message: string) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (status) status.textContent = message;
    stop?.remove();
  };

  if (status) status.textContent = "Läuft automatisch weiter …";
  if (stop) {
    stop.hidden = false;
    stop.addEventListener("click", () =>
      halt("Angehalten. Mit dem Knopf oben geht es blockweise weiter."),
    );
  }

  timer = setTimeout(() => continueForm.requestSubmit(), PAUSE_MS);

  // Leaving the page must not leave a submit armed behind it - the browser would
  // fire it on the way out and start a block nobody is watching.
  window.addEventListener("pagehide", () => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
