import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import Field, { FieldGroup } from "../../components/Field";

/**
 * Interactive plot page. The markup is server-rendered (static shell); all
 * interactivity lives in the self-contained browser script /public/plots.js
 * (an "island"), which populates the dropdowns from /api/v1/measurements/metadata
 * and draws the chart with the self-hosted Plotly bundle. No SolidJS hydration.
 */
export default function PlotsPage() {
  const controlClass =
    "select w-full";
  return (
    <Layout>
      <PageHeading
        title="Plots"
        intro={
          <>
            Messreihen interaktiv darstellen: Gerät, Messgrößen, Sensoren und
            Zeitraum wählen, dann die Datenpunkte als verbundene Linien plotten.
          </>
        }
      />

      {/* Control panel */}
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 rounded-box border border-base-300 p-4 mb-6">
        <Field label={<>Gerät (device_eui)</>}>
<select id="device" class={controlClass}></select>
</Field>

        <Field label={<>Location</>}>
<select id="location" class={controlClass}>
            <option value="">– alle –</option>
          </select>
</Field>

        <Field label={<>Layout</>}>
<select id="layout" class={controlClass}>
            <option value="overlay">Überlagert (mehrere Y-Achsen)</option>
            <option value="stacked">Gestapelt (Einzeldiagramme)</option>
          </select>
</Field>

        {/* Empty option = the effective zone, which only the browser knows.
            The island fills the label in and preselects it. A plot is the one
            thing here that leaves the site - downloaded, pasted into a report -
            so the zone is switchable and always named on the axis. */}
        <Field label={<>Zeitzone</>}>
<select id="timezone" class={controlClass}>
            <option value="">Eigene Zeitzone</option>
          </select>
</Field>

        <FieldGroup label="Messgrößen">
<div
            id="measurands"
            class="rounded-box border border-base-300 p-2 h-32 overflow-auto flex flex-col gap-1"
          ></div>
        </FieldGroup>

        <FieldGroup label="Sensoren (leer = alle)">
<div
            id="sensors"
            class="rounded-box border border-base-300 p-2 h-32 overflow-auto flex flex-col gap-1"
          ></div>
        </FieldGroup>

        <div class="grid gap-4 content-start">
          <Field label={<>Von</>}>
<input id="from" type="datetime-local" class="input w-full" />
</Field>
          <Field label={<>Bis</>}>
<input id="to" type="datetime-local" class="input w-full" />
</Field>
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
          <Field label={<>Format</>} class="flex flex-col items-start">
<select id="export-format" class="select w-40">
              <option value="png">PNG (Pixel)</option>
              <option value="svg">SVG (Vektor)</option>
            </select>
</Field>
          <Field label={<>Auflösungsfaktor (1–5)</>} class="flex flex-col items-start">
<input
              id="export-scale"
              type="number"
              min="1"
              max="5"
              step="1"
              value="4"
              class="input w-40"
            />
</Field>
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
