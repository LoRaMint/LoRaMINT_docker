import { Hono } from "hono";
import { ssr } from "../../config/ssr";
import HomePage from "./home/page";
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
  "/impressum",
  ...ssr((c) => {
    c.get("page").title = "Impressum";
    return <ImpressumPage />;
  }),
);

pages.get(
  "/datenschutz",
  ...ssr((c) => {
    c.get("page").title = "Datenschutz";
    return <DatenschutzPage />;
  }),
);

export default pages;
