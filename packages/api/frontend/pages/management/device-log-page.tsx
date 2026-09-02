import Layout from "../../components/layout/Layout";
import TableFrame, { EmptyRow } from "../../components/TableFrame";
import LocalTime from "../../components/LocalTime";
import PageHeading from "../../components/PageHeading";
import { pageLink, pageWindow } from "../../../lib/manage-view";
import type { DeviceLogEntry } from "../../../services/device-log";
import { PAGES } from "../../../lib";

/**
 * What this application did in The Things Network, and how it went.
 *
 * Kept apart from the Änderungsprotokoll on purpose, and the sentence at the top
 * says why: that log records database rows and can write them back, and a device
 * in TTN is not a row. There is no undo button here, and its absence is a
 * statement rather than an omission.
 */

const PATH = "/management/devices/log";

const ACTIONS: Record<string, string> = {
  create: "angelegt",
  rename: "umbenannt",
};

const OUTCOMES: Record<string, { label: string; badge: string; title: string }> = {
  ok: { label: "erledigt", badge: "badge-success", title: "Vollständig durchgelaufen." },
  failed: {
    label: "fehlgeschlagen",
    badge: "badge-ghost",
    title: "Nichts geändert – in TTN ist von dem Versuch nichts zurückgeblieben.",
  },
  partial: {
    label: "halb",
    badge: "badge-error",
    title:
      "Ein Schritt schlug fehl und liess sich nicht zurücknehmen – in TTN ist " +
      "etwas zurückgeblieben.",
  },
};

/** The one line of detail worth showing inline for each kind of entry. */
const detailOf = (entry: DeviceLogEntry): string => {
  if (entry.action === "rename") {
    const name = entry.details.name as { from?: string; to?: string } | undefined;
    if (name) return `„${name.from ?? "ohne Namen"}“ → „${name.to ?? ""}“`;
  }
  const leftovers = entry.details.leftovers;
  if (Array.isArray(leftovers) && leftovers.length > 0) {
    return `In TTN zurückgeblieben: ${leftovers.join(", ")}`;
  }
  const failed = entry.details.failed as { error?: string } | null | undefined;
  if (failed?.error) return failed.error;
  return "";
};

export default function DeviceLogPage(props: {
  entries: DeviceLogEntry[];
  total: number;
  page: number;
  perPage: number;
}) {
  const totalPages = Math.max(1, Math.ceil(props.total / props.perPage));

  return (
    <Layout>
      <PageHeading
        title="Geräteprotokoll"
        back={PAGES.devices}
        intro={
          <>
            Wer wann welches Gerät in The Things Network angelegt oder umbenannt
            hat. Zurücknehmen lässt sich hier nichts: das Änderungsprotokoll kann
            das, weil es Datenbankzeilen führt und eine Zeile zurückschreiben
            kann – ein Gerät in TTN ist keine.
          </>
        }
      />

      <TableFrame>
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Benutzer</th>
              <th>Aktion</th>
              <th>Gerät</th>
              <th>Grund</th>
              <th>Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            {props.entries.length === 0 && (
              <EmptyRow columns={6}>Hier ist noch nichts passiert.</EmptyRow>
            )}
            {props.entries.map((entry) => {
              const detail = detailOf(entry);
              const outcome = OUTCOMES[entry.outcome];
              return (
                <tr>
                  <td class="whitespace-nowrap">
                    <LocalTime at={entry.occurred_at} />
                  </td>
                  <td>{entry.display_name ?? entry.username}</td>
                  <td>{ACTIONS[entry.action] ?? entry.action}</td>
                  <td>
                    <a
                      href={`/management/devices/${encodeURIComponent(entry.device_id)}`}
                      class="link no-underline font-mono text-xs"
                    >
                      {entry.device_id}
                    </a>
                    {detail && (
                      <div class="text-xs text-base-content/60">{detail}</div>
                    )}
                  </td>
                  <td class="max-w-xs truncate" title={entry.reason ?? ""}>
                    {entry.reason ?? ""}
                  </td>
                  <td>
                    {outcome && (
                      <span
                        class={`badge badge-sm ${outcome.badge}`}
                        title={outcome.title}
                      >
                        {outcome.label}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>

      {totalPages > 1 && (
        <div class="join mt-4">
          {pageWindow(props.page, totalPages).map((page) => (
            <a
              href={`${PATH}${pageLink({}, page)}`}
              class={`join-item btn btn-sm ${page === props.page ? "btn-active" : ""}`}
            >
              {page}
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
}
