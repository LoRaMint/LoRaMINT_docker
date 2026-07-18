/**
 * Browser "island" for the /plots page. Runs standalone (no SolidJS): populates
 * the filter dropdowns from /api/v1/measurements/metadata, fetches raw rows from
 * the existing CSV export, and draws them as connected lines with Plotly (loaded
 * globally by the preceding <script>). No aggregation, no error bars.
 */

// Plotly is provided globally by /public/vendor/plotly.min.js (classic script).
declare const Plotly: any;

const API = "/api/v1";

// Base colour per measurand; sensors within a measurand are told apart by dash.
const MEASURAND_COLORS = [
  "#1f77b4", "#d62728", "#2ca02c", "#9467bd",
  "#ff7f0e", "#17becf", "#8c564b", "#e377c2",
];
const SENSOR_DASHES = ["solid", "dot", "dash", "dashdot", "longdash"];
const Y_PADDING_FRACTION = 1 / 20;

type Metadata = {
  devices: string[];
  measurands: string[];
  sensors: string[];
  locations: string[];
};

type Point = { t: string; value: number };
type Series = { measurand: string; sensor: string; unit: string; points: Point[] };

// ---- DOM helpers ----------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const deviceSel = () => $<HTMLSelectElement>("device");
const locationSel = () => $<HTMLSelectElement>("location");
const measurandsBox = () => $<HTMLDivElement>("measurands");
const sensorsBox = () => $<HTMLDivElement>("sensors");
const layoutSel = () => $<HTMLSelectElement>("layout");
const fromInput = () => $<HTMLInputElement>("from");
const toInput = () => $<HTMLInputElement>("to");
const statusEl = () => $<HTMLSpanElement>("status");
const scaleInput = () => $<HTMLInputElement>("export-scale");
const formatSel = () => $<HTMLSelectElement>("export-format");

const setStatus = (msg: string) => {
  statusEl().textContent = msg;
};

const fillOptions = (sel: HTMLSelectElement, values: string[], keepFirst = false) => {
  const first = keepFirst ? sel.options[0] : null;
  sel.innerHTML = "";
  if (first) sel.appendChild(first);
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }
};

/** Renders a checkbox per value into a container; used for measurands/sensors. */
const fillCheckboxes = (container: HTMLDivElement, values: string[]) => {
  container.innerHTML = "";
  if (values.length === 0) {
    const hint = document.createElement("span");
    hint.className = "text-sm text-base-content/50";
    hint.textContent = "– keine –";
    container.appendChild(hint);
    return;
  }
  for (const v of values) {
    const label = document.createElement("label");
    label.className = "label cursor-pointer justify-start gap-2 py-0.5";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "checkbox checkbox-sm";
    cb.value = v;
    const span = document.createElement("span");
    span.className = "label-text";
    span.textContent = v;
    label.append(cb, span);
    container.appendChild(label);
  }
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
  deviceEui: string,
  measurand: string,
  location: string,
  sensors: string[],
  from: string,
  to: string,
): Promise<Series[]> {
  const params = new URLSearchParams();
  params.set("device_eui", deviceEui);
  params.set("measurand", measurand);
  if (location) params.set("location", location);
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());

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
    s.points.push({ t, value });
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
    margin: { l: 60, r: 60, t: 30, b: 60 },
    showlegend: true,
    legend: { orientation: "h" },
    hovermode: "x unified",
    xaxis: { type: "date", title: { text: "Zeit" } },
  };

  measurands.forEach((measurand, mi) => {
    const seriesList = groups.get(measurand)!;
    const color = MEASURAND_COLORS[mi % MEASURAND_COLORS.length] ?? "#1f77b4";
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
  const mode = layoutSel().value as "overlay" | "stacked";
  const from = fromInput().value;
  const to = toInput().value;

  if (!deviceEui) return setStatus("Bitte ein Gerät wählen.");
  if (measurands.length === 0) return setStatus("Bitte mindestens eine Messgröße wählen.");

  setStatus("Lade Daten …");
  try {
    const groups = new Map<string, Series[]>();
    for (const measurand of measurands) {
      const series = await fetchSeries(deviceEui, measurand, location, sensors, from, to);
      if (series.length > 0) groups.set(measurand, series);
    }

    if (groups.size === 0) {
      Plotly.purge("chart");
      return setStatus("Keine numerischen Datenpunkte für die Auswahl gefunden.");
    }

    const { traces, layout } = buildFigure(groups, mode);
    await Plotly.react("chart", traces, layout, { responsive: true, displaylogo: false });
    const total = traces.reduce((sum: number, t: any) => sum + t.x.length, 0);
    setStatus(`${traces.length} Serie(n), ${total} Punkte.`);
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
async function populateForDevice(deviceEui?: string, isInitial = false) {
  const meta = await fetchMetadata(deviceEui);
  if (isInitial) fillOptions(deviceSel(), meta.devices);
  fillCheckboxes(measurandsBox(), meta.measurands);
  fillCheckboxes(sensorsBox(), meta.sensors);
  fillOptions(locationSel(), meta.locations, /* keepFirst */ true);
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
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Fehler beim Aktualisieren.");
    }
  });
  $<HTMLButtonElement>("plot").addEventListener("click", plot);
  $<HTMLButtonElement>("download").addEventListener("click", downloadImage);
  formatSel().addEventListener("change", syncScaleEnabled);
  syncScaleEnabled();
}

init();
