import type { JSX } from "solid-js";
import { legal, auth, sqlConsole, board, setupAccount } from "../../../config";
import { currentDarkMode, currentPath, currentScope, currentUser, hasRole, PAGES } from "../../../lib";

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

/** The panel, flush under its tab: no top-left round, no gap, one shadow. */
const panelClass =
  "menu dropdown-content z-10 mt-0 w-56 gap-1 p-1.5 " +
  "bg-base-100 text-base-content border border-base-300 " +
  "rounded-b-box rounded-tr-box shadow-raised";

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
      <ul class={panelClass}>{props.children}</ul>
    </details>
  );
}

/** A single entry inside a NavDropdown. */
function NavItem(props: { href: string; current?: boolean; children: JSX.Element }) {
  return (
    <li>
      <a
        href={props.href}
        class={props.current ? "bg-primary text-primary-content" : "hover:bg-base-200"}
        aria-current={props.current ? "page" : undefined}
      >
        {props.children}
      </a>
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
   * Whether a menu entry is the page being shown.
   *
   * Prefix rather than equality, so a sub-page still marks the section it
   * belongs to - /management/devices/3 is still "Geräte verwalten". "/" is
   * matched exactly, because otherwise it would be the prefix of everything.
   */
  const isCurrent = (href: string): boolean =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

  const sections: { label: string; items: { href: string; label: string }[] }[] = [
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
    ...(dataUser || managementUser || boardUser || adminUser
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
    { label: "Anleitungen", items: [PAGES.guideEsp32] },
    {
      label: "Entwicklung",
      items: [PAGES.apiDocs, PAGES.github],
    },
  ];

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
              current={section.items.some((item) => isCurrent(item.href))}
            >
              {section.items.map((item) => (
                <NavItem href={item.href} current={isCurrent(item.href)}>
                  {item.label}
                </NavItem>
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
          <ul class={`${panelClass} w-[min(18rem,calc(100vw-1.5rem))] max-h-[calc(100vh-5rem)] overflow-y-auto`}>
            {sections.map((section) => (
              <>
                <li class="menu-title text-base-content/70">{section.label}</li>
                {section.items.map((item) => (
                  <NavItem href={item.href} current={isCurrent(item.href)}>{item.label}</NavItem>
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
          overlap, and close them on outside click / Escape. */}
      <script>{`
        (function () {
          var menus = Array.prototype.slice.call(
            document.querySelectorAll("header details.dropdown")
          );
          menus.forEach(function (d) {
            d.addEventListener("toggle", function () {
              if (d.open) menus.forEach(function (o) { if (o !== d) o.open = false; });
            });
          });
          document.addEventListener("click", function (e) {
            menus.forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
          });
          document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") menus.forEach(function (d) { d.open = false; });
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
