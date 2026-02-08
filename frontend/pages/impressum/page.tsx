import Layout from "../../components/layout/Layout";

const TemplateImpressum = () => {
  return (
    <div class="space-y-6">
      <p class="text-sm text-base-content/70">
        Hinweis: Dies ist ein Platzhalter. Bitte die folgenden Angaben vor
        Veröffentlichung ersetzen.
      </p>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">Angaben gemäß § 5 TMG</h2>
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
        </p>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">Kontakt</h2>
        <p>
          Telefon: +49 ...
          <br />
          E-Mail: kontakt@example.org
        </p>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">Vertretungsberechtigte</h2>
        <p>Geschäftsführer/in: Vorname Nachname</p>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">Registereintrag</h2>
        <p>
          Registergericht: Amtsgericht ...
          <br />
          Registernummer: HRB ...
        </p>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-semibold">Umsatzsteuer-ID</h2>
        <p>USt-IdNr.: DE...</p>
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

const ImpressumPage = () => {
  const customText = Bun.env.LEGAL_IMPRESSUM;

  return (
    <Layout>
      <h1 class="text-2xl font-bold border-b border-base-300 pb-2 mb-6 mt-8">
        Impressum
      </h1>
      {customText ? <CustomLegalText text={customText} /> : <TemplateImpressum />}
    </Layout>
  );
};

export default ImpressumPage;
