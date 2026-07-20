import type { JSX } from "solid-js";
import { legal } from "../../../config";

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

export default function Layout(props: { children: JSX.Element }) {
  return (
    <div class="min-h-screen flex flex-col">
      {/* Header */}
      <header class="navbar bg-base-300 px-4">
        <div class="flex-1">
          <a href="/">
            <img src="/public/logo_loramint.svg" alt="LoRaMINT" class="h-14" />
          </a>
        </div>
        <nav class="tabs tabs-bordered">
          <NavDropdown label="Daten">
            <NavItem href="/plots">Plots</NavItem>
            <NavItem href="/export">Export</NavItem>
            <NavItem href="/status">Status</NavItem>
          </NavDropdown>
          <NavDropdown label="HowTo">
            <NavItem href="/guides/esp32">ESP32</NavItem>
          </NavDropdown>
          <NavDropdown label="Code">
            <NavItem href="/api/v1/docs">API Docs</NavItem>
            <NavItem href="https://github.com/LoRaMint/LoRaMINT_docker">
              GitHub
            </NavItem>
          </NavDropdown>
          {(legal.impressum || legal.datenschutz) && (
            <NavDropdown label="Kontakt">
              {legal.impressum && <NavItem href="/impressum">Impressum</NavItem>}
              {legal.datenschutz && (
                <NavItem href="/datenschutz">Datenschutz</NavItem>
              )}
            </NavDropdown>
          )}
        </nav>
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
    </div>
  );
}
