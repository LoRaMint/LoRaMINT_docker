import Layout from "../../components/layout/Layout";

/**
 * CSV export page. The markup is server-rendered (static shell); all
 * interactivity lives in the self-contained browser script /public/export.js
 * (an "island"), which populates the dropdowns from /api/v1/measurements/metadata,
 * shows the matching row count, and downloads the filtered CSV from
 * /api/v1/measurements/export. No SolidJS hydration.
 */
export default function ExportPage() {
  const controlClass = "select select-bordered w-full";
  return (
    <Layout>
      <h2 class="text-xl font-bold border-b border-base-300 pb-2 mb-4 mt-8">
        CSV-Export
      </h2>
      <p class="mb-6 max-w-2xl text-base-content/80">
        Messdaten gefiltert als CSV herunterladen: Gerät, Messgröße, Sensor,
        Location, Datentyp und Zeitraum wählen. Leere Felder bedeuten „alle".
      </p>

      {/* Control panel */}
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 rounded-box border border-base-300 p-4 mb-6">
        <label class="form-control">
          <span class="label-text mb-1">Gerät (device_eui)</span>
          <select id="device" class={controlClass}>
            <option value="">– alle –</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text mb-1">Messgröße</span>
          <select id="measurand" class={controlClass}>
            <option value="">– alle –</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text mb-1">Sensor</span>
          <select id="sensor" class={controlClass}>
            <option value="">– alle –</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text mb-1">Location</span>
          <select id="location" class={controlClass}>
            <option value="">– alle –</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text mb-1">Datentyp</span>
          <select id="datatype" class={controlClass}>
            <option value="">– alle –</option>
            <option value="float">float</option>
            <option value="integer">integer</option>
            <option value="string">string</option>
          </select>
        </label>

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

        <div class="flex items-center gap-4 lg:col-span-3">
          <button id="download" class="btn btn-primary">CSV herunterladen</button>
          <span id="count" class="text-sm text-base-content/70"></span>
          <span id="status" class="text-sm text-base-content/50"></span>
        </div>
      </div>

      {/* Island: our export logic. Loaded after the DOM. */}
      <script type="module" src="/public/export.js"></script>
    </Layout>
  );
}
