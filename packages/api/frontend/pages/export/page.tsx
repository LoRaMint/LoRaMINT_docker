import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import Field from "../../components/Field";

/**
 * CSV export page. The markup is server-rendered (static shell); all
 * interactivity lives in the self-contained browser script /public/export.js
 * (an "island"), which populates the dropdowns from /api/v1/measurements/metadata,
 * shows the matching row count, and downloads the filtered CSV from
 * /api/v1/measurements/export. No SolidJS hydration.
 */
export default function ExportPage() {
  const controlClass = "select w-full";
  return (
    <Layout>
      <PageHeading
        title="CSV-Export"
        intro={
          <>
            Messdaten gefiltert als CSV herunterladen: Gerät, Messgröße, Sensor,
            Location, Datentyp, Gruppe, Freigabe und Zeitraum wählen. Leere
            Felder bedeuten „alle".
          </>
        }
      />

      {/* Control panel */}
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 rounded-box border border-base-300 p-4 mb-6">
        <Field label={<>Gerät (device_eui)</>}>
<select id="device" class={controlClass}>
            <option value="">– alle –</option>
          </select>
</Field>

        <Field label={<>Messgröße</>}>
<select id="measurand" class={controlClass}>
            <option value="">– alle –</option>
          </select>
</Field>

        <Field label={<>Sensor</>}>
<select id="sensor" class={controlClass}>
            <option value="">– alle –</option>
          </select>
</Field>

        <Field label={<>Location</>}>
<select id="location" class={controlClass}>
            <option value="">– alle –</option>
          </select>
</Field>

        <Field label={<>Datentyp</>}>
<select id="datatype" class={controlClass}>
            <option value="">– alle –</option>
            <option value="float">float</option>
            <option value="integer">integer</option>
            <option value="string">string</option>
          </select>
</Field>

        {/* Filled by the island: the group names present, plus "ohne Gruppe". */}
        <Field label={<>Gruppe</>}>
<select id="group" class={controlClass}>
            <option value="">– alle –</option>
          </select>
</Field>

        <Field label={<>Öffentlich</>}>
<select id="public" class={controlClass}>
            <option value="">– alle –</option>
            <option value="true">ja</option>
            <option value="false">nein</option>
          </select>
</Field>

        <div class="grid gap-4 content-start">
          <Field label={<>Von</>}>
<input id="from" type="datetime-local" class="input w-full" />
</Field>
          <Field label={<>Bis</>}>
<input id="to" type="datetime-local" class="input w-full" />
</Field>
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
