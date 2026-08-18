import type { JSX } from "solid-js";
import { legal, auth, sqlConsole, board, setupAccount } from "../../../config";
import { currentScope, currentUser, hasRole } from "../../../lib";

const tabClass =
  "tab tab-lifted [--tab-border-color:theme(colors.base-300)] text-base-content/80 hover:text-base-content hover:[--tab-border-color:theme(colors.primary)]";

/** A no-JS nav dropdown (daisyUI `<details>` menu) with a chevron indicator. */
function NavDropdown(props: { label: string; children: JSX.Element }) {
  return (
    <details class="dropdown dropdown-end group">
      <summary class={`${tabClass} list-none cursor-pointer gap-1 marker:content-none [&::-webkit-details-marker]:hidden`}>
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
      <ul class="menu dropdown-content z-10 mt-2 w-44 gap-1 rounded-box bg-primary text-primary-content p-2 shadow-lg">
        {props.children}
      </ul>
    </details>
  );
}

/** A single entry inside a NavDropdown. */
function NavItem(props: { href: string; children: JSX.Element }) {
  return (
    <li>
      <a href={props.href} class="hover:bg-primary-content/15">
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
    return (
      <a href="/login" class="btn btn-primary btn-sm ml-4 gap-1.5">
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
  const dataRole = hasRole(user, "data", auth);
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
  const sections: { label: string; items: { href: string; label: string }[] }[] = [
    {
      label: "Daten",
      items: [
        { href: "/plots", label: "Plots" },
        { href: "/export", label: "Export" },
        { href: "/status", label: "Status" },
        ...(sqlConsole.enabled && user ? [{ href: "/sql", label: "SQL" }] : []),
      ],
    },
    // Public, unlike every section below it: /board has no login requirement,
    // so this must not be gated on `user` the way "Verwaltung" is. Board and
    // admin members get a second entry; everyone else sees one plain link.
    //
    // BOARD_ENABLED only switches the public page off - /management/board stays
    // reachable for curators either way, so the section survives with just that
    // one entry for them, and disappears entirely for anyone who is neither a
    // curator nor has a page to look at.
    ...(board.enabled || boardUser || adminUser
      ? [
          {
            label: "Dashboard",
            items: board.enabled
              ? boardUser || adminUser
                ? [
                    { href: "/board", label: "Dashboard ansehen" },
                    { href: "/management/board", label: "Dashboard managen" },
                  ]
                : [{ href: "/board", label: "Dashboard" }]
              : [{ href: "/management/board", label: "Dashboard managen" }],
          },
        ]
      : []),
    // The three areas no longer contain one another, so the section is built
    // from what this person actually holds rather than from one gate. Somebody
    // who only manages devices sees one entry here, and that is correct.
    ...(dataUser || dataRole || managementUser || adminUser
      ? [
          {
            label: "Verwaltung",
            items: [
              ...(dataUser
                ? [{ href: "/management/data", label: "Daten verwalten" }]
                : []),
              // The change log, not the data pages: it holds the full contents
              // of every changed row and has no group of its own, so it stays
              // with the role that may see every group anyway.
              ...(dataRole
                ? [{ href: "/management/data/audit", label: "Änderungsprotokoll" }]
                : []),
              ...(managementUser
                ? [{ href: "/management/devices", label: "Geräte verwalten" }]
                : []),
              // Administrators only: the page lists bind accounts, database
              // roles and the shape of every secret.
              ...(adminUser
                ? [
                    { href: "/management/groups", label: "Datengruppen" },
                    { href: "/management/config", label: "Konfiguration" },
                  ]
                : []),
            ],
          },
        ]
      : []),
    { label: "HowTo", items: [{ href: "/guides/esp32", label: "ESP32" }] },
    {
      label: "Code",
      items: [
        { href: "/api/v1/docs", label: "API Docs" },
        { href: "https://github.com/LoRaMint/LoRaMINT_docker", label: "GitHub" },
      ],
    },
  ];

  return (
    <div class="min-h-screen flex flex-col">
      {/* Header */}
      <header class="navbar bg-base-300 px-3 sm:px-4 gap-2">
        <div class="flex-1 min-w-0">
          <a href="/">
            {/* Smaller on a phone, where the header competes with the content. */}
            <img
              src="/public/logo_loramint.svg"
              alt="LoRaMINT"
              class="h-9 sm:h-14"
            />
          </a>
        </div>

        {/* Wide screens: one dropdown per section, side by side. */}
        <nav class="tabs tabs-bordered hidden md:flex">
          {sections.map((section) => (
            <NavDropdown label={section.label}>
              {section.items.map((item) => (
                <NavItem href={item.href}>{item.label}</NavItem>
              ))}
            </NavDropdown>
          ))}
        </nav>

        {/* Narrow screens: everything behind one button. Still a <details>, so
            it needs no JavaScript, and the existing script that closes the other
            menus picks it up along with them. */}
        <details class="dropdown dropdown-end group md:hidden">
          <summary
            class={`${tabClass} list-none cursor-pointer marker:content-none [&::-webkit-details-marker]:hidden px-2`}
            aria-label="Menü"
          >
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
          <ul class="menu dropdown-content z-10 mt-2 w-[min(18rem,calc(100vw-1.5rem))] gap-1 rounded-box bg-primary text-primary-content p-2 shadow-lg max-h-[calc(100vh-5rem)] overflow-y-auto">
            {sections.map((section) => (
              <>
                <li class="menu-title text-primary-content/60">{section.label}</li>
                {section.items.map((item) => (
                  <NavItem href={item.href}>{item.label}</NavItem>
                ))}
              </>
            ))}
            {loginPossible && (
              <>
                <li class="menu-title text-primary-content/60">Konto</li>
                {user ? (
                  <>
                    <NavItem href="/profile">{user.displayName}</NavItem>
                    <li>
                      {/* POST so a cross-site link cannot sign the user out. */}
                      <form method="post" action="/logout" class="p-0">
                        <button
                          type="submit"
                          class="w-full text-left px-4 py-2 rounded-lg hover:bg-primary-content/15"
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
            lives in the menu above, where there is room for the name. */}
        {loginPossible && (
          <div class="hidden md:block">
            <AuthControl />
          </div>
        )}
      </header>

      {/* Main Content */}
      <main class="flex-1 container mx-auto p-4">{props.children}</main>

      {/* Footer */}
      <footer class="bg-base-200 p-4 text-base-content flex flex-col items-center gap-2">
        {(legal.impressum || legal.datenschutz) && (
          <div class="flex gap-4">
            {legal.impressum && (
              <a href="/impressum" class="link link-hover">
                Impressum
              </a>
            )}
            {legal.impressum && legal.datenschutz && (
              <span> </span>
            )}
            {legal.datenschutz && (
              <a href="/datenschutz" class="link link-hover">
                Datenschutz
              </a>
            )}
          </div>
        )}
        <img src="/public/logo_loramint.svg" alt="LoRaMINT" class="h-10" />
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
