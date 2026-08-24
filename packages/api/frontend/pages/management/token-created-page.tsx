import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";

/**
 * The one moment the token's value exists in readable form.
 *
 * Only its hash is stored, so this page cannot be reached again and the value
 * cannot be looked up later - losing it means issuing a new token. Rendered
 * directly from the POST rather than after a redirect, because a redirect could
 * not carry it and keeping it somewhere to be fetched afterwards is exactly
 * what "shown once" is meant to avoid.
 */
export default function TokenCreatedPage(props: { name: string; value: string }) {
  return (
    <Layout>
      <PageHeading
        title="API-Token angelegt"
        back={{ href: "/management/tokens", label: "Zurück zu den Token" }}
      />

      <Notice tone="warning">
        <strong>Jetzt kopieren.</strong> Dieser Wert wird nur dieses eine Mal
        angezeigt. Gespeichert ist nur seine Prüfsumme – er lässt sich später
        nicht wiederherstellen. Wer ihn verliert, legt ein neues Token an.
      </Notice>

      <p class="mb-2 text-base-content/80">
        Der Wert für <strong>{props.name}</strong>:
      </p>

      <div class="rounded-box border border-base-300 bg-base-200 p-4 mb-6">
        <code class="font-mono text-sm break-all select-all">{props.value}</code>
      </div>

      <p class="mb-2 text-base-content/80">So wird er benutzt:</p>
      <div class="rounded-box border border-base-300 bg-base-200 p-4 mb-6 overflow-x-auto">
        <code class="font-mono text-sm whitespace-pre">
          {`curl -H "Authorization: Bearer ${props.value}" \\\n  https://…/api/v1/measurements/export`}
        </code>
      </div>

      <p class="max-w-3xl text-sm text-base-content/70">
        Das Token darf noch nichts lesen außer dem, was ohnehin öffentlich ist.
        Damit es an die Daten einer Gruppe kommt, muss diese Gruppe ihm auf der{" "}
        <a href="/management/tokens" class="link">
          Übersichtsseite
        </a>{" "}
        eine Freigabe erteilen.
      </p>
    </Layout>
  );
}
