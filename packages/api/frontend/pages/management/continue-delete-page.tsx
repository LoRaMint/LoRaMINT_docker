import Layout from "../../components/layout/Layout";
import { TrashIcon } from "../../components/icons";
import PageHeading from "../../components/PageHeading";
import type { ResourceSpec } from "../../components/manage/spec";
import Notice from "../../components/Notice";

/**
 * Where a deletion by filter stands, between two blocks.
 *
 * A deletion of four hundred thousand rows is not one statement. It is a run of
 * them, each its own short transaction, because a single one would hold locks on
 * the very table the webhook is inserting into for as long as it takes. Between
 * the blocks those locks are free, and this page is what stands in that gap.
 *
 * The form carries the whole state - the filter, the moment of the preview, the
 * batch the first block opened, and how much is gone - so nothing is remembered
 * on the server. Closing the browser here stops the deletion where it stands;
 * what was removed is removed, recorded, and undoable as one operation, and the
 * rest is still there. Starting the same deletion again simply continues, since
 * the rows already gone no longer match.
 */
export default function ContinueDeletePage(props: {
  spec: ResourceSpec;
  /** Rows removed so far, across every block of this deletion. */
  done: number;
  /** Rows still matching the filter within the previewed set. */
  left: number;
  /** How many go in the next block. */
  blockSize: number;
  view: string;
  reason: string | null;
  fields: { name: string; value: string }[];
}) {
  const total = props.done + props.left;
  const percent = Math.round((props.done / total) * 100);

  return (
    <Layout>
      <PageHeading
        title={`${props.spec.title} löschen`}
        back={{ href: `${props.spec.path}${props.view}`, label: "Zurück zur Tabelle" }}
      />

      <Notice tone="warning">
        <p>
          <strong>
            {props.done} von {total} {props.spec.title}
          </strong>{" "}
          gelöscht. Es fehlen noch {props.left}.
        </p>
        <p class="text-sm mt-1 text-base-content/70">
          Gelöscht wird in Blöcken, damit die Tabelle zwischendurch wieder frei
          ist und ankommende Messwerte nicht warten müssen. Was schon entfernt
          ist, bleibt entfernt und steht als ein Vorgang im Änderungsprotokoll.
        </p>
      </Notice>

      <progress
        class="progress progress-error w-full"
        value={props.done}
        max={total}
      />
      <p class="text-sm text-base-content/70 mt-1 mb-4">{percent} %</p>

      {props.reason && (
        <p class="text-sm text-base-content/70 mb-4">
          Grund: <span class="italic">{props.reason}</span>
        </p>
      )}

      <form
        method="post"
        action={`${props.spec.path}/delete`}
        class="flex flex-wrap gap-3"
        data-continue-delete
      >
        {props.fields.map((field) => (
          <input type="hidden" name={field.name} value={field.value} />
        ))}
        {/* The way out first, and with room before the one that acts. */}
        <a href={`${props.spec.path}${props.view}`} class="btn btn-ghost" autofocus>
          Zurück zur Tabelle
        </a>
        {/* Hidden until the script shows it: without JavaScript nothing runs on
            its own, so there would be nothing to stop. */}
        <button type="button" class="btn btn-ghost" data-continue-stop hidden>
          Automatik anhalten
        </button>
        <span class="w-6" aria-hidden="true" />
        <button type="submit" class="btn btn-error gap-2">
          <TrashIcon />
          Weitere {Math.min(props.left, props.blockSize)} löschen
        </button>
      </form>

      <p class="text-sm text-base-content/70 mt-3" data-continue-status>
        Ein Klick pro Block. Was bereits gelöscht ist, bleibt gelöscht – der
        Vorgang lässt sich hier jederzeit verlassen.
      </p>

      <script type="module" src="/public/manage.js" />
    </Layout>
  );
}
