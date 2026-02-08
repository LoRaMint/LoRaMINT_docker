import { Hono } from "hono";
import { ssr } from "../../config/ssr";
import HomePage from "./home/page";

const pages = new Hono();

pages.get(
  "/",
  ...ssr((c) => {
    c.get("page").title = "LoRaMINT";
    return <HomePage />;
  }),
);

export default pages;
