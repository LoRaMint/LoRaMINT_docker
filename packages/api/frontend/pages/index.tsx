import { Hono } from "hono";
import { ssr } from "../../config/ssr";
import { legal } from "../../config";
import { measurements, logEntries } from "../../services";
import HomePage from "./home/page";
import PlotsPage from "./plots/page";
import ExportPage from "./export/page";
import StatusPage from "./status/page";
import ImpressumPage from "./impressum/page";
import DatenschutzPage from "./datenschutz/page";

const pages = new Hono();

pages.get(
  "/",
  ...ssr((c) => {
    c.get("page").title = "LoRaMINT";
    return <HomePage />;
  }),
);

pages.get(
  "/plots",
  ...ssr((c) => {
    c.get("page").title = "Plots";
    return <PlotsPage />;
  }),
);

pages.get(
  "/export",
  ...ssr((c) => {
    c.get("page").title = "CSV-Export";
    return <ExportPage />;
  }),
);

pages.get(
  "/status",
  ...ssr(async (c) => {
    c.get("page").title = "Status";
    const [sensors, logs] = await Promise.all([
      measurements.status(),
      logEntries.status(),
    ]);
    return <StatusPage sensors={sensors} logs={logs} />;
  }),
);

if (legal.impressum) {
  pages.get(
    "/impressum",
    ...ssr((c) => {
      c.get("page").title = "Impressum";
      return <ImpressumPage />;
    }),
  );
}

if (legal.datenschutz) {
  pages.get(
    "/datenschutz",
    ...ssr((c) => {
      c.get("page").title = "Datenschutz";
      return <DatenschutzPage />;
    }),
  );
}

export default pages;
