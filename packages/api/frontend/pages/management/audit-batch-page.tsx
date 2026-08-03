import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/manage/PageHeading";
import { actionLabel, revertState, tableLabel, tablePath } from "./audit-labels";

/**
 * One operation, change by change.
 *
 * The list shows what happened; this shows what it did. Each change can be taken
 * back on its own here - a bulk deletion where two of four hundred rows were
 * actually wanted is undone for those two, and the rest stays gone.
 *
 * An entry that has already been taken back says so and names the entry that did
 * it, so the chain can be followed in both directions without leaving the page.
 */

const PATH = "/management/data/audit";

/** The field-by-field difference an update recorded. */
function FieldDiff(props: { fields: Record<string, { from: unknown; to: unknown }> }) {
  return (
    <ul class="space-y-1">
      {Object.entries(props.fields).map(([column, change]) => (
        <li class="font-mono text-xs">
          <span class="text-base-content/60">{column}:</span>{" "}
          {change.from === null ? (
            <span class="text-base-content/40 italic">leer</span>
          ) : (
            String(change.from)
          )}{" "}
          →{" "}
          {change.to === null ? (
            <span class="text-base-content/40 italic">leer</span>
          ) : (
            String(change.to)
          )}
        </li>
      ))}
    </ul>
  );
}

/** The whole row a deletion removed or a restoration brought back. */
function RowSnapshot(props: { row: Record<string, unknown>; summary: string }) {
  return (
    <details>
      <summary class="cursor-pointer text-sm">{props.summary}</summary>
      <ul class="mt-1 space-y-1">
        {Object.entries(props.row).map(([column, value]) => (
          <li class="font-mono text-xs">
            <span class="text-base-content/60">{column}:</span>{" "}
            {value === null ? (
              <span class="text-base-content/40 italic">leer</span>
            ) : (
              String(value)
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Changes(props: { action: string; changes: unknown }) {
  const changes = (props.changes ?? {}) as Record<string, unknown>;
  if (props.action === "update" && changes.fields) {
    return <FieldDiff fields={changes.fields as Record<string, { from: unknown; to: unknown }>} />;
  }
  if (changes.before) {
    return (
      <RowSnapshot
        row={changes.before as Record<string, unknown>}
        summary="entfernte Zeile ansehen"
      />
    );
  }
  if (changes.after) {
    return (
      <RowSnapshot
        row={changes.after as Record<string, unknown>}
        summary="wiederhergestellte Zeile ansehen"
      />
    );
  }
  return <span class="text-base-content/40 italic">nichts aufgezeichnet</span>;
}

export default function AuditBatchPage(props: {
  /** All entries of this operation, oldest first. */
  entries: Record<string, unknown>[];
  canRevert: boolean;
  /** The list this was opened from, so "zurück" lands where one came from. */
  view: string;
  message?: string | null;
}) {
  const first = props.entries[0] ?? {};
  const reverted = props.entries.filter((entry) => entry.reverted_by !== null).length;
  const state = revertState(props.entries.length, reverted);
  const batchId = String(first.batch_id ?? "");

  return (
    <Layout>
      <PageHeading
        title="Vorgang"
        back={{ href: `${PATH}${props.view}`, label: "Änderungsprotokoll" }}
      />

      <dl class="grid sm:grid-cols-[12rem_1fr] gap-y-1 mb-6 max-w-3xl">
        <dt class="text-base-content/70">Zeitpunkt</dt>
        <dd>{first.occurred_at instanceof Date ? first.occurred_at.toISOString() : ""}</dd>
        <dt class="text-base-content/70">Benutzer</dt>
        <dd>{String(first.display_name ?? first.username ?? "")}</dd>
        <dt class="text-base-content/70">Aktion</dt>
        <dd>
          {actionLabel(first.action)} in{" "}
          <a href={tablePath(first.table_name)} class="link">
            {tableLabel(first.table_name)}
          </a>
        </dd>
        <dt class="text-base-content/70">Betroffene Zeilen</dt>
        <dd>{props.entries.length}</dd>
        <dt class="text-base-content/70">Grund</dt>
        <dd>{first.reason ? String(first.reason) : <span class="italic text-base-content/40">keiner</span>}</dd>
        <dt class="text-base-content/70">Zustand</dt>
        <dd>
          <span class={`badge ${state.tone}`}>{state.label}</span>
        </dd>
      </dl>

      <form method="post" action={`${PATH}/revert`}>
        <input type="hidden" name="view" value={props.view} />

        {props.canRevert && reverted < props.entries.length && (
          <div class="flex flex-wrap items-center gap-3 mb-3">
            <button type="submit" name="batch" value={batchId} class="btn btn-sm btn-error btn-outline">
              Ganzen Vorgang zurücknehmen
            </button>
            <span class="text-sm text-base-content/60">
              Oder unten einzelne Änderungen – der Vorgang bleibt in beiden Fällen im
              Protokoll stehen.
            </span>
          </div>
        )}

        <div class="overflow-x-auto rounded-box border border-base-300">
          <table class="table table-sm table-zebra">
            <thead>
              <tr>
                <th>Datenzeile</th>
                <th>Änderung</th>
                <th>Zustand</th>
                {props.canRevert && <th class="text-right">Aktion</th>}
              </tr>
            </thead>
            <tbody>
              {props.entries.length === 0 ? (
                <tr>
                  <td colspan={props.canRevert ? 4 : 3} class="text-center text-base-content/60 py-6">
                    Diesen Vorgang gibt es nicht.
                  </td>
                </tr>
              ) : (
                props.entries.map((entry) => {
                  const entryId = String(entry.id ?? "");
                  const undone = entry.reverted_by !== null && entry.reverted_by !== undefined;
                  return (
                    <tr>
                      <td class="font-mono text-xs align-top">
                        {String(entry.row_id ?? "").slice(0, 8)}…
                      </td>
                      <td class="align-top">
                        <Changes action={String(entry.action)} changes={entry.changes} />
                      </td>
                      <td class="align-top whitespace-nowrap">
                        {undone ? (
                          <a
                            href={`${PATH}?row_id=${encodeURIComponent(String(entry.row_id ?? ""))}`}
                            class="link text-sm"
                          >
                            zurückgenommen
                          </a>
                        ) : (
                          <span class="text-sm text-base-content/60">offen</span>
                        )}
                      </td>
                      {props.canRevert && (
                        <td class="text-right align-top whitespace-nowrap">
                          {!undone && (
                            <button
                              type="submit"
                              name="entry"
                              value={entryId}
                              class="btn btn-xs btn-outline btn-error"
                            >
                              Rückgängig
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </form>
    </Layout>
  );
}
