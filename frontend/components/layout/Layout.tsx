import type { JSX } from "solid-js";

export default function Layout(props: { children: JSX.Element }) {
  return (
    <div class="min-h-screen flex flex-col">
      {/* Header */}
      <header class="navbar bg-base-200 px-4">
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
          <a
            href="/api/v1/docs"
            class="tab tab-lifted [--tab-border-color:theme(colors.base-300)] text-base-content/80 hover:text-base-content hover:[--tab-border-color:theme(colors.primary)]"
          >
            API Docs
          </a>
          <a
            href="https://sfz-bw.de"
            class="tab tab-lifted [--tab-border-color:theme(colors.base-300)] text-base-content/80 hover:text-base-content hover:[--tab-border-color:theme(colors.primary)]"
          >
            SFZ
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
        <div class="flex gap-4">
          <a href="/impressum" class="link link-hover">
            Impressum
          </a>
          <span> </span>
          <a href="/datenschutz" class="link link-hover">
            Datenschutz
          </a>
        </div>
        <img src="/public/logo_sfz.svg" alt="SFZ" class="h-10" />
      </footer>
    </div>
  );
}
