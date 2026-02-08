import Layout from "../../components/layout/Layout";

const TemplateDatenschutz = () => {
  return (
    <div class="space-y-6">
      <p class="text-sm text-base-content/70">
        Hinweis: Dies ist ein Platzhalter. Bitte die folgenden Angaben vor
        Veröffentlichung ersetzen.
      </p>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">1. Verantwortliche Stelle</h2>
        <p>
          Betreiber / Verantwortliche Stelle
          <br />
          Vorname Nachname / Organisation
          <br />
          Straße Hausnummer
          <br />
          PLZ Ort
          <br />
          Land
          <br />
          E-Mail: kontakt@example.org
        </p>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">2. Hosting und Zugriffsdaten</h2>
        <p>
          Beim Aufruf dieser Website werden durch den Hosting-Anbieter
          automatisch Zugriffsdaten (z. B. IP-Adresse, Zeitpunkt, angeforderte
          Ressourcen) in Server-Logfiles gespeichert. Diese Daten dienen der
          technischen Bereitstellung und Sicherheit.
        </p>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">3. Kontaktaufnahme</h2>
        <p>
          Wenn Sie uns per E-Mail kontaktieren, werden Ihre Angaben zur
          Bearbeitung der Anfrage gespeichert. Eine Weitergabe erfolgt nicht
          ohne Ihre Einwilligung.
        </p>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">
          4. Rechte der betroffenen Personen
        </h2>
        <p>
          Sie haben das Recht auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung sowie Datenübertragbarkeit, soweit die
          gesetzlichen Voraussetzungen vorliegen.
        </p>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">5. Aktualität</h2>
        <p>Dieses Template ist zu ersetzen und zu aktualisieren.</p>
      </div>
    </div>
  );
};

const CustomLegalText = (props: { text: string }) => {
  return (
    <div class="whitespace-pre-wrap leading-relaxed text-base">
      {props.text}
    </div>
  );
};

const DatenschutzPage = () => {
  const customText = Bun.env.LEGAL_DATENSCHUTZ;

  return (
    <Layout>
      <h1 class="text-2xl font-bold border-b border-base-300 pb-2 mb-6 mt-8">
        Datenschutz
      </h1>
      {customText ? (
        <CustomLegalText text={customText} />
      ) : (
        <TemplateDatenschutz />
      )}
    </Layout>
  );
};

export default DatenschutzPage;
