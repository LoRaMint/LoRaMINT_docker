import type { JSX } from "solid-js";
import TableFrame from "../../../components/TableFrame";
import Layout from "../../../components/layout/Layout";
import PageHeading from "../../../components/PageHeading";
import SectionHeading from "../../../components/SectionHeading";

/** A note / callout block (the "> …" blockquotes in the source guide). */
function Note(props: { children: JSX.Element }) {
  return (
    <div class="border-l-4 border-primary bg-base-200 rounded-r-box px-4 py-3 my-4 text-sm">
      {props.children}
    </div>
  );
}

/** A code block with a "copy" button (wired up by the client island). */
function Code(props: { children: string }) {
  return (
    <div class="relative my-4">
      <button
        type="button"
        class="copy-btn btn btn-xs btn-neutral absolute right-2 top-2 z-10"
      >
        Kopieren
      </button>
      <pre class="bg-neutral text-neutral-content rounded-box p-4 overflow-x-auto text-sm">
        <code>{props.children}</code>
      </pre>
    </div>
  );
}

/** A download button for a locally hosted file. */
function Download(props: { href: string; children: JSX.Element }) {
  return (
    <a href={props.href} download="" class="btn btn-sm btn-outline btn-primary gap-2">
      <span aria-hidden="true">⬇️</span>
      {props.children}
    </a>
  );
}

/** A clickable image that opens in a lightbox (wired up by the client island). */
function Figure(props: { src: string; alt: string; caption?: string }) {
  return (
    <figure class="my-5">
      <img
        src={props.src}
        alt={props.alt}
        loading="lazy"
        class="zoomable w-full rounded-box border border-base-300 cursor-zoom-in"
      />
      {props.caption && (
        <figcaption class="text-sm text-base-content/70 mt-1">
          {props.caption}
        </figcaption>
      )}
    </figure>
  );
}

const h2 = "text-xl font-bold border-b border-base-300 pb-2 mb-4 mt-12";
const p = "my-3 leading-relaxed text-base-content/90";

/**
 * ESP32 / Thonny getting-started guide. Server-rendered static content; all
 * interactivity (copy buttons, image lightbox) lives in /public/howto.js.
 * Downloadable code and images are served from /public/howto/.
 */
export default function AnleitungPage() {
  const DL = "/public/guides/esp32/downloads";
  const IMG = "/public/guides/esp32";
  return (
    <Layout>
      <article class="max-w-3xl mx-auto">
        <PageHeading title="HowTo / Daten mit ESP32 aufnehmen" />
        <p class={p}>
          Mit dieser Anleitung bringst du einen <strong>ESP32</strong> dazu, mit
          dem Funkmodul <strong>Dragino LA66</strong> Messwerte an das Netzwerk{" "}
          <strong>TTN</strong> und weiter ans <strong>LoRaMINT-Backend</strong>{" "}
          zu funken. Programmiert wird in der einsteigerfreundlichen App{" "}
          <a
            href="https://thonny.org/"
            target="_blank"
            rel="noopener"
            class="link link-primary"
          >
            Thonny
          </a>{" "}
          – ganz ohne Vorkenntnisse.
        </p>

        {/* 0 */}
        <h2 class={h2}>Materialien und Vorbereitungen</h2>
        <SectionHeading>Hardware</SectionHeading>
        <ul class="list-disc pl-6 space-y-1 text-base-content/90">
          <li>ESP32-Board (z. B. ESP32-S3) mit USB-Kabel</li>
          <li>
            Dragino LA66 Funkmodul mit <strong>Antenne</strong> (Antenne
            anschrauben!)
          </li>
          <li>ein paar Steckkabel (Jumperkabel)</li>
          <li>
            BME280-Sensor (für Temperatur-, Luftfeuchte- und Luftdruckmessung)
          </li>
        </ul>
        <Figure src={`${IMG}/parts.jpg`} alt="Die Bauteile im Überblick" caption="Die Bauteile im Überblick" />
        <Note>
          <strong>Das erledigt vorab eure Lehrkraft / euer Projektbetreuer</strong>{" "}, du musst dich nicht darum kümmern: Das Funkmodul (LA66) muss in der{" "}
          <strong>TTN-Konsole</strong> angemeldet sein (Schlüssel
          DevEUI/AppEUI/AppKey registrieren).
        </Note>

        {/* 1 */}
        <h2 class={h2}>1. Thonny und MicroPython einrichten</h2>
        <SectionHeading>Thonny installieren</SectionHeading>
        <p class={p}>
          Thonny ist das Programm, mit dem du auf deinem Computer Code schreibst
          und ihn auf das ESP32-Board überträgst.
        </p>
        <ol class="list-decimal pl-6 space-y-1 text-base-content/90">
          <li>
            Lade Thonny von{" "}
            <a href="https://thonny.org/" target="_blank" rel="noopener" class="link link-primary">
              thonny.org
            </a>{" "}
            herunter und installiere es (Windows/macOS/Linux).
          </li>
          <li>
            Starte Thonny. Ist die Oberfläche auf Englisch, kannst du unter{" "}
            <strong>Tools → Options → General → Language</strong> auf Deutsch
            umstellen.
          </li>
        </ol>

        <SectionHeading>MicroPython auf den ESP32 flashen</SectionHeading>
        <p class={p}>
          Damit das Board Python „versteht", spielst du ihm einmalig{" "}
          <strong>MicroPython</strong> auf – das ist eine abgespeckte
          Python-Version für kleine Mikrocontroller.
        </p>
        <ol class="list-decimal pl-6 space-y-2 text-base-content/90">
          <li>
            Verbinde das ESP32-Board per USB mit dem Computer.
            <Note>
              <strong>Board wird nicht gefunden?</strong> Dann fehlt der{" "}
              <strong>USB-Treiber</strong> (CP210x oder CH340). Installiere ihn
              und probiere ein anderes USB-Kabel (manche Kabel können nur laden,
              nicht Daten übertragen).
            </Note>
          </li>
          <li>
            Öffne <strong>Extras → Optionen → Interpreter</strong>.
          </li>
          <li>
            Wähle oben <strong>„MicroPython (ESP32)"</strong>.
          </li>
          <li>
            Wähle darunter den <strong>Port</strong> deines Boards – das ist der
            Anschluss, über den dein Computer mit dem Board spricht (①).
          </li>
        </ol>
        <Figure src={`${IMG}/thonny_interpreter.png`} alt="Interpreter wählen und Port setzen" />
        <ol class="list-decimal pl-6 space-y-2 text-base-content/90" start="5">
          <li>
            Klicke unten auf{" "}
            <strong>„MicroPython installieren oder aktualisieren"</strong> (②).
          </li>
          <li>
            Im Dialog <strong>Family</strong> und <strong>Variant</strong>{" "}
            passend zum Board wählen und auf <strong>Installieren</strong>{" "}
            klicken. Kommt ein Verbindungsfehler, halte die{" "}
            <strong>BOOT-Taste</strong> am Board gedrückt, während die
            Installation startet.
          </li>
        </ol>
        <Figure src={`${IMG}/thonny_flash.png`} alt="MicroPython installieren" />
        <ol class="list-decimal pl-6 text-base-content/90" start="7">
          <li>Danach den Dialog schließen und mit <strong>OK</strong> bestätigen.</li>
        </ol>

        <SectionHeading>Board mit Thonny verbinden</SectionHeading>
        <ol class="list-decimal pl-6 space-y-2 text-base-content/90">
          <li>
            Unten in Thonny erscheint die <strong>Shell</strong> – ein
            Eingabefeld mit dem Zeichen <code>&gt;&gt;&gt;</code>, in das du
            direkt Befehle tippen kannst. Fehlt sie, öffne noch einmal{" "}
            <strong>Extras → Optionen → Interpreter</strong>, prüfe den Port und
            drücke den roten <strong>Stopp-Knopf</strong>.
          </li>
          <li>Tippe zum Testen in die Shell:</li>
        </ol>
        <Code>{`print("Hallo ESP32")`}</Code>
        <p class={p}>
          Erscheint <code>Hallo ESP32</code>, klappt die Verbindung. 🎉
        </p>
        <Note>
          <strong>Wichtig – immer nur ein Programm am Port:</strong> Solange
          Thonny mit dem Board verbunden ist, darf kein anderes Programm den
          Port benutzen, sonst gibt es einen Fehler.
        </Note>

        {/* 2 */}
        <h2 class={h2}>2. Alles verkabeln</h2>
        <p class={p}>
          Damit ESP32 und Funkmodul miteinander reden können, verbindest du sie
          mit vier Kabeln (das nennt man <strong>UART</strong> – eine einfache
          serielle Verbindung). Wichtig: <strong>TX geht immer auf RX</strong>{" "}
          und umgekehrt (Senden ↔ Empfangen), sonst hören beide nicht zu. Die
          folgende Skizze zeigt die{" "}
          <strong>komplette Verkabelung inklusive BME280-Sensor</strong>.
        </p>
        <Figure src={`${IMG}/esp32_wiring.png`} alt="Verkabelung von ESP32, LA66 und BME280" caption="Verkabelung von ESP32, LA66 und BME280 (zum Vergrößern anklicken)" />
        <p class="font-semibold mt-4">ESP32 ↔ LA66 (Funkmodul)</p>
        <TableFrame class="my-3">
            <thead>
              <tr><th>ESP32</th><th>LA66</th></tr>
            </thead>
            <tbody>
              <tr><td><code>GPIO17</code> (TX = Senden)</td><td>RX (<code>PIN 11</code>)</td></tr>
              <tr><td><code>GPIO16</code> (RX = Empfangen)</td><td>TX (<code>PIN 10</code>)</td></tr>
              <tr><td><code>GND</code> (Minus)</td><td><code>GND</code></td></tr>
              <tr><td><code>3V3</code> (Strom)</td><td><code>3V3</code></td></tr>
            </tbody>
          </TableFrame>

        {/* 3 */}
        <h2 class={h2}>3. Die loramint-Bibliothek auf das Board laden</h2>
        <p class={p}>
          <code>loramint</code> ist unsere fertige Programm-Bibliothek. Sie
          übernimmt das komplizierte Funken, damit dein Code kurz bleibt. Du
          kopierst den Ordner <code>loramint/</code> auf das Board:
        </p>
        <ol class="list-decimal pl-6 space-y-1 text-base-content/90">
          <li>
            Lade die Bibliothek herunter (Button unten) und aktiviere in Thonny{" "}
            <strong>Ansicht → Dateien</strong>. Es erscheinen zwei Bereiche:
            oben <strong>dein Computer</strong>, unten das{" "}
            <strong>„MicroPython device"</strong> (das Board).
          </li>
          <li>Entpacke die ZIP und gehe im oberen Bereich in den Ordner mit den Dateien.</li>
          <li>
            <strong>Rechtsklick</strong> auf den Ordner <code>loramint</code> →{" "}
            <strong>„Upload nach /"</strong>.
          </li>
          <li>
            Unten (auf dem Gerät) muss danach der Ordner <code>loramint</code>{" "}
            auftauchen.
          </li>
        </ol>
        <Figure src={`${IMG}/thonny_upload.png`} alt="loramint-Ordner in Thonny hochladen" />
        <div class="my-4">
          <Download href={`${DL}/loramint.zip`}>loramint-Bibliothek (ZIP)</Download>
        </div>

        {/* 4 */}
        <h2 class={h2}>4. Verbindung zum LA66 testen</h2>
        <p class={p}>
          Bevor du funkst, prüfst du kurz, ob ESP32 und LA66 sich „hören". Lege
          in Thonny ein neues Skript an (<strong>Datei → Neu</strong>) und
          schreibe:
        </p>
        <Code>{`from loramint import LoRaMINT

lora = LoRaMINT()          # Standard: TX=GPIO17, RX=GPIO16
lora.check_connection()    # gibt eine Statusmeldung aus`}</Code>
        <p class={p}>
          Führe das Programm aus (grüner Play-Knopf oder Taste <strong>F5</strong>
          ). In der Shell sollte eine Erfolgsmeldung mit der Firmware-Version des
          LA66 erscheinen. Kommt keine Antwort:
        </p>
        <ul class="list-disc pl-6 space-y-1 text-base-content/90">
          <li>Verkabelung prüfen (TX↔RX gekreuzt? GND verbunden?),</li>
          <li>
            oder andere Pins angeben:{" "}
            <code>LoRaMINT(uart_id=1, tx=4, rx=5)</code>.
          </li>
        </ul>

        {/* 5 */}
        <h2 class={h2}>5. Messwerte mit dem BME280 senden</h2>
        <p class={p}>
          Jetzt sendest du echte Messwerte. Das fertige Programm{" "}
          <code>lightsleep/send_bme280.py</code> liest den BME280-Sensor aus und
          funkt <strong>Temperatur, Luftfeuchte und Luftdruck</strong> einmal pro
          Minute.
        </p>
        <ol class="list-decimal pl-6 space-y-3 text-base-content/90">
          <li>
            <strong>BME280 anschließen.</strong> Der Sensor ist in der
            Verkabelungs-Skizze (Abschnitt 2) bereits enthalten – schließe ihn
            wie dort gezeigt über <strong>I2C</strong> an:{" "}
            <strong>SDA an GPIO10</strong>, <strong>SCL an GPIO11</strong> sowie{" "}
            <strong>GND</strong> und <strong>3V3</strong> (Sensor-Adresse{" "}
            <code>0x76</code>).
          </li>
          <li>
            <strong>Sensor-Treiber laden.</strong> Der BME280-Treiber gehört
            nicht zu uns, sondern ist fertiger Fremdcode. Lade eine Treiberdatei
            herunter und lege sie – genau wie in Schritt 3 über{" "}
            <strong>Ansicht → Dateien</strong> – als <code>bme280.py</code> auf
            das Board.
            <Note>
              🔗 <strong>Fremdcode:</strong>{" "}
              <a href="https://github.com/robert-hh/BME280" target="_blank" rel="noopener" class="link link-primary">
                robert-hh/BME280 auf GitHub
              </a>{" "}
              – lade dort die passende Treiberdatei (z. B.{" "}
              <code>bme280_float.py</code>) herunter und{" "}
              <strong>speichere sie auf dem Board als <code>bme280.py</code></strong>{" "}
              (so heißt sie im Beispiel).
            </Note>
          </li>
          <li>
            <strong>Programm öffnen und starten:</strong>{" "}
            <code>lightsleep/send_bme280.py</code> in Thonny öffnen, die Pins
            ggf. anpassen und starten (grüner Play-Knopf oder <strong>F5</strong>).
            In der Shell siehst du:
            <ul class="list-disc pl-6 mt-1">
              <li><code>Joining LoRaWAN network...</code> – das Board meldet sich im Funknetz an</li>
              <li><code>Joined.</code> (kann bis zu einer Minute dauern)</li>
              <li>
                danach die drei Messwerte im Abstand von etwa 15 Sekunden, und
                das im Minutentakt:{" "}
                <code>Measurement sent: Temperatur 21.5 *C</code>
              </li>
            </ul>
            <Note>
              💡 <strong>Warum aus dem Ordner <code>lightsleep</code>?</strong>{" "}
              Jedes Beispiel gibt es zweimal. Die Fassungen in{" "}
              <code>deepsleep/</code> sind sparsamer, dafür{" "}
              <strong>startet der ESP32 zwischen den Messungen neu</strong> – die
              Verbindung zu Thonny bricht dann ab und du siehst nichts mehr. Die
              Fassungen in <code>lightsleep/</code> laufen einfach weiter, die
              Shell bleibt verbunden. Zum Ausprobieren also{" "}
              <code>lightsleep/</code>, und wenn das Gerät später allein irgendwo
              hängt, <code>deepsleep/</code>.
            </Note>
          </li>
        </ol>
        <div class="flex flex-wrap gap-2 my-4">
          <Download href={`${DL}/lightsleep/send_bme280.py`}>send_bme280.py</Download>
          <Download href={`${DL}/lightsleep/send_ds18b20.py`}>send_ds18b20.py</Download>
          <Download href={`${DL}/lightsleep/main.py`}>main.py (ohne Sensor)</Download>
        </div>
        <p class={`${p} text-sm`}>
          Für den Dauerbetrieb dieselben drei Programme in der sparsamen
          Fassung:{" "}
          <a href={`${DL}/deepsleep/send_bme280.py`} class="link link-primary">send_bme280.py</a>,{" "}
          <a href={`${DL}/deepsleep/send_ds18b20.py`} class="link link-primary">send_ds18b20.py</a>,{" "}
          <a href={`${DL}/deepsleep/main.py`} class="link link-primary">main.py</a>{" "}
          (Deep Sleep).
        </p>
        <p class={p}>
          Klappt die Anmeldung nicht (<code>txTimeout</code>), wurde zwar
          gefunkt, aber kein Gateway hat geantwortet – Schlüssel in TTN und die
          Antenne prüfen.
        </p>

        <SectionHeading>Damit das Programm nach dem Einschalten von allein läuft</SectionHeading>
        <p class={p}>
          Ein Programm mit dem Namen <code>main.py</code> startet der ESP32
          automatisch, sobald er Strom bekommt. So speicherst du dein Beispiel
          als <code>main.py</code> auf das Board:
        </p>
        <ol class="list-decimal pl-6 space-y-1 text-base-content/90">
          <li>Das geöffnete Beispiel über <strong>Datei → Speichern unter</strong> sichern.</li>
          <li>Als Ort <strong>„MicroPython-Gerät"</strong> wählen.</li>
          <li>Als Dateiname <code>main.py</code> eingeben.</li>
          <li>Board neu starten (Reset-Taste) → das Programm läuft von allein.</li>
        </ol>
        <Note>
          🔋 <strong>Jetzt lohnt sich <code>deepsleep/</code>.</strong> Wenn das
          Board dauerhaft laufen soll – besonders an einer Batterie – nimm die
          gleichnamige Datei aus dem Ordner <code>deepsleep/</code> statt der aus{" "}
          <code>lightsleep/</code>. Sie macht dasselbe, verbraucht zwischen den
          Messungen aber nur einen Bruchteil. Dass der ESP32 dabei jedes Mal neu
          startet, stört ohne Thonny nicht mehr.
        </Note>
        <Note>
          🔌 <strong>Und wie kommst du da wieder raus?</strong> Ein Board im
          Deep-Sleep-Takt ist pro Minute nur zwei, drei Sekunden ansprechbar –
          Stoppen wird zur Glückssache. Deshalb haben die{" "}
          <code>deepsleep/</code>-Programme eine <strong>Stopp-Brücke</strong>:
          Lege einen Draht zwischen <strong>GPIO5 und GND</strong> und starte das
          Board neu, dann läuft der Zyklus gar nicht erst an und du bekommst die
          Konsole zurück. Draht abziehen, neu starten – und es misst wieder.
          Welcher Pin das ist, steht oben im Programm als <code>STOP_PIN</code>.
        </Note>
        <Note>
          Zum <strong>Stoppen</strong> eines automatisch laufenden Programms den
          Stopp-Knopf drücken oder in der Shell <strong>Strg + C</strong>.
        </Note>

        {/* 6 */}
        <h2 class={h2}>6. Wenn etwas nicht klappt</h2>
        <details class="collapse collapse-arrow border border-base-300 rounded-box bg-base-100 my-3">
          <summary class="collapse-title font-semibold">Häufige Probleme &amp; Lösungen</summary>
          <div class="collapse-content overflow-x-auto">
            <table class="table">
              <thead>
                <tr><th>Problem</th><th>Lösung</th></tr>
              </thead>
              <tbody>
                <tr><td>Board erscheint unter keinem Port</td><td>USB-Treiber (CP210x/CH340) installieren, anderes USB-Kabel testen</td></tr>
                <tr><td>„Could not connect" beim Flashen</td><td><strong>BOOT-Taste</strong> gedrückt halten, während die Installation startet</td></tr>
                <tr><td>Verbindung / Port belegt</td><td>anderes Programm am Port schließen – nur Thonny darf ihn nutzen</td></tr>
                <tr><td><code>check_connection</code> meldet nichts</td><td>Verkabelung prüfen: TX↔RX gekreuzt, GND verbunden, richtige Pins</td></tr>
                <tr><td>Anmeldung <code>txTimeout</code></td><td>Schlüssel in TTN prüfen, Antenne anschließen, in Gateway-Reichweite gehen</td></tr>
                <tr><td>Zweite Nachricht schlägt fehl</td><td>zu schnell hintereinander gefunkt – mindestens ~10 Sekunden warten</td></tr>
                <tr><td>Umlaute kommen falsch an</td><td>nur einfache Zeichen senden (<code>"*C"</code> statt <code>"°C"</code>)</td></tr>
              </tbody>
            </table>
          </div>
        </details>

        <div class="border-l-4 border-success bg-base-200 rounded-r-box px-4 py-3 my-6">
          Geschafft! 🎉 Dein ESP32 funkt jetzt Messwerte über den LA66 an TTN,
          und das LoRaMINT-Backend speichert sie. Deine Daten kannst du dir live
          als Diagramm ansehen:{" "}
          <a href="/plots" class="link link-primary font-semibold">
            zu den Plots
          </a>{" "}
          (sowie unter <a href="/export" class="link link-primary">Export</a> und{" "}
          <a href="/status" class="link link-primary">Status</a>).
        </div>
      </article>

      {/* Island: copy buttons + image lightbox. */}
      <script type="module" src="/public/guide-esp32.js"></script>
    </Layout>
  );
}
