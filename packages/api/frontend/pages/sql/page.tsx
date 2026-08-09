import Layout from "../../components/layout/Layout";
import TableFrame from "../../components/TableFrame";
import { maxRows, timeoutMs, type ConsoleResult } from "../../../services/query";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import { Muted } from "../../components/Row";

/**
 * The SQL console. One page for both roles: the data role opens it read-only,
 * the admin role with a connection that may write. The difference is which
 * database role the statement runs as, not what this page allows - so the page
 * cannot be talked into more than the caller may do.
 *
 * Submitted with POST, because a statement here may change data: a GET would be
 * repeated by a refresh, prefetched by the browser, and triggerable from a
 * foreign page by a link or an image tag.
 */

function Cell(props: { value: unknown }) {
  const v = props.value;
  if (v === null || v === undefined) {
    return <Muted>NULL</Muted>;
  }
  if (v instanceof Date) return <>{v.toISOString()}</>;
  if (typeof v === "object") return <>{JSON.stringify(v)}</>;
  return <>{String(v)}</>;
}

export default function SqlPage(props: {
  statement: string;
  /** True when the caller holds the admin role and may change data. */
  writable: boolean;
  result?: ConsoleResult | null;
  error?: string | null;
}) {
  return (
    <Layout>
      <PageHeading
        title="SQL-Konsole"
        intro={
          <>
            {props.writable ? (
              <>
                Beliebige Anweisungen auf der Messdatenbank – auch schreibende.
                Die Verbindung darf die Anwendungstabellen lesen und ändern, aber
                keine Tabellen anlegen oder löschen; Schemaänderungen bleiben den
                Migrationen vorbehalten.
              </>
            ) : (
              <>
                Beliebige Abfragen auf der Messdatenbank. Deine Verbindung darf
                ausschließlich lesen – schreibende Anweisungen weist die
                Datenbank ab, nicht erst diese Seite.
              </>
            )}{" "}
            Abfragen liefern eine Tabelle (höchstens {maxRows()} Zeilen)
            {props.writable ? ", andere Anweisungen eine Bestätigung" : ""}. Nach{" "}
            {timeoutMs() / 1000} Sekunden bricht eine Anweisung ab.
          </>
        }
      />
      <form method="post" action="/sql" class="mb-6">
        <label class="block">
          <span class="block text-sm mb-1 text-base-content/80">Anweisung</span>
          <textarea
            name="statement"
            rows="6"
            spellcheck={false}
            autocapitalize="none"
            class="textarea w-full font-mono text-sm"
            placeholder="SELECT * FROM measurements ORDER BY created_at DESC LIMIT 20"
          >
            {props.statement}
          </textarea>
        </label>
        {props.writable ? (
          <p class="text-warning text-sm mt-2 max-w-3xl">
            <strong>Achtung:</strong> Schreibende Anweisungen wirken sofort und
            lassen sich nicht rückgängig machen – es gibt kein
            Verlaufsprotokoll und keinen Papierkorb. Ein zu weit gefasstes WHERE
            bei UPDATE trifft mehr Zeilen als gedacht; führe dasselbe WHERE
            vorher einmal als SELECT aus. Vor einem DELETE wird nachgefragt, vor
            einem UPDATE nicht.
          </p>
        ) : (
          <p class="text-sm mt-2 max-w-3xl text-base-content/60">
            Nur lesend: Ändern und Löschen weist die Datenbank ab. Eine große
            Abfrage kostet trotzdem Rechenzeit – schränke sie mit WHERE ein,
            statt die Zeilenbegrenzung als Filter zu benutzen.
          </p>
        )}
        <button type="submit" class="btn btn-primary mt-3">
          Ausführen
        </button>
      </form>

      {props.error && (
        <p role="alert" class="text-error text-sm font-mono mb-4">
          {props.error}
        </p>
      )}

      {props.result?.kind === "confirm" && (
        <Notice tone="warning">
          <p class="mb-3">
            Diese Anweisung würde <strong>{props.result.affected}</strong> Zeile
            {props.result.affected === 1 ? "" : "n"} löschen. Sie wurde
            probeweise ausgeführt und wieder zurückgenommen – gelöscht ist noch
            nichts.
          </p>
          <form method="post" action="/sql" class="flex flex-wrap gap-3">
            <input type="hidden" name="statement" value={props.statement} />
            <input type="hidden" name="confirm" value="1" />
            <button type="submit" class="btn btn-error">
              {props.result.affected} Zeile
              {props.result.affected === 1 ? "" : "n"} endgültig löschen
            </button>
            <a href="/sql" class="btn btn-ghost">
              Abbrechen
            </a>
          </form>
        </Notice>
      )}

      {props.result?.kind === "command" && (
        <Notice tone="success">
          <strong>{props.result.command}</strong> ausgeführt –{" "}
          {props.result.affected} Zeile
          {props.result.affected === 1 ? "" : "n"} betroffen (
          {props.result.durationMs} ms).
        </Notice>
      )}

      {props.result?.kind === "rows" &&
        (props.result.rows.length === 0 ? (
          <p class="text-sm text-base-content/60">
            Die Abfrage lieferte keine Zeilen ({props.result.durationMs} ms).
          </p>
        ) : (
          <>
            <p class="text-sm text-base-content/60 mb-2">
              {props.result.rows.length} Zeile
              {props.result.rows.length === 1 ? "" : "n"} in{" "}
              {props.result.durationMs} ms
              {props.result.truncated && (
                <span class="text-warning"> – gekürzt auf die ersten {maxRows()}.</span>
              )}
            </p>
            <TableFrame>
                <thead>
                  <tr>
                    {props.result.columns.map((c) => (
                      <th>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {props.result.rows.map((row) => (
                    <tr>
                      {props.result!.kind === "rows" &&
                        props.result!.columns.map((c) => (
                          <td class="whitespace-nowrap">
                            <Cell value={row[c]} />
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
          </>
        ))}
    </Layout>
  );
}
