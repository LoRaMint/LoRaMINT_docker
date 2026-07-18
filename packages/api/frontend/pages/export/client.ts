/**
 * Browser "island" for the /export page. Runs standalone (no SolidJS): populates
 * the filter dropdowns from /api/v1/measurements/metadata (cascading on the
 * selected device), shows how many measurements the current filter matches, and
 * downloads the matching CSV from the existing /api/v1/measurements/export
 * endpoint. Single-value filters, mirroring what that endpoint accepts.
 */

const API = "/api/v1";

type Metadata = {
  devices: string[];
  measurands: string[];
  sensors: string[];
  locations: string[];
};

// ---- DOM helpers ----------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const deviceSel = () => $<HTMLSelectElement>("device");
const measurandSel = () => $<HTMLSelectElement>("measurand");
const sensorSel = () => $<HTMLSelectElement>("sensor");
const locationSel = () => $<HTMLSelectElement>("location");
const datatypeSel = () => $<HTMLSelectElement>("datatype");
const fromInput = () => $<HTMLInputElement>("from");
const toInput = () => $<HTMLInputElement>("to");
const statusEl = () => $<HTMLSpanElement>("status");
const countEl = () => $<HTMLSpanElement>("count");

const setStatus = (msg: string) => {
  statusEl().textContent = msg;
};

/** Fills a select, keeping its first "– alle –" option. */
const fillOptions = (sel: HTMLSelectElement, values: string[]) => {
  const first = sel.options[0] ?? null;
  sel.innerHTML = "";
  if (first) sel.appendChild(first);
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }
};

// ---- Filter -> query params ----------------------------------------------
/** Collects the currently selected filters into URLSearchParams (empty omitted). */
function currentParams(): URLSearchParams {
  const params = new URLSearchParams();
  const device = deviceSel().value;
  const measurand = measurandSel().value;
  const sensor = sensorSel().value;
  const location = locationSel().value;
  const datatype = datatypeSel().value;
  const from = fromInput().value;
  const to = toInput().value;

  if (device) params.set("device_eui", device);
  if (measurand) params.set("measurand", measurand);
  if (sensor) params.set("sensor", sensor);
  if (location) params.set("location", location);
  if (datatype) params.set("datatype", datatype);
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());
  return params;
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

/** Asks the list endpoint for the total number of rows matching the filter. */
async function fetchCount(): Promise<number> {
  const params = currentParams();
  params.set("page", "1");
  params.set("per_page", "1");
  const res = await fetch(`${API}/measurements?${params.toString()}`);
  if (!res.ok) throw new Error(`Anzahl laden fehlgeschlagen (${res.status})`);
  const body = await res.json();
  return body?.pagination?.total ?? 0;
}

async function updateCount() {
  countEl().textContent = "…";
  try {
    const total = await fetchCount();
    countEl().textContent = `${total} Messwert(e) im Filter`;
  } catch (err) {
    countEl().textContent = err instanceof Error ? err.message : "Fehler beim Zählen.";
  }
}

// ---- Download -------------------------------------------------------------
function downloadCsv() {
  const url = `${API}/measurements/export?${currentParams().toString()}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "measurements.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus("Download gestartet.");
}

// ---- Wiring ---------------------------------------------------------------
async function populateForDevice(deviceEui?: string, isInitial = false) {
  const meta = await fetchMetadata(deviceEui);
  if (isInitial) fillOptions(deviceSel(), meta.devices);
  fillOptions(measurandSel(), meta.measurands);
  fillOptions(sensorSel(), meta.sensors);
  fillOptions(locationSel(), meta.locations);
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
    updateCount();
  });

  // Any filter change refreshes the hit counter.
  for (const el of [measurandSel(), sensorSel(), locationSel(), datatypeSel(), fromInput(), toInput()]) {
    el.addEventListener("change", updateCount);
  }

  $<HTMLButtonElement>("download").addEventListener("click", downloadCsv);
  updateCount();
}

init();
