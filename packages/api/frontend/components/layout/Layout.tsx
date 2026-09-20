import type { JSX } from "solid-js";
import { legal, auth, sqlConsole, board, setupAccount } from "../../../config";
import { currentDarkMode, currentPath, currentScope, currentUser, hasRole, PAGES } from "../../../lib";
import { guidePath, guideTree } from "../../../services/guides";

/**
 * A tab in the header.
 *
 * The lifted-tab look stays, but it now means something. A raised tab promises
 * a surface attached underneath it; before, the menu floated free below in
 * primary, so the promise was never kept - which is also why nothing ever
 * marked the page one was on. Open, the tab carries the menu's own surface and
 * loses its bottom border, so the two read as one shape.
 */
const tabBase =
  /*
   * The height is what puts the label near the middle of the bar.
   *
   * A tab has to end at the bar's lower edge - that is where the panel hangs
   * from, and the whole point is that the two meet. So the label cannot be
   * centred by centring the tab. It is centred *inside* a tab tall enough to
   * reach most of the way up instead: 3.25rem of tab in a 4rem bar leaves the
   * text a little below the middle rather than sitting on the floor.
   */
  "h-[3.25rem] px-3 text-sm rounded-t-box border border-transparent -mb-px " +
  "text-base-content/80 hover:text-base-content cursor-pointer select-none " +
  "list-none marker:content-none [&::-webkit-details-marker]:hidden";

/** Open: the tab wears the panel's surface and opens downwards into it. */
const tabOpen = "group-open:bg-base-100 group-open:text-base-content " +
  "group-open:border-base-300 group-open:border-b-base-100 group-open:font-medium";

/** The page one is on, marked under the tab rather than by lifting it. */
const tabCurrent = "text-primary font-medium border-b-2 border-b-primary";

/**
 * What every menu panel looks like. The surface, not the size.
 *
 * **No width and no overflow here**, deliberately: the wide menu and the phone
 * menu need different ones, and putting a value here plus an override in the
 * caller relies on which Tailwind class lands later in the stylesheet rather
 * than on which one is written later. That is a coin toss, so each panel says
 * its own.
 */
const panelSurface =
  "p-1.5 bg-base-100 text-base-content border border-base-300 shadow-raised";

/**
 * The panel hanging off a tab: flush underneath it, so the two read as one.
 *
 * `menu` lives here and **not** in `panelSurface`, although a fly-out looks
 * the same. Two reasons, and the second is the one that bites: the entries
 * inside a fly-out are descendants of *this* `.menu` and are styled by it
 * either way, so the class would be redundant - and `.menu` sets
 * `display: flex`, which is a direct fight with the `hidden` a closed fly-out
 * depends on. Tailwind emits its utilities after daisyUI's components so
 * `hidden` happens to win, but a panel whose whole job is to stay shut should
 * not rest its case on the order of a stylesheet.
 */
const panelClass =
  `menu ${panelSurface} gap-1 dropdown-content z-10 mt-0 ` +
  "rounded-b-box rounded-tr-box [&_li_ul]:whitespace-normal";

/**
 * Wide screens: as wide as the longest entry needs, within reason.
 *
 * `w-max` rather than a fixed width, because the titles are written by whoever
 * writes the guides and nobody can pick a number that fits them all. Past the
 * cap the titles wrap instead of being cut off at the edge.
 *
 * **No `overflow` and no height cap**, and that is not an oversight: a
 * sub-menu is positioned outside this panel, and an ancestor with
 * `overflow: auto` clips exactly that. Since the depth of the tree now goes
 * sideways rather than downwards, this panel only ever holds the topics - a
 * short list - so there is nothing left for a scrollbar to solve. The phone
 * menu, which has no fly-outs, keeps its scrolling.
 */
const widePanel = "min-w-56 w-max max-w-[min(24rem,calc(100vw-2rem))]";

/**
 * A sub-menu, opening beside its parent instead of indented underneath it.
 *
 * **It opens to the left**, and that is the one decision here worth a
 * sentence. The header navigation sits at the right-hand end of the bar, so a
 * panel opening rightwards runs off the window on anything narrower than a
 * large desktop - and CSS cannot measure that at render time. Opening left
 * always has the whole page width available. It is what a menu near the right
 * edge does on any desktop anyway; the chevron points that way, so the entry
 * says where it goes. (One word - `right-full` to `left-full`, and the chevron
 * - flips it, if a deployment wants the other side.)
 *
 * **It hangs off the panel, not off the entry.** An absolutely positioned
 * element measures from its nearest positioned ancestor, and daisyUI already
 * makes the panel one - so `-top-px` is the panel's own top edge rather than
 * the hovered row's, and the two panels line up along the top the way the
 * panel lines up under its tab.
 *
 * That needs `static` on the entry and not merely the absence of `relative`:
 * daisyUI positions every `li` in a menu itself. Dropping the class looked
 * right and changed nothing, because the rule was never ours.
 *
 * They join rather than float: square corners on the touching side, and no
 * border there at all, so one line runs between them instead of two. That is
 * the same trick the open tab plays on its bottom edge.
 *
 * The `:where()` daisyUI wraps its own `li ul` rules in gives them no
 * specificity at all, so these plain utilities override the indentation, the
 * relative positioning and the little guide line without an `!important`.
 */
const flyoutPanel =
  `${panelSurface} hidden absolute -top-px right-full z-20 ms-0 me-0 ` +
  "space-y-1 rounded-box rounded-e-none border-e-0 " +
  "min-w-52 w-max max-w-[min(20rem,60vw)] whitespace-normal before:hidden";

/**
 * What opens it: hover for a pointer, focus for a keyboard.
 *
 * `[&:hover>ul]` and not a Tailwind `group`, because a named group matches
 * *any* hovered ancestor carrying it - so hovering a topic would open its
 * grandchildren too. The direct-child selector opens one level, and the levels
 * below stay open on their own because a pointer inside a sub-menu is still
 * inside the entry that owns it.
 *
 * `focus-within` is what makes the sub-pages reachable without a mouse at all:
 * tabbing onto the topic reveals its panel, and the next Tab walks into it.
 * Without it they would be `display: none` and invisible to a screen reader.
 */
const flyoutOpens = "[&:hover>ul]:block [&:focus-within>ul]:block";

/**
 * The strip between an entry and the panel beside it, made hoverable.
 *
 * Between the entry's edge and the outside of the panel lies the panel's own
 * padding - six pixels that belong to neither. A pointer travelling across it
 * is over neither the entry nor the sub-menu, `:hover` drops, and the panel
 * shuts in the face of whoever was reaching for it. This is the single most
 * annoying way for a menu to be broken, and it is invisible in a screenshot.
 *
 * The fix is not a gap-closing offset - the two must not overlap. The entry is
 * stretched over the strip instead: a negative margin moves its edge out to
 * where the panel begins, and the matching padding puts its contents back
 * where they were. Nothing moves, and the hover area is continuous.
 *
 * It flips with the panel, because the strip is on whichever side the panel
 * is - see `flyoutFlips`.
 */
const flyoutBridge = "static -ms-1.5 ps-1.5";

/**
 * The other side, for when the script below has measured room for it.
 *
 * `data-side="right"` is set on the entry by the script at the foot of this
 * file; **without JavaScript the attribute is never there and the menu opens
 * left**, which always fits. So this is an improvement on a working menu, not
 * a crutch holding one up.
 *
 * Written as `[&[data-side=right]>ul]` rather than as a Tailwind `group`, for
 * the same reason `flyoutOpens` is: a named group matches any ancestor
 * carrying it, so a flipped topic would flip its grandchildren too. The
 * direct-child selector speaks about one level and no other.
 *
 * The chevron turns with the panel. A mark pointing one way while the menu
 * goes the other is worse than no mark at all.
 */
const flyoutFlips =
  "[&[data-side=right]>ul]:left-full [&[data-side=right]>ul]:right-auto " +
  "[&[data-side=right]>ul]:rounded-e-box [&[data-side=right]>ul]:rounded-s-none " +
  "[&[data-side=right]>ul]:border-e [&[data-side=right]>ul]:border-s-0 " +
  "data-[side=right]:ms-0 data-[side=right]:ps-0 " +
  "data-[side=right]:-me-1.5 data-[side=right]:pe-1.5 " +
  "[&[data-side=right]>a>svg]:rotate-180";

/** A no-JS nav dropdown (daisyUI `<details>` menu) with a chevron indicator. */
function NavDropdown(props: {
  label: string;
  /** True when the page being rendered sits in this section. */
  current?: boolean;
  children: JSX.Element;
}) {
  return (
    <details class="dropdown group relative self-end">
      <summary
        class={`${tabBase} ${tabOpen} ${props.current ? tabCurrent : ""} inline-flex items-center gap-1`}
      >
        {props.label}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-3 w-3 transition-transform duration-200 group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <ul class={`${panelClass} ${widePanel}`}>{props.children}</ul>
    </details>
  );
}

/** A single entry inside a NavDropdown. */
function NavItem(props: { href: string; current?: boolean; children: JSX.Element }) {
  return (
    <li>
      <NavLink href={props.href} current={props.current}>
        {props.children}
      </NavLink>
    </li>
  );
}

/**
 * The link itself, so an entry with children and one without cannot drift
 * apart. They did for one afternoon: the branch version grew an `aria-current`
 * and the leaf version a different hover colour, and nothing said which was
 * right.
 *
 * Three states, and they are three because two would not be enough once the
 * sub-pages are behind a fly-out. `current` is "you are here" and is filled.
 * `leadsTo` is "the page you are on is in here" - the topic of the page one is
 * reading, whose own entry is hidden until the panel opens. Without it the
 * open menu would mark nothing at all and say nothing about where one is.
 * Weight *and* colour, never colour alone (`GRUND-03`).
 */
function NavLink(props: {
  href: string;
  current?: boolean;
  /** The page being shown lies below this entry, but is not this entry. */
  leadsTo?: boolean;
  children: JSX.Element;
}) {
  const state = props.current
    ? "bg-primary text-primary-content"
    : props.leadsTo
      ? "text-primary font-medium hover:bg-base-200"
      : "hover:bg-base-200";
  return (
    <a
      href={props.href}
      class={state}
      aria-current={props.current ? "page" : undefined}
    >
      {props.children}
    </a>
  );
}

/**
 * The mark on an entry that opens a panel beside it.
 *
 * It points the way the panel actually opens - see `flyoutPanel`. A chevron
 * that points one way while the menu goes the other is worse than none.
 */
function SubChevron() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-3 w-3 justify-self-end opacity-60"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

/**
 * One entry of the navigation: a link, and possibly a level under it.
 *
 * The guides are a tree of any shape the editor gives them, so the menu has to
 * be a tree too. daisyUI's `menu` renders a nested `<ul>` inside an `<li>`
 * indented and without any work here, which is why the whole tree can go into
 * the same structure the flat sections use rather than into a second one.
 */
type NavEntry = { href: string; label: string; items?: NavEntry[] };

/**
 * An entry and everything under it, recursively - in one of two shapes.
 *
 * **`flyout`** is the wide header: a topic opens its sub-pages in a panel
 * beside it, the way a desktop menu has always done it. The panel is only
 * ever as deep as one level at a time, so the width of the menu stops being a
 * function of how deep somebody nested their guides.
 *
 * **Without it** the sub-pages are indented underneath, which is what the
 * phone menu uses. Not a lesser version: a fly-out needs hover, a phone has
 * none, and a panel opening sideways out of a 20rem sheet would open into
 * nothing. Two shapes for two inputs, from one tree.
 *
 * `isCurrent` and `leadsTo` are passed in rather than imported: both are
 * closed over the request being rendered, and a module-level version would
 * need the path as a second argument at every call.
 */
function NavBranch(props: {
  entry: NavEntry;
  isCurrent: (href: string) => boolean;
  leadsTo: (entry: NavEntry) => boolean;
  /** Open the children beside this entry instead of indented under it. */
  flyout?: boolean;
}) {
  const children = props.entry.items ?? [];
  if (children.length === 0) {
    return (
      <NavItem href={props.entry.href} current={props.isCurrent(props.entry.href)}>
        {props.entry.label}
      </NavItem>
    );
  }

  const below = () =>
    children.map((child) => (
      <NavBranch
        entry={child}
        isCurrent={props.isCurrent}
        leadsTo={props.leadsTo}
        flyout={props.flyout}
      />
    ));

  if (!props.flyout) {
    return (
      <li>
        <NavLink href={props.entry.href} current={props.isCurrent(props.entry.href)}>
          {props.entry.label}
        </NavLink>
        <ul>{below()}</ul>
      </li>
    );
  }

  return (
    <li class={`${flyoutBridge} ${flyoutOpens} ${flyoutFlips}`} data-flyout>
      <NavLink
        href={props.entry.href}
        current={props.isCurrent(props.entry.href)}
        leadsTo={props.leadsTo(props.entry)}
      >
        {props.entry.label}
        <SubChevron />
      </NavLink>
      <ul class={flyoutPanel}>{below()}</ul>
    </li>
  );
}

/** Person icon used by both the login button and the signed-in indicator. */
function UserIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/**
 * Sign-in control at the right-hand end of the header: the login button when
 * anonymous, the display name plus a sign-out button when signed in. Reads the
 * user from the request context, so no page has to pass it down.
 */
function AuthControl() {
  const user = currentUser();

  if (!user) {
    // Outline, not filled: a primary button up here competes on every page with
    // that page's own primary action.
    return (
      <a href="/login" class="btn btn-outline btn-primary btn-sm ml-4 gap-1.5">
        <UserIcon />
        Login
      </a>
    );
  }

  return (
    <div class="flex items-center gap-2 ml-4">
      {/* The name is the way to the profile - there is no other entry point. */}
      <a
        href="/profile"
        class="flex items-center gap-1.5 text-sm text-base-content/80 hover:text-base-content"
        title="Profil anzeigen"
      >
        <UserIcon />
        {user.displayName}
      </a>
      {/* POST so a cross-site link cannot sign the user out. */}
      <form method="post" action="/logout">
        <button type="submit" class="btn btn-ghost btn-sm">
          Abmelden
        </button>
      </form>
    </div>
  );
}

export default function Layout(props: { children: JSX.Element }) {
  const user = currentUser();
  const dark = currentDarkMode();
  const path = currentPath();
  const managementUser = hasRole(user, "management", auth);
  const adminUser = hasRole(user, "admin", auth);
  const boardUser = hasRole(user, "board", auth);
  const editorUser = hasRole(user, "editor", auth);
  // Not a role: since the ladder went, being in one data group is enough to have
  // measurements worth showing. The scope is worked out once per request in
  // index.ts, because rendering cannot query for it.
  const scope = currentScope();
  const dataUser = scope === "all" || scope.length > 0;
  // The same condition the login routes are registered under in
  // frontend/pages/index.tsx: a sign-in exists as soon as either way in is
  // configured. Offering the button without a route behind it would be worse
  // than offering nothing.
  const loginPossible = auth.enabled || setupAccount.enabled;

  /**
   * The navigation as data, so the wide and the narrow header render the same
   * thing. Duplicating the markup would mean every future entry has to be added
   * twice, and the one that gets forgotten is always the one nobody tests.
   *
   * The menu only decides what is worth showing; every route checks the role
   * again for itself.
   */
  /**
   * Whether the page being shown lies at this address or under it.
   *
   * Prefix rather than equality, so a sub-page without an entry of its own
   * still marks the section it belongs to - /management/devices/3 is still
   * "Geräte verwalten". "/" is matched exactly, because otherwise it would be
   * the prefix of everything.
   *
   * This is *not* the same question as "is this the current page" - see
   * `isCurrent` below, which is defined once the entries are known.
   */
  const covers = (href: string): boolean =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

  /** True when this entry or anything under it holds the page being shown. */
  const anyCurrent = (entry: NavEntry): boolean =>
    covers(entry.href) || (entry.items ?? []).some(anyCurrent);

  /**
   * The guides, as the menu shows them: the whole tree, nested.
   *
   * Read out of the module cache rather than queried - `Layout` is a
   * synchronous Solid component and cannot await anything. That is the whole
   * reason lib/guide-store.ts exists; see services/guides.ts.
   *
   * Drafts only for an editor. `guideTree` drops a page whose parent is
   * filtered out rather than lifting it to the root, so a published sub-page
   * cannot put its unpublished topic in the menu.
   */
  const guideEntries = (): NavEntry[] => {
    const branch = (node: ReturnType<typeof guideTree>[number]): NavEntry => ({
      href: `${PAGES.guides.href}/${guidePath(node)}`,
      label: node.title,
      ...(node.children.length > 0
        ? { items: node.children.map(branch) }
        : {}),
    });
    return guideTree({ drafts: editorUser }).map(branch);
  };

  const sections: { label: string; items: NavEntry[] }[] = [
    // Looking at data. Public but for the console, and the dashboard belongs
    // here rather than in a section of its own: for most visitors that section
    // held a single link, and its curation page sits with the other curation
    // pages under "Verwaltung".
    {
      label: "Daten",
      items: [
        PAGES.plots,
        PAGES.export,
        PAGES.status,
        ...(board.enabled ? [PAGES.board] : []),
        ...(sqlConsole.enabled && user ? [PAGES.sql] : []),
      ],
    },
    // Looking after what the school runs. Built from what this person actually
    // holds rather than from one gate - the areas do not contain one another,
    // so somebody who only manages devices sees one entry here, and that is
    // correct.
    //
    // The change log is deliberately absent: it needs the data role, and it is
    // already a card on the "Daten verwalten" hub, where that condition is
    // checked. One way in is enough.
    ...(dataUser || managementUser || boardUser || adminUser || editorUser
      ? [
          {
            label: "Verwaltung",
            items: [
              ...(dataUser ? [PAGES.data] : []),
              ...(managementUser ? [PAGES.devices] : []),
              // Reachable even when BOARD_ENABLED is off, so entries can be
              // prepared before the public page is switched on.
              ...(boardUser || adminUser ? [PAGES.boardManage] : []),
              // A token belongs to a *data group*, so membership is what counts -
              // not the data role, which sees every group but is in none. The
              // scope says which: an array with entries is real membership,
              // "all" only says the role. Same rule as requireGroupMember.
              ...(adminUser || (Array.isArray(scope) && scope.length > 0)
                ? [PAGES.tokens]
                : []),
              // Editors hold nothing else, so without this condition in the
              // gate above they would see no "Verwaltung" at all and could not
              // reach the pages they exist for. `editorUser` is already true
              // for administrators - hasRole says so - so no second term here.
              ...(editorUser ? [PAGES.guidesManage, PAGES.filesManage] : []),
            ],
          },
        ]
      : []),
    // The server itself, administrators only. Called "System" rather than
    // "Administration", which would sit beside "Verwaltung" as a synonym and
    // leave the difference to be guessed.
    ...(adminUser
      ? [{ label: "System", items: [PAGES.groups, PAGES.config] }]
      : []),
    // Everything somebody reads to learn how this works, in one section: every
    // guide, nested exactly as the tree is, and the files that go with them.
    //
    // This used to be three fixed entries - one hand-written guide, the
    // workshop text, and the downloads - and a new guide meant a new version of
    // the application. The whole tree is here now, which is the point of the
    // rebuild: writing a page publishes it into this menu.
    //
    // "Downloads" always stands, at the end. The navigation renders
    // synchronously and cannot ask the file system how many files there are
    // without a readdir on every page, so the page itself says when the shelf
    // is empty.
    {
      label: PAGES.guides.label,
      items: [
        { href: PAGES.guides.href, label: "Übersicht" },
        ...guideEntries(),
        PAGES.downloads,
      ],
    },
    {
      label: "Entwicklung",
      items: [PAGES.apiDocs, PAGES.github],
    },
  ];

  /**
   * Whether this entry *is* the page being shown - exactly one of them can be.
   *
   * The longest address that covers the path wins. That single rule serves
   * both shapes the menu has: where a page has no entry of its own,
   * `/management/devices` is the longest match for `/management/devices/3` and
   * marks it, exactly as before; where every level has an entry, the deepest
   * one wins and its ancestors do not.
   *
   * It matters more than it looks. `aria-current="page"` announces "this is
   * where you are", and on /anleitungen/workshop/tag-1 the prefix rule put it
   * on three entries at once - „Übersicht", „Workshop" and „Tag 1" all filled
   * in primary, with nothing to say which was meant. A tree makes an ancestor
   * a real entry, and an ancestor is not where you are.
   *
   * Defined here rather than beside `covers`, because it needs the finished
   * list of entries to know what "longest" means.
   */
  const reachable = (entries: NavEntry[]): string[] =>
    entries.flatMap((entry) => [entry.href, ...reachable(entry.items ?? [])]);

  const bestMatch = Math.max(
    0,
    ...sections
      .flatMap((section) => reachable(section.items))
      .filter(covers)
      .map((href) => href.length),
  );

  const isCurrent = (href: string): boolean =>
    covers(href) && href.length === bestMatch;

  /**
   * The page being shown is somewhere below this entry, but is not this entry.
   *
   * What the fly-out needs and the indented menu did not: with the sub-pages
   * hidden until a panel opens, the topic is the only thing on screen that can
   * say where one is.
   */
  const leadsTo = (entry: NavEntry): boolean =>
    !isCurrent(entry.href) && anyCurrent(entry);


  return (
    <div class="min-h-screen flex flex-col">
      {/* Header */}
      <header class="navbar min-h-16 h-16 items-end bg-base-300 px-3 sm:px-4 gap-2 pb-0">
        <div class="flex-1 min-w-0 self-center">
          <a href="/">
            {/*
              * Two files, not one recoloured by CSS: on the dark surface the
              * light logo's "MINT" reaches 1.07:1 and is simply not there. The
              * choice is made here, where the theme is already known, because
              * swapping it afterwards with a script shows the wrong one first.
              */}
            <img
              src={dark ? "/public/logo_loramint_dunkel.svg" : "/public/logo_loramint.svg"}
              alt="LoRaMINT"
              class="h-7 sm:h-10"
            />
          </a>
        </div>

        {/* Wide screens: one dropdown per section, side by side. */}
        <nav class="hidden md:flex items-end gap-0.5 self-end">
          {sections.map((section) => (
            <NavDropdown
              label={section.label}
              current={section.items.some(anyCurrent)}
            >
              {section.items.map((item) => (
                <NavBranch
                  entry={item}
                  isCurrent={isCurrent}
                  leadsTo={leadsTo}
                  flyout
                />
              ))}
            </NavDropdown>
          ))}
        </nav>

        {/* Narrow screens: everything behind one button. Still a <details>, so
            it needs no JavaScript, and the existing script that closes the other
            menus picks it up along with them. */}
        <details class="dropdown dropdown-end group md:hidden self-center">
          <summary class={`${tabBase} ${tabOpen} px-2`} aria-label="Menü">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-6 w-6"
            >
              <path d="M4 6h16M4 12h16M4 18h16" class="group-open:hidden" />
              <path d="M6 6l12 12M18 6L6 18" class="hidden group-open:block" />
            </svg>
          </summary>
          <ul class={`${panelClass} w-[min(20rem,calc(100vw-1.5rem))] max-h-[calc(100vh-5rem)] overflow-y-auto`}>
            {sections.map((section) => (
              <>
                <li class="menu-title text-base-content/70">{section.label}</li>
                {section.items.map((item) => (
                  <NavBranch entry={item} isCurrent={isCurrent} leadsTo={leadsTo} />
                ))}
              </>
            ))}
            {loginPossible && (
              <>
                <li class="menu-title text-base-content/70">Konto</li>
                {user ? (
                  <>
                    <NavItem href="/profile">{user.displayName}</NavItem>
                    <li>
                      {/* POST so a cross-site link cannot sign the user out. */}
                      <form method="post" action="/logout" class="p-0">
                        <button
                          type="submit"
                          class="w-full text-left px-4 py-2 rounded-lg hover:bg-base-200"
                        >
                          Abmelden
                        </button>
                      </form>
                    </li>
                  </>
                ) : (
                  <NavItem href="/login">Login</NavItem>
                )}
              </>
            )}
          </ul>
        </details>

        {/* The account control has its own place on wide screens; on a phone it
            lives in the menu above, where there is room for the name.
            Centred, not bottom-aligned: only the tabs need to touch the lower
            edge, and a button sitting on it looks like it fell there. */}
        {loginPossible && (
          <div class="hidden md:block self-center">
            <AuthControl />
          </div>
        )}
      </header>

      {/* Main Content */}
      <main class="flex-1 container mx-auto p-4">{props.children}</main>

      {/* Footer */}
      {/*
        * The line is what separates it: base-200 against base-100 is 1.09:1,
        * which is not an edge anyone sees.
        */}
      <footer class="bg-base-200 border-t border-base-300 p-4 text-base-content flex flex-col items-center gap-2">
        {(legal.impressum || legal.datenschutz) && (
          <div class="flex gap-4">
            {legal.impressum && (
              <a href="/impressum" class="link link-hover">
                Impressum
              </a>
            )}
            {legal.impressum && legal.datenschutz && (
              <span aria-hidden="true">·</span>
            )}
            {legal.datenschutz && (
              <a href="/datenschutz" class="link link-hover">
                Datenschutz
              </a>
            )}
          </div>
        )}
        {/* Decoration: the same logo already stands in the header, and the
            page is not more about LoRaMINT for being told twice. */}
        <img
          src={dark ? "/public/logo_loramint_dunkel.svg" : "/public/logo_loramint.svg"}
          alt=""
          class="h-10"
        />
      </footer>

      {/* Keep the nav dropdowns mutually exclusive so their panels never
          overlap, close them on outside click / Escape - and open a sub-menu
          to the right where there is room for it. */}
      <script>{`
        (function () {
          var menus = Array.prototype.slice.call(
            document.querySelectorAll("header details.dropdown")
          );
          menus.forEach(function (d) {
            d.addEventListener("toggle", function () {
              if (d.open) {
                menus.forEach(function (o) { if (o !== d) o.open = false; });
                place(d);
              }
            });
          });
          document.addEventListener("click", function (e) {
            menus.forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
          });
          document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") menus.forEach(function (d) { d.open = false; });
          });

          /*
           * Which side a sub-menu opens to.
           *
           * The stylesheet can only pick one side and has to pick the one that
           * always fits, which is the left: the navigation sits at the
           * right-hand end of the bar, and what stands to the right of it -
           * the last tab, the sign-in control, the page margin - is the same
           * few hundred pixels whatever the window is doing. A panel of any
           * length runs past the edge from there. CSS cannot measure that;
           * anchor positioning could, and only one browser has it.
           *
           * So this measures. Where the panel fits to the right it goes there,
           * because that is where a menu is expected to open; otherwise it
           * stays where the stylesheet put it. Remove this script and every
           * sub-menu still opens - leftwards, every time.
           */
          var GAP = 8;

          /*
           * The width a panel *would* have. It is display:none until hovered,
           * and a hidden element measures zero, so it is laid out behind
           * visibility:hidden for the length of one synchronous read. Reverted
           * before the browser paints, so nothing flickers.
           */
          function widthOf(panel) {
            if (panel.offsetParent !== null) return panel.offsetWidth;
            var display = panel.style.display;
            var visibility = panel.style.visibility;
            panel.style.visibility = "hidden";
            panel.style.display = "block";
            var width = panel.offsetWidth;
            panel.style.display = display;
            panel.style.visibility = visibility;
            return width;
          }

          function placeOne(entry) {
            var panel = entry.querySelector(":scope > ul");
            if (!panel) return;

            /*
             * Measured from the panel the entry sits in, not from the entry.
             * The sub-menu hangs off the panel's edge - that is the whole
             * point of the entry being statically positioned - so the entry's
             * own right edge is six pixels of padding short of where the
             * sub-menu would actually start.
             */
            var host = entry.parentElement;
            if (!host) return;

            /*
             * It has to be on screen. An entry in a panel that is still shut
             * measures as a box of zeros in the top left corner, and every
             * answer about it would be about a place it is not - so it is left
             * alone until its own turn comes below.
             */
            var box = host.getBoundingClientRect();
            if (box.width === 0) return;

            var width = widthOf(panel);
            // A zero means the measurement did not work. Leaving the attribute
            // alone keeps whichever side the stylesheet chose, which works.
            if (width === 0) return;

            var room =
              box.right + width + GAP <= document.documentElement.clientWidth;
            entry.dataset.side = room ? "right" : "left";
          }

          function place(root) {
            if (root.matches && root.matches("[data-flyout]")) placeOne(root);
            root.querySelectorAll("[data-flyout]").forEach(placeOne);
          }

          /*
           * Again on the way in, and that is where the deeper levels are
           * settled: a sub-menu two levels down is not where it will end up
           * until the one above it is open, and when the dropdown itself
           * opened it was still shut inside the first panel.
           */
          document.querySelectorAll("header [data-flyout]").forEach(function (entry) {
            entry.addEventListener("mouseenter", function () { place(entry); });
            entry.addEventListener("focusin", function () { place(entry); });
          });
        })();
      `}</script>

      {/* Times into the browser's zone - but only when the user has not chosen
          one. data-timezone on <html> carries that choice (config/ssr.ts); when
          it is set the server already rendered in it and there is nothing left
          to do. When it is empty the server wrote UTC with the suffix, and this
          replaces both, which is why the suffix disappears here rather than
          being appended. See frontend/components/LocalTime.tsx. */}
      <script>{`
        (function () {
          if (document.documentElement.dataset.timezone) return;
          var times = document.querySelectorAll("time[data-local]");
          for (var i = 0; i < times.length; i++) {
            var at = new Date(times[i].getAttribute("datetime"));
            if (isNaN(at.getTime())) continue;
            times[i].textContent = at.toLocaleString("de-DE", {
              dateStyle: "medium",
              timeStyle: "short"
            });
          }
        })();
      `}</script>
    </div>
  );
}
