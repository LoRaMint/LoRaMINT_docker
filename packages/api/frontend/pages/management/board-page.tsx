import Layout from "../../components/layout/Layout";
import TableFrame from "../../components/TableFrame";
import LocalTime from "../../components/LocalTime";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import Field from "../../components/Field";
import SectionHeading from "../../components/SectionHeading";
import type { DashboardEntry, Triple } from "../../../services/dashboard";
import { PAGES } from "../../../lib";

const PATH = "/management/board";

/** The min/max pair as a form's initial values: fixed entries show numbers, dynamic ones stay empty. */
const rangeValue = (n: number | null) => (n === null ? "" : String(n));

const distinct = (values: string[]): string[] => [...new Set(values)].sort();

/**
 * Curating the /board page: a compact table of the current entries, each
 * editable in place, plus a form to add another.
 */
export default function BoardManagePage(props: {
  entries: DashboardEntry[];
  /** (device_eui, sensor, measurand) triples actually present in the measurements table. */
  triples: Triple[];
  saved?: string;
  error?: string;
}) {
  return (
    <Layout>
      <PageHeading
        title={PAGES.boardManage.label}
        intro={
          <>
            Welche Messwerte auf der öffentlichen{" "}
            <a href="/board" class="link">
              /board
            </a>
            -Seite erscheinen und mit welcher Anzeige-Spanne.
          </>
        }
      />

      {props.saved && <Notice tone="success">{props.saved}</Notice>}
      {props.error && <Notice tone="error">{props.error}</Notice>}

      <TableFrame class="mb-8">
        <thead>
          <tr>
            <th>Device</th>
            <th>Sensor</th>
            <th>Messgröße</th>
            <th colspan={4}>Name / Spanne</th>
            <th>Angelegt</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {props.entries.length === 0 ? (
            <tr>
              <td colspan={9} class="text-base-content/60">
                Noch kein Dashboard-Eintrag.
              </td>
            </tr>
          ) : (
            props.entries.map((entry) => (
              <tr>
                <td class="font-mono text-sm">{entry.deviceEui}</td>
                <td>{entry.sensor}</td>
                <td>{entry.measurand}</td>
                <td colspan={4}>
                  <form
                    method="post"
                    action={`${PATH}/${entry.id}/update`}
                    class="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="device_eui" value={entry.deviceEui} />
                    <input type="hidden" name="sensor" value={entry.sensor} />
                    <input type="hidden" name="measurand" value={entry.measurand} />
                    <input
                      name="name"
                      value={entry.name}
                      placeholder="Name"
                      class="input input-sm w-32"
                    />
                    <label class="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        name="range_mode"
                        value="fixed"
                        checked={entry.rangeMode === "fixed"}
                      />
                      fest
                    </label>
                    <input
                      name="min_value"
                      type="number"
                      step="any"
                      value={rangeValue(entry.minValue)}
                      placeholder="Min"
                      class="input input-sm w-20"
                    />
                    <input
                      name="max_value"
                      type="number"
                      step="any"
                      value={rangeValue(entry.maxValue)}
                      placeholder="Max"
                      class="input input-sm w-20"
                    />
                    <label class="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        name="range_mode"
                        value="dynamic"
                        checked={entry.rangeMode === "dynamic"}
                      />
                      dynamisch
                    </label>
                    <button type="submit" class="btn btn-ghost btn-xs">
                      Übernehmen
                    </button>
                  </form>
                </td>
                <td class="whitespace-nowrap text-base-content/60">
                  <LocalTime at={entry.createdAt} />
                  {entry.createdBy && <> von {entry.createdBy}</>}
                </td>
                <td>
                  <form method="post" action={`${PATH}/${entry.id}/delete`}>
                    <button type="submit" class="btn btn-ghost btn-xs">
                      Entfernen
                    </button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableFrame>

      <SectionHeading>Neuer Eintrag</SectionHeading>

      <form method="post" action={PATH} class="max-w-3xl space-y-3">
        <Field label="Name" required class="max-w-md">
          <input name="name" required placeholder="Büro Nord" class="input w-full" />
        </Field>

        <Field label="Device-EUI" required class="max-w-md">
          <select id="board-device" name="device_eui" required class="select w-full font-mono">
            <option value="" disabled selected>
              – auswählen –
            </option>
            {distinct(props.triples.map((t) => t.deviceEui)).map((eui) => (
              <option value={eui}>{eui}</option>
            ))}
          </select>
        </Field>

        <Field label="Sensor" required class="max-w-md">
          <select id="board-sensor" name="sensor" required class="select w-full" disabled>
            <option value="" disabled selected>
              – erst Device wählen –
            </option>
          </select>
        </Field>

        <Field label="Messgröße" required class="max-w-md">
          <select id="board-measurand" name="measurand" required class="select w-full" disabled>
            <option value="" disabled selected>
              – erst Sensor wählen –
            </option>
          </select>
        </Field>

        <FieldGroupRangeMode />

        <button type="submit" class="btn btn-primary">
          Anlegen
        </button>
      </form>

      {/* Couples the three selects above so Sensor/Messgröße only ever offer
          combinations the chosen device actually sent - see the module comment
          on services/dashboard.ts's knownTriples. Both stay disabled and empty
          until there is something valid to put in them, so nothing outside a
          real combination can be chosen; createEntry checks the same rule again
          server-side for a direct POST. */}
      <script type="application/json" id="board-triples-data">
        {JSON.stringify(props.triples).replace(/</g, "\\u003c")}
      </script>
      <script>{CASCADE_SCRIPT}</script>
    </Layout>
  );
}

const CASCADE_SCRIPT = `(function () {
  var triples = JSON.parse(document.getElementById('board-triples-data').textContent);
  var deviceSel = document.getElementById('board-device');
  var sensorSel = document.getElementById('board-sensor');
  var measurandSel = document.getElementById('board-measurand');

  function uniq(values) {
    return values.filter(function (v, i) { return values.indexOf(v) === i; }).sort();
  }

  function fill(select, values, emptyText) {
    var current = select.value;
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.textContent = values.length === 0 ? emptyText : '– auswählen –';
    select.appendChild(placeholder);
    var kept = false;
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === current) { opt.selected = true; kept = true; }
      select.appendChild(opt);
    });
    placeholder.selected = !kept;
    select.disabled = values.length === 0;
  }

  function narrowSensor() {
    var device = deviceSel.value;
    fill(
      sensorSel,
      uniq(triples.filter(function (t) { return t.deviceEui === device; }).map(function (t) { return t.sensor; })),
      '– erst Device wählen –',
    );
    narrowMeasurand();
  }

  function narrowMeasurand() {
    var device = deviceSel.value, sensor = sensorSel.value;
    fill(
      measurandSel,
      uniq(triples.filter(function (t) { return t.deviceEui === device && t.sensor === sensor; }).map(function (t) { return t.measurand; })),
      '– erst Sensor wählen –',
    );
  }

  deviceSel.addEventListener('change', narrowSensor);
  sensorSel.addEventListener('change', narrowMeasurand);
  if (deviceSel.value) narrowSensor();
})();`;

/**
 * The fixed/dynamic choice, with both number fields always present: whichever
 * mode is not selected leaves its fields empty and the service treats that as
 * "dynamic" (see services/dashboard.ts's validateEntry). No client JS toggles
 * visibility - this stays a no-JS page like the rest of the site.
 */
function FieldGroupRangeMode() {
  return (
    <fieldset class="max-w-md space-y-2">
      <legend class="block text-sm mb-1 text-base-content/80">Spanne</legend>
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" name="range_mode" value="fixed" checked />
        fest:
        <input name="min_value" type="number" step="any" placeholder="Min" class="input input-sm w-20" />
        <input name="max_value" type="number" step="any" placeholder="Max" class="input input-sm w-20" />
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" name="range_mode" value="dynamic" />
        dynamisch aus der Messhistorie
      </label>
    </fieldset>
  );
}
