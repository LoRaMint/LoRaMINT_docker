/**
 * Browser "island" for the /plots page. Runs standalone (no SolidJS): populates
 * the filter dropdowns from /api/v1/measurements/metadata, fetches raw rows from
 * the existing CSV export, and draws them as connected lines with Plotly (loaded
 * globally by the preceding <script>). No aggregation, no error bars.
 */

import { COMMON_ZONES, otherZones, wallClockIn } from "../../../lib/time-zone";
import { facetOptions, NO_GROUP, type Combination } from "../../../lib/facets";

// Plotly is provided globally by /public/vendor/plotly.min.js (classic script).
declare const Plotly: any;

const API = "/api/v1";

/**
 * The zone this plot is drawn in: the user's choice from the HTML shell, else
 * the browser's.
 *
 * This is the fix for the bug that prompted the whole timezone work. Plotly is
 * handed date strings and does **not** convert between zones, so feeding it the
 * `…Z` strings the CSV export produces drew a UTC axis while every other page
 * showed local time - an hour out in winter, two in summer, and consistent
 * enough that nobody spotted it. The local time therefore has to be inside the
 * value before Plotly sees it; see lib/time-zone.ts.
 */
const effectiveZone = (): string =>
  document.documentElement.dataset.timezone ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  "UTC";

const ZONE_STORAGE_KEY = "loramint.plots.timezone";

/** The zone the plot is currently drawn in: the picker, else the effective one. */
const plotZone = (): string => timezoneSel().value || effectiveZone();

/**
 * Fills the picker and restores the last choice.
 *
 * The first entry stays empty and means "my own zone" - which one that is can
 * only be known here, so it is written into the label rather than into the
 * value. Anything the user picks instead is remembered, because switching a plot
 * to UTC to compare it with somebody else is not a thing one wants to redo after
 * every reload.
 */
function setUpTimeZones() {
  const sel = timezoneSel();
  const own = effectiveZone();
  const first = sel.options[0];
  if (first) first.textContent = `Eigene Zeitzone (${own})`;

  // The likely answers first, then the rest behind a heading. A picker of four
  // hundred entries hides Europe/Berlin; a picker of eleven hides everything
  // else. Grouped, it does neither.
  const group = (label: string, zones: readonly string[]) => {
    const filtered = zones.filter((zone) => zone !== own);
    if (filtered.length === 0) return;
    const box = document.createElement("optgroup");
    box.label = label;
    for (const zone of filtered) {
      const opt = document.createElement("option");
      opt.value = zone;
      opt.textContent = zone;
      box.appendChild(opt);
    }
    sel.appendChild(box);
  };

  group("Häufig", COMMON_ZONES);
  group("Alle Zeitzonen", otherZones());

  try {
    const stored = localStorage.getItem(ZONE_STORAGE_KEY);
    if (stored) sel.value = stored;
  } catch {
    // Private browsing refuses storage; the picker simply starts at the default.
  }

  sel.addEventListener("change", () => {
    try {
      localStorage.setItem(ZONE_STORAGE_KEY, sel.value);
    } catch {
      // As above - not remembering the choice is not worth an error.
    }
  });
}

/**
 * Base colour per measurand; sensors within a measurand are told apart by dash.
 *
 * The order is the safety mechanism, not a preference: it is what keeps
 * neighbouring series apart for red-green colour blindness, and it must not be
 * reordered. The palette this replaced put red (#d62728) next to green
 * (#2ca02c), and under deuteranopia those two collapsed into the same olive -
 * which is exactly the pair a plot with two measurands draws first.
 *
 * Slot 1 sits on the brand hue (243°, the petrol of the logo) lightened until
 * it works as a data colour; the petrol itself is too dark and too grey for one.
 *
 * Two sets, because a colour that reads well on #f8f9fa does not on #141f27.
 * The theme is decided server-side and never changes without a reload, so
 * reading it once here is enough - see lib/theme.ts.
 */
const PALETTE_LIGHT = [
  "#0081c6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];
const PALETTE_DARK = [
  "#0090dc", "#d95926", "#199e70", "#c98500",
  "#d55181", "#008300", "#9085e9", "#e66767",
];
const MEASURAND_COLORS =
  document.documentElement.dataset.theme === "loramint-dark"
    ? PALETTE_DARK
    : PALETTE_LIGHT;
const SENSOR_DASHES = ["solid", "dot", "dash", "dashdot", "longdash"];
const Y_PADDING_FRACTION = 1 / 20;

type FilterOption = string | { value: string; label: string };

type Metadata = {
  devices: string[];
  measurands: string[];
  sensors: string[];
  locations: string[];
  groups: string[];
  combinations: Combination[];
};

/**
 * The metadata of the device currently chosen.
 *
 * Held here so narrowing one list by another costs nothing: every filter but
 * the device is applied to `combinations` in the browser, and only a change of
 * device goes back to the server.
 */
let current: Metadata | null = null;

type Point = { t: string; value: number };
type Series = { measurand: string; sensor: string; unit: string; points: Point[] };

// ---- DOM helpers ----------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const deviceSel = () => $<HTMLSelectElement>("device");
const locationSel = () => $<HTMLSelectElement>("location");
const groupSel = () => $<HTMLSelectElement>("group");
const publicSel = () => $<HTMLSelectElement>("public");
const measurandsBox = () => $<HTMLDivElement>("measurands");
const sensorsBox = () => $<HTMLDivElement>("sensors");
const layoutSel = () => $<HTMLSelectElement>("layout");
const timezoneSel = () => $<HTMLSelectElement>("timezone");
const fromInput = () => $<HTMLInputElement>("from");
const toInput = () => $<HTMLInputElement>("to");
const statusEl = () => $<HTMLSpanElement>("status");
const scaleInput = () => $<HTMLInputElement>("export-scale");
const formatSel = () => $<HTMLSelectElement>("export-format");

const setStatus = (msg: string) => {
  statusEl().textContent = msg;
};

/**
 * A bare string is its own label; the pair is for choices that are not data,
 * such as "ohne Gruppe".
 *
 * Keeps the current choice when it is still on offer. Rebuilding the options
 * used to drop it back to "– alle –" without a word, so a narrowing elsewhere
 * silently widened this filter - the opposite of what it looked like. Returns
 * the value that was dropped, so the caller can say so.
 */
const fillOptions = (
  sel: HTMLSelectElement,
  values: FilterOption[],
  keepFirst = false,
): string | null => {
  const previous = sel.value;
  const first = keepFirst ? sel.options[0] : null;
  sel.innerHTML = "";
  if (first) sel.appendChild(first);
  let kept = false;
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = typeof v === "string" ? v : v.value;
    opt.textContent = typeof v === "string" ? v : v.label;
    if (opt.value === previous) {
      opt.selected = true;
      kept = true;
    }
    sel.appendChild(opt);
  }
  return previous !== "" && !kept ? previous : null;
};

/**
 * Renders a checkbox per value into a container; used for measurands/sensors.
 *
 * Ticks stay ticked as long as the value is still offered - see fillOptions for
 * why. Returns the values that were checked and are now gone.
 */
const fillCheckboxes = (container: HTMLDivElement, values: string[]): string[] => {
  const previous = checkedValues(container);
  container.innerHTML = "";
  if (values.length === 0) {
    const hint = document.createElement("span");
    hint.className = "text-sm text-base-content/70";
    hint.textContent = "– keine –";
    container.appendChild(hint);
    return previous;
  }
  for (const v of values) {
    const label = document.createElement("label");
    label.className = "label cursor-pointer justify-start gap-2 py-0.5";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "checkbox checkbox-sm";
    cb.value = v;
    cb.checked = previous.includes(v);
    const span = document.createElement("span");
    span.className = "label-text";
    span.textContent = v;
    label.append(cb, span);
    container.appendChild(label);
  }
  return previous.filter((v) => !values.includes(v));
};

/** Values of all checked checkboxes inside a container. */
const checkedValues = (container: HTMLDivElement) =>
  Array.from(container.querySelectorAll<HTMLInputElement>("input:checked")).map(
    (cb) => cb.value,
  );

// ---- Minimal CSV parser (handles quotes, doubled quotes, embedded commas) --
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else if (c === "\r") {
      // ignore; handled by following \n
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---- Data loading ---------------------------------------------------------
async function fetchMetadata(deviceEui?: string): Promise<Metadata> {
  const url = deviceEui
    ? `${API}/measurements/metadata?device_eui=${encodeURIComponent(deviceEui)}`
    : `${API}/measurements/metadata`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Metadaten laden fehlgeschlagen (${res.status})`);
  return res.json();
}

/** Fetches the CSV export for one measurand and groups rows into series by sensor. */
async function fetchSeries(
  measurand: string,
  sensors: string[],
  filter: {
    deviceEui: string;
    location: string;
    group: string;
    isPublic: string;
    from: string;
    to: string;
  },
): Promise<Series[]> {
  const params = new URLSearchParams();
  params.set("device_eui", filter.deviceEui);
  params.set("measurand", measurand);
  if (filter.location) params.set("location", filter.location);
  if (filter.group) params.set("group_name", filter.group);
  if (filter.isPublic) params.set("public_read", filter.isPublic);
  if (filter.from) params.set("from", new Date(filter.from).toISOString());
  if (filter.to) params.set("to", new Date(filter.to).toISOString());

  const res = await fetch(`${API}/measurements/export?${params.toString()}`);
  if (!res.ok) throw new Error(`Export laden fehlgeschlagen (${res.status})`);
  const rows = parseCsv(await res.text());
  const header = rows[0];
  if (!header || rows.length < 2) return [];

  const col = (name: string) => header.indexOf(name);
  const iMeasurand = col("measurand");
  const iUnit = col("unit");
  const iSensor = col("sensor");
  const iValue = col("value");
  const iRecorded = col("recorded_at");
  const iCreated = col("created_at");

  const wanted = new Set(sensors);
  const bySensor = new Map<string, Series>();
  // Read once for the whole batch rather than per row: it is the same for all of
  // them, and changing it mid-series would put points on two different clocks.
  const zone = plotZone();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length <= iValue) continue;
    const sensor = row[iSensor] ?? "";
    if (wanted.size > 0 && !wanted.has(sensor)) continue;
    const value = parseFloat(row[iValue] ?? "");
    if (!Number.isFinite(value)) continue;
    const t = row[iRecorded] || row[iCreated];
    if (!t) continue;

    let s = bySensor.get(sensor);
    if (!s) {
      s = { measurand: row[iMeasurand] ?? measurand, sensor, unit: row[iUnit] ?? "", points: [] };
      bySensor.set(sensor, s);
    }
    // Converted here rather than at draw time, so the sort below and Plotly both
    // see the same value. It is a *naive* local timestamp with no Z and no
    // offset - that is the point, and it must never be turned back into a Date.
    s.points.push({ t: wallClockIn(t, zone), value });
  }

  const series = Array.from(bySensor.values());
  for (const s of series) s.points.sort((a, b) => a.t.localeCompare(b.t));
  return series;
}

// ---- Plotting -------------------------------------------------------------
function axisRef(index: number) {
  return index === 0 ? "y" : `y${index + 1}`;
}
function axisKey(index: number) {
  return index === 0 ? "yaxis" : `yaxis${index + 1}`;
}

function rangeWithPadding(values: number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * Y_PADDING_FRACTION || 1;
  return [lo - pad, hi + pad];
}

/** Builds Plotly traces + layout for the given per-measurand series groups. */
function buildFigure(groups: Map<string, Series[]>, mode: "overlay" | "stacked") {
  const measurands = Array.from(groups.keys());
  const n = measurands.length;
  const traces: any[] = [];
  const layout: any = {
    // Bottom margin sized for what actually stands there: two lines of tick
    // label (Plotly puts the date under the time) plus the axis title.
    margin: { l: 60, r: 60, t: 60, b: 80 },
    showlegend: true,
    /**
     * Above the plot, not below it.
     *
     * A horizontal legend left to Plotly lands just under the x axis, where the
     * axis title already is, and the two print on top of each other. Nudging it
     * further down does not fix it reliably: the legend's `y` is in paper
     * coordinates, so the distance it needs depends on the height of the plot -
     * which changes with the window and, in stacked mode, with the number of
     * measurands. Moving it to the top removes the collision by construction
     * rather than by a number that happens to work at one size.
     */
    legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0, xanchor: "left" },
    hovermode: "x unified",
    // The zone is always named here, even when it is the user's own, because a
    // plot is the one thing on this site that leaves it: downloaded as a PNG,
    // pasted into a report, compared with somebody else's. An unlabelled axis is
    // fine on screen and useless a week later.
    xaxis: {
      type: "date",
      title: { text: `Zeit (${plotZone()})`, standoff: 12 },
    },
  };

  measurands.forEach((measurand, mi) => {
    const seriesList = groups.get(measurand)!;
    const color = MEASURAND_COLORS[mi % MEASURAND_COLORS.length] ?? MEASURAND_COLORS[0]!;
    const unit = seriesList[0]?.unit ?? "";
    const allValues: number[] = [];

    seriesList.forEach((s, si) => {
      allValues.push(...s.points.map((p) => p.value));
      traces.push({
        type: "scatter",
        mode: "lines+markers",
        name: `${measurand} – ${s.sensor}`,
        x: s.points.map((p) => p.t),
        y: s.points.map((p) => p.value),
        line: { color, dash: SENSOR_DASHES[si % SENSOR_DASHES.length] ?? "solid", width: 1.5 },
        marker: { color, size: 5 },
        xaxis: "x",
        yaxis: axisRef(mi),
      });
    });

    const axis: any = {
      title: { text: unit ? `${measurand} (${unit})` : measurand, font: { color } },
      tickfont: { color },
    };
    if (allValues.length > 0) axis.range = rangeWithPadding(allValues);

    if (mode === "overlay") {
      const step = 0.06;
      const rightEnd = 1 - (n - 1) * step;
      layout.xaxis.domain = [0, rightEnd];
      if (mi === 0) {
        axis.side = "left";
      } else {
        axis.overlaying = "y";
        axis.side = "right";
        axis.anchor = "free";
        axis.position = rightEnd + (mi - 1) * step;
      }
    } else {
      // stacked: each measurand gets its own vertical band, shared x-axis.
      const gap = 0.06;
      const h = (1 - gap * (n - 1)) / n;
      const top = 1 - mi * (h + gap);
      axis.domain = [Math.max(0, top - h), top];
      axis.anchor = "x";
      // Draw the single shared x-axis at the bottom band.
      if (mi === n - 1) layout.xaxis.anchor = axisRef(mi);
    }

    layout[axisKey(mi)] = axis;
  });

  return { traces, layout };
}

async function plot() {
  const deviceEui = deviceSel().value;
  const measurands = checkedValues(measurandsBox());
  const sensors = checkedValues(sensorsBox());
  const location = locationSel().value;
  const group = groupSel().value;
  const isPublic = publicSel().value;
  const mode = layoutSel().value as "overlay" | "stacked";
  const from = fromInput().value;
  const to = toInput().value;

  if (!deviceEui) return setStatus("Bitte ein Gerät wählen.");
  if (measurands.length === 0) return setStatus("Bitte mindestens eine Messgröße wählen.");

  setStatus("Lade Daten …");
  try {
    const groups = new Map<string, Series[]>();
    for (const measurand of measurands) {
      const series = await fetchSeries(measurand, sensors, {
        deviceEui,
        location,
        group,
        isPublic,
        from,
        to,
      });
      if (series.length > 0) groups.set(measurand, series);
    }

    if (groups.size === 0) {
      Plotly.purge("chart");
      return setStatus("Keine numerischen Datenpunkte für die Auswahl gefunden.");
    }

    const { traces, layout } = buildFigure(groups, mode);
    await Plotly.react("chart", traces, layout, { responsive: true, displaylogo: false });
    const total = traces.reduce((sum: number, t: any) => sum + t.x.length, 0);
    // Naming what stayed empty rather than quietly drawing fewer curves than
    // were ticked. The lists rule out combinations that never occurred, but the
    // time range is not part of them - a valid pairing can still have nothing
    // in the chosen window, and that is worth saying.
    const empty = measurands.filter((m) => !groups.has(m));
    setStatus(
      `${traces.length} Serie(n), ${total} Punkte.` +
        (empty.length > 0 ? ` Keine Daten im Zeitraum für: ${empty.join(", ")}.` : ""),
    );
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Unbekannter Fehler.");
  }
}

/**
 * Downloads the current chart. PNG uses the chosen resolution factor (1–5);
 * SVG is vector-based, so the factor is ignored.
 */
function downloadImage() {
  const chart = $<HTMLDivElement>("chart");
  if (!(chart as any).data || (chart as any).data.length === 0) {
    return setStatus("Erst einen Plot erzeugen, dann herunterladen.");
  }
  const format = formatSel().value === "svg" ? "svg" : "png";
  const raw = Math.round(Number(scaleInput().value) || 4);
  const scale = Math.min(5, Math.max(1, raw));
  scaleInput().value = String(scale);
  Plotly.downloadImage(chart, { format, scale, filename: "loramint-plot" });
}

/** Greys out the resolution factor for SVG (where it has no effect). */
function syncScaleEnabled() {
  scaleInput().disabled = formatSel().value === "svg";
}

// ---- Wiring ---------------------------------------------------------------
/** What is chosen right now, in the shape lib/facets.ts expects. */
const currentSelection = () => ({
  measurands: checkedValues(measurandsBox()),
  sensors: checkedValues(sensorsBox()),
  location: locationSel().value,
  group: groupSel().value,
  isPublic: publicSel().value,
});

/**
 * Rebuilds every list but the device's from the combinations of the current
 * device, narrowed by everything already chosen.
 *
 * Runs entirely in the browser - the combinations came with the metadata, so
 * ticking a box costs no request. What falls out of a list because of the
 * narrowing is named rather than silently dropped.
 */
function narrowLists() {
  if (!current) return;
  const dropped = new Set<string>();

  // Repeated until it settles, because dropping a value changes what the other
  // lists may offer: the options were computed while it still counted, so a
  // pass that drops something has narrowed the rest too far. It terminates -
  // a pass only ever removes, and there is a finite amount to remove.
  for (let pass = 0; pass < 10; pass++) {
    const options = facetOptions(current.combinations, currentSelection());
    const gone = [
      ...fillCheckboxes(measurandsBox(), options.measurands),
      ...fillCheckboxes(sensorsBox(), options.sensors),
      fillOptions(locationSel(), options.locations, /* keepFirst */ true),
      // The sentinel is appended rather than taken from the data: NULLs do not
      // appear in a DISTINCT list, so nothing else could name those rows.
      fillOptions(
        groupSel(),
        [...options.groups, { value: NO_GROUP, label: "ohne Gruppe" }],
        /* keepFirst */ true,
      ),
    ].filter((v): v is string => v !== null);

    if (gone.length === 0) break;
    for (const value of gone) dropped.add(value);
  }

  if (dropped.size > 0) {
    setStatus(`Passt nicht mehr zur Auswahl und wurde abgewählt: ${[...dropped].join(", ")}.`);
  }
}

async function populateForDevice(deviceEui?: string, isInitial = false) {
  current = await fetchMetadata(deviceEui);
  if (isInitial) {
    fillOptions(deviceSel(), current.devices);
    // The select has no "– alle –" entry, so the browser has just selected the
    // first device on its own - without firing `change`. Fetching again for it
    // is what keeps the lists from showing every device's values underneath a
    // box that names one.
    const chosen = deviceSel().value;
    if (chosen) current = await fetchMetadata(chosen);
  }
  narrowLists();
}

async function init() {
  try {
    await populateForDevice(undefined, /* isInitial */ true);
  } catch (err) {
    return setStatus(err instanceof Error ? err.message : "Metadaten konnten nicht geladen werden.");
  }

  deviceSel().addEventListener("change", async () => {
    setStatus("Aktualisiere Auswahl …");
    try {
      await populateForDevice(deviceSel().value || undefined);
      // narrowLists may have left a message about what it dropped; only clear
      // the "Aktualisiere …" placeholder if it did not.
      if (statusEl().textContent === "Aktualisiere Auswahl …") setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Fehler beim Aktualisieren.");
    }
  });

  // Every other filter narrows the remaining lists, so each one has to be
  // listened to - group and public were not, which is why choosing a group left
  // the measurand and sensor lists showing values it had just filtered away.
  for (const el of [locationSel(), groupSel(), publicSel()]) {
    el.addEventListener("change", narrowLists);
  }
  for (const box of [measurandsBox(), sensorsBox()]) {
    box.addEventListener("change", narrowLists);
  }

  $<HTMLButtonElement>("plot").addEventListener("click", plot);
  $<HTMLButtonElement>("download").addEventListener("click", downloadImage);
  formatSel().addEventListener("change", syncScaleEnabled);
  setUpTimeZones();
  syncScaleEnabled();
}

init();
