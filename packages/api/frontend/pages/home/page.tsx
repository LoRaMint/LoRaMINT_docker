import Layout from "../../components/layout/Layout";

export default function HomePage() {
  return (
    <Layout>
      {/* Hero */}
      <h2 class="text-xl font-bold border-b border-base-300 pb-2 mb-4 mt-8">
        LoRaMINT
      </h2>
      <div class="py-10 text-center">
        <img
          src="/public/logo_loramint.svg"
          alt="LoRaMINT"
          class="h-16 mx-auto mb-4"
        />
        <p class="max-w-xl mx-auto text-lg">
          Messdaten von LoRaWAN-Sensoren automatisch sammeln, speichern und
          auswerten.
        </p>
      </div>

      {/* Services */}
      <h2 class="text-xl font-bold border-b border-base-300 pb-2 mb-4 mt-12">
        Services
      </h2>
      <ul class="divide-y divide-base-300">
        <li class="flex items-center gap-4 py-3">
          <span class="text-xl">📖</span>
          <a
            href="/api/v1/docs"
            class="font-semibold text-primary hover:underline min-w-32"
          >
            API Docs
          </a>
          <span>Interaktive Dokumentation der REST-API zum Ausprobieren.</span>
        </li>
        <li class="flex items-center gap-4 py-3">
          <span class="text-xl">📊</span>
          <a
            href="/api/v1/measurements/export"
            class="font-semibold text-primary hover:underline min-w-32"
          >
            CSV-Export
          </a>
          <span>Alle Messdaten als Tabelle herunterladen.</span>
        </li>
        <li class="flex items-center gap-4 py-3">
          <span class="text-xl">💻</span>
          <a
            href="https://github.com/LoRaMint/LoRaMINT_docker"
            class="font-semibold text-primary hover:underline min-w-32"
          >
            GitHub
          </a>
          <span>Quellcode, Issues und Dokumentation.</span>
        </li>
      </ul>

      {/* Wie funktioniert es? */}
      <h2 class="text-xl font-bold border-b border-base-300 pb-2 mb-4 mt-12">
        Wie funktioniert es?
      </h2>

      <div class="grid gap-6 lg:grid-cols-2 items-start">
        <div>
          <img
            src="/public/lorawan.png"
            alt="LoRaWAN Datenfluss: Sensor, Gateway, The Things Network, LoRaMINT"
            class="w-full rounded-box border border-base-300"
          />
          <p class="text-sm text-base-content/70 mt-2">
            Der Datenfluss in LoRaMINT – von der Messung bis zur Auswertung.
          </p>
        </div>

        <div class="text-base leading-relaxed space-y-4">
          <details class="rounded-box border border-base-300 p-4">
            <summary class="cursor-pointer font-semibold">
              1) Sensoren (Nodes) und LoRa Gateway
            </summary>
            <p class="mt-2">
              Am Anfang stehen die <strong>Sensoren (Nodes)</strong>. Sie
              erfassen Werte wie Temperatur, Luftfeuchtigkeit, Luftdruck, etc.
              Mithilfe der energiesparenden LoRa-Funktechnologie senden sie ihre
              Daten über große Entfernungen an ein <strong>LoRa Gateway</strong>
              . Dabei wird ein für LoRaMINT typisches Datenformat verwendet. Das
              Gateway empfängt die Funksignale der Sensoren und leitet sie über
              das Internet weiter. Dabei wertet das Gateway die Daten nicht
              selbst aus, sondern fungiert ausschließlich als
              Weiterleitungsstelle.
            </p>
          </details>

          <details class="rounded-box border border-base-300 p-4">
            <summary class="cursor-pointer font-semibold">
              2) The Things Network (TTN)
            </summary>
            <p class="mt-2">
              Die empfangenen Daten werden anschließend von <strong>TTN</strong>{" "}
              verarbeitet. Der LoRaWAN-Server übernimmt die Geräteverwaltung,
              Sicherheitsfunktionen sowie das Entschlüsseln und Prüfen der
              Nachrichten. TTN versendet die geprüften Daten schließlich über
              Webhooks an das LoRaMINT-Backend.
            </p>
          </details>

          <details class="rounded-box border border-base-300 p-4">
            <summary class="cursor-pointer font-semibold">
              3) LoRaMINT-Backend &amp; Datenbank
            </summary>
            <p class="mt-2">
              Das LoRaMINT-Backend stellt die Daten zentral zur
              Weiterverarbeitung zur Verfügung. Es übernimmt die Aufbereitung
              und Validierung, bevor die Daten in eine{" "}
              <strong>Postgres-Datenbank</strong> gespeichert werden, welche
              direkt an LoRaMINT angebunden ist. Dadurch ist eine zuverlässige
              Langzeitspeicherung sowie ein effizienter Zugriff möglich.
            </p>
          </details>

          <details class="rounded-box border border-base-300 p-4">
            <summary class="cursor-pointer font-semibold">
              4) Zugriff über Endgeräte
            </summary>
            <p class="mt-2">
              Über <strong>Endgeräte</strong> wie Smartphones oder Laptops
              können Nutzer anschließend auf die Daten zugreifen. Über die
              LoRaMINT-Weboberfläche oder die API lassen sich aktuelle
              Messwerte, Zeitverläufe und Auswertungen anzeigen und
              weiterverarbeiten.
            </p>
          </details>
        </div>
      </div>
    </Layout>
  );
}
