/**
 * Switching between the configuration categories without leaving the page.
 *
 * Everything is already in the document: the server renders every category, and
 * without this file they simply stand underneath each other and the sidebar
 * links are anchors that jump to them. That is the whole no-JavaScript
 * behaviour, and it is why nothing here has to fetch anything.
 *
 * With this file the sidebar becomes a switch: one category is shown at a time,
 * and only a real change still goes to the server as a POST. The chosen category
 * lives in the address bar as a fragment, so a reload, the back button and a
 * bookmark all come back to the same place - and so does the redirect after a
 * save, which the server sends with the fragment attached.
 *
 * Written against the DOM directly, like the other islands in this project.
 */

const sidebar = document.querySelector<HTMLElement>("[data-config-nav]");
const panels = [
  ...document.querySelectorAll<HTMLElement>("[data-config-panel]"),
];

if (sidebar && panels.length > 0) {
  const links = [
    ...sidebar.querySelectorAll<HTMLAnchorElement>("a[data-config-link]"),
  ];

  const idOf = (link: HTMLAnchorElement) =>
    link.getAttribute("href")?.replace(/^#/, "") ?? "";

  const show = (id: string) => {
    // An unknown fragment - an old bookmark, a typo - falls back to the first
    // category rather than showing an empty page.
    const target = panels.some((panel) => panel.id === id)
      ? id
      : (panels[0]?.id ?? "");

    for (const panel of panels) panel.hidden = panel.id !== target;
    for (const link of links) {
      const active = idOf(link) === target;
      link.classList.toggle("bg-base-200", active);
      link.classList.toggle("font-semibold", active);
      // For anyone navigating by keyboard or with a screen reader: which entry
      // is the current one is otherwise only a shade of grey.
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  };

  for (const link of links) {
    link.addEventListener("click", (event) => {
      // Let a modified click open a new tab, where the fragment does the work
      // on its own.
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      const id = idOf(link);
      // pushState rather than assigning location.hash: the latter also scrolls
      // to the element, which jumps the page down for no reason when the panel
      // is already at the top.
      history.pushState(null, "", `#${id}`);
      show(id);
    });
  }

  // The back button, and the fragment the server attaches to its redirect after
  // a save, both arrive here.
  window.addEventListener("popstate", () =>
    show(location.hash.replace(/^#/, "")),
  );

  /**
   * The answer to a reveal is a page rendered in response to a POST: no
   * fragment, and an address that would re-submit the form on a reload. The
   * server names the category it rendered for, and the address is rewritten to
   * the ordinary one - so the right panel opens, and reloading is a plain GET.
   */
  const opened = sidebar.dataset.configOpen;
  if (opened) {
    history.replaceState(null, "", `/management/config#${opened}`);
    show(opened);
  } else {
    show(location.hash.replace(/^#/, ""));
  }
}
