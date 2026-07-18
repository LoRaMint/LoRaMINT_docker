import type { JSX } from "solid-js";
import { legal } from "../../../config";

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
          <a
            href="/"
            class="tab tab-lifted [--tab-border-color:theme(colors.base-300)] text-base-content/80 hover:text-base-content hover:[--tab-border-color:theme(colors.primary)]"
          >
            Home
          </a>
          <details class="dropdown dropdown-end group">
            <summary class="tab tab-lifted list-none cursor-pointer gap-1 marker:content-none [&::-webkit-details-marker]:hidden [--tab-border-color:theme(colors.base-300)] text-base-content/80 hover:text-base-content hover:[--tab-border-color:theme(colors.primary)]">
              Daten
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
              <li>
                <a href="/plots" class="hover:bg-primary-content/15">Plots</a>
              </li>
              <li>
                <a href="/export" class="hover:bg-primary-content/15">Export</a>
              </li>
              <li>
                <a href="/status" class="hover:bg-primary-content/15">Status</a>
              </li>
            </ul>
          </details>
          <a
            href="/api/v1/docs"
            class="tab tab-lifted [--tab-border-color:theme(colors.base-300)] text-base-content/80 hover:text-base-content hover:[--tab-border-color:theme(colors.primary)]"
          >
            API Docs
          </a>
          <a
            href="https://github.com/LoRaMint/LoRaMINT_docker"
            class="tab tab-lifted [--tab-border-color:theme(colors.base-300)] text-base-content/80 hover:text-base-content hover:[--tab-border-color:theme(colors.primary)]"
          >
            GitHub
          </a>
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
    </div>
  );
}
