import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import { actionLabel, tableLabel } from "./audit-labels";
import Notice from "../../components/Notice";

/**
 * What taking something back is about to do, before it does it.
 *
 * The same two-step shape as saving and deleting, and for the same reason: an
 * undo is a change to real data, and the number of rows it touches belongs where
 * the click is. It also says plainly what will *not* happen - nothing leaves the
 * log - because "rückgängig machen" sounds like erasing and here it is the
 * opposite.
 */

const PATH = "/management/data/audit";

export default function ConfirmRevertPage(props: {
  /** The entries about to be undone. */
  entries: Record<string, unknown>[];
  /** The list or operation page this started from. */
  view: string;
  fields: { name: string; value: string }[];
}) {
  const first = props.entries[0] ?? {};
  const count = props.entries.length;

  return (
    <Layout>
      <PageHeading
        title="Rücknahme bestätigen"
        back={{ href: `${PATH}${props.view}`, label: "Zurück zum Protokoll" }}
      />

      <div class="max-w-3xl"><Notice tone="warning">
        <p>
          <strong>
            {count} Änderung{count === 1 ? "" : "en"}
          </strong>{" "}
          an {tableLabel(first.table_name)} werden zurückgenommen — was{" "}
          {actionLabel(first.action)} wurde, wird wieder hergestellt.
        </p>
        <p class="text-sm mt-1 text-base-content/70">
          Aus dem Protokoll verschwindet dabei nichts. Die ursprünglichen Einträge
          bleiben stehen, und die Rücknahme kommt als eigener Vorgang dazu — sie
          lässt sich später genauso wieder zurücknehmen.
        </p>
      </Notice></div>

      <form method="post" action={`${PATH}/revert`} class="max-w-3xl">
        {props.fields.map((field) => (
          <input type="hidden" name={field.name} value={field.value} />
        ))}
        <input type="hidden" name="confirm" value="1" />

        <label class="block mb-4">
          <span class="block text-sm mb-1 text-base-content/80">
            Grund der Rücknahme <span class="text-error">*</span>
          </span>
          <input
            type="text"
            name="reason"
            required
            class="input input-sm w-full max-w-xl"
            placeholder="z. B. Löschung war ein Versehen"
          />
        </label>

        <div class="flex flex-wrap gap-3">
          <button type="submit" class="btn btn-error">
            {count} Änderung{count === 1 ? "" : "en"} zurücknehmen
          </button>
          <a href={`${PATH}${props.view}`} class="btn btn-ghost">
            Abbrechen
          </a>
        </div>
      </form>
    </Layout>
  );
}
