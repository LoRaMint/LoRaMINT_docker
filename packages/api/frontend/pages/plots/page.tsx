import Layout from "../../components/layout/Layout";

/**
 * Interactive plot page. The markup is server-rendered (static shell); all
 * interactivity lives in the self-contained browser script /public/plots.js
 * (an "island"), which populates the dropdowns from /api/v1/measurements/metadata
 * and draws the chart with the self-hosted Plotly bundle. No SolidJS hydration.
 */
export default function PlotsPage() {
  const controlClass =
    "select select-bordered w-full";
  return (
    <Layout>
      <h2 class="text-xl font-bold border-b border-base-300 pb-2 mb-4 mt-8">
        Plots
      </h2>
      <p class="mb-6 max-w-2xl text-base-content/80">
        Messreihen interaktiv darstellen: Gerät, Messgrößen, Sensoren und
        Zeitraum wählen, dann die Datenpunkte als verbundene Linien plotten.
      </p>

      {/* Control panel */}
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 rounded-box border border-base-300 p-4 mb-6">
        <label class="form-control">
          <span class="label-text mb-1">Gerät (device_eui)</span>
          <select id="device" class={controlClass}></select>
        </label>

        <label class="form-control">
          <span class="label-text mb-1">Location</span>
          <select id="location" class={controlClass}>
            <option value="">– alle –</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text mb-1">Layout</span>
          <select id="layout" class={controlClass}>
            <option value="overlay">Überlagert (mehrere Y-Achsen)</option>
            <option value="stacked">Gestapelt (Einzeldiagramme)</option>
          </select>
        </label>

        <div class="form-control">
          <span class="label-text mb-1">Messgrößen</span>
          <div
            id="measurands"
            class="rounded-box border border-base-300 p-2 h-32 overflow-auto flex flex-col gap-1"
          ></div>
        </div>

        <div class="form-control">
          <span class="label-text mb-1">Sensoren (leer = alle)</span>
          <div
            id="sensors"
            class="rounded-box border border-base-300 p-2 h-32 overflow-auto flex flex-col gap-1"
          ></div>
        </div>

        <div class="grid gap-4 content-start">
          <label class="form-control">
            <span class="label-text mb-1">Von</span>
            <input id="from" type="datetime-local" class="input input-bordered w-full" />
          </label>
          <label class="form-control">
            <span class="label-text mb-1">Bis</span>
            <input id="to" type="datetime-local" class="input input-bordered w-full" />
          </label>
        </div>

        <div class="flex items-end gap-3 lg:col-span-3">
          <button id="plot" class="btn btn-primary">Plot</button>
          <span id="status" class="text-sm text-base-content/70"></span>
        </div>
      </div>

      {/* Chart target */}
      <div id="chart" class="w-full rounded-box border border-base-300" style="min-height: 32rem"></div>

      {/* Export controls */}
      <div class="mt-4">
        <div class="flex flex-wrap items-end gap-4">
          <label class="form-control flex flex-col items-start">
            <span class="label-text mb-1">Format</span>
            <select id="export-format" class="select select-bordered w-40">
              <option value="png">PNG (Pixel)</option>
              <option value="svg">SVG (Vektor)</option>
            </select>
          </label>
          <label class="form-control flex flex-col items-start">
            <span class="label-text mb-1">Auflösungsfaktor (1–5)</span>
            <input
              id="export-scale"
              type="number"
              min="1"
              max="5"
              step="1"
              value="4"
              class="input input-bordered w-40"
            />
          </label>
          <button id="download" class="btn btn-outline">Herunterladen</button>
        </div>
        <p class="text-sm text-base-content/60 mt-2">
          PNG: höhere Faktoren = schärfer, können je nach Browser aber
          fehlschlagen. SVG ist vektorbasiert und beliebig skalierbar (Faktor
          ohne Wirkung).
        </p>
      </div>

      {/* Island: self-hosted Plotly + our plotting logic. Loaded after the DOM. */}
      <script src="/public/vendor/plotly.min.js"></script>
      <script type="module" src="/public/plots.js"></script>
    </Layout>
  );
}
