import Layout from "../../components/layout/Layout";
import PageHeading from "../../components/PageHeading";
import SectionHeading from "../../components/SectionHeading";
import Notice from "../../components/Notice";
import TableFrame, { EmptyRow } from "../../components/TableFrame";
import { TrashIcon } from "../../components/icons";
import { PAGES } from "../../../lib";
import { MAX_DEPTH } from "../../../lib/guide-tree";
import type { GuideEntry } from "../../../lib/guide-store";

/**
 * The tree: everything that can be done to the shape of the guides.
 *
 * Not through the generic resource system (`management/resources.ts`). That one
 * renders a flat table of rows out of one table and knows neither how to create
 * a row nor what a parent is - the two things this page is entirely about. So it
 * follows `data-groups-routes.tsx` instead: GET renders, POST writes and
 * redirects with `?msg=`.
 *
 * **Everything works without JavaScript.** Moving a page is four little forms
 * rather than a drag handle, and that is the trade: drag-and-drop would be
 * nicer with a mouse and impossible without one, and the rule in this project
 * is that a page can be used with forms alone.
 */

const PATH = PAGES.guidesManage.href;

export const GUIDE_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  created: { tone: "success", text: "Die Seite wurde angelegt – als Entwurf." },
  saved: { tone: "success", text: "Die Seite wurde gespeichert." },
  renamed: {
    tone: "success",
    text:
      "Die Adresse wurde geändert. Die alte leitet dauerhaft auf die neue um – " +
      "auch die jeder Unterseite.",
  },
  moved: {
    tone: "success",
    text: "Die Seite wurde verschoben. Die alten Adressen leiten weiter.",
  },
  reordered: { tone: "success", text: "Die Reihenfolge wurde geändert." },
  deleted: { tone: "success", text: "Die Seite wurde gelöscht." },
  forgotten: { tone: "success", text: "Die Weiterleitung wurde entfernt." },
};

/** One row of the tree, indented by its depth. */
type Row = {
  entry: GuideEntry;
  depth: number;
  path: string;
  /** False for the first of its level, so „hoch" is not offered pointlessly. */
  canRaise: boolean;
  canLower: boolean;
};

const GuidesPage = (props: {
  rows: Row[];
  /** Every page, for the „unter" pickers. Flat, deepest addresses spelled out. */
  options: { id: string; label: string }[];
  forwardings: { path: string; to: string | null; title: string | null }[];
  msg?: string;
  error?: string;
}) => {
  const message = props.msg ? GUIDE_MESSAGES[props.msg] : undefined;

  return (
    <Layout>
      <PageHeading
        title={PAGES.guidesManage.label}
        intro={
          <>
            Jede Seite hier wird zu einer Adresse unter{" "}
            <a href={PAGES.guides.href} class="link">
              {PAGES.guides.href}
            </a>
            . Eine neue Seite ist zunächst ein <strong>Entwurf</strong>: sie
            steht in keinem Menü und antwortet für alle anderen mit 404.
          </>
        }
      />

      {props.error && <Notice tone="error">{props.error}</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {/* ---- Anlegen ---- */}
      <SectionHeading>Neue Seite</SectionHeading>
      <form
        method="post"
        action={`${PATH}/new`}
        class="flex flex-wrap gap-3 items-end mb-6"
      >
        <label class="text-sm">
          <span class="block text-base-content/70 mb-1">
            Titel <span class="text-base-content/70">(Pflichtfeld)</span>
          </span>
          <input
            type="text"
            name="title"
            required
            autocomplete="off"
            placeholder="Tag 3: Der Sensor"
            class="input input-sm w-64"
          />
        </label>
        <label class="text-sm">
          <span class="block text-base-content/70 mb-1">Adresse (optional)</span>
          <input
            type="text"
            name="slug"
            autocomplete="off"
            placeholder="aus dem Titel"
            class="input input-sm font-mono w-56"
          />
        </label>
        <label class="text-sm">
          <span class="block text-base-content/70 mb-1">Unter</span>
          <select name="parent" class="select select-sm w-64">
            <option value="">(oberste Ebene)</option>
            {props.options.map((option) => (
              <option value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" class="btn btn-sm btn-primary">
          anlegen
        </button>
      </form>

      {/* ---- Der Baum ---- */}
      <SectionHeading>Die Seiten</SectionHeading>
      <p class="text-sm text-base-content/70 mb-2 max-w-[65ch]">
        Höchstens {MAX_DEPTH} Ebenen – tiefer wird das Menü auf einem Handy
        unbenutzbar. Eine Seite unter eine ihrer eigenen Unterseiten zu hängen
        wird abgelehnt: der Baum würde zum Ring.
      </p>

      <TableFrame class="mb-8">
        <thead>
          <tr>
            <th>Seite</th>
            <th>Adresse</th>
            <th>Zustand</th>
            <th>
              <span class="sr-only">Reihenfolge</span>
            </th>
            <th>Unter</th>
            <th>
              <span class="sr-only">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <EmptyRow columns={6}>
              Noch keine Anleitung. Über das Formular darüber entsteht die erste.
            </EmptyRow>
          ) : (
            props.rows.map((row) => (
              <tr>
                <td>
                  {/*
                    * Indented by padding rather than by non-breaking spaces, so
                    * the level is visible without being read out as blanks.
                    */}
                  <span style={{ "padding-left": `${(row.depth - 1) * 1.25}rem` }}>
                    <a href={`${PATH}/${row.entry.id}`} class="link">
                      {row.entry.title}
                    </a>
                  </span>
                </td>
                <td class="font-mono text-xs">
                  {row.entry.published ? (
                    <a href={`${PAGES.guides.href}/${row.path}`} class="link">
                      /{row.path}
                    </a>
                  ) : (
                    <span>/{row.path}</span>
                  )}
                </td>
                {/* A word, never only a colour - GRUND-03. */}
                <td class="text-sm">
                  {row.entry.published ? "veröffentlicht" : "Entwurf"}
                </td>
                <td>
                  <div class="flex gap-1">
                    <form method="post" action={`${PATH}/order`}>
                      <input type="hidden" name="id" value={row.entry.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={!row.canRaise}
                        class="btn btn-xs btn-ghost min-h-6 h-6 px-2"
                        title="nach oben"
                      >
                        ↑<span class="sr-only">nach oben</span>
                      </button>
                    </form>
                    <form method="post" action={`${PATH}/order`}>
                      <input type="hidden" name="id" value={row.entry.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={!row.canLower}
                        class="btn btn-xs btn-ghost min-h-6 h-6 px-2"
                        title="nach unten"
                      >
                        ↓<span class="sr-only">nach unten</span>
                      </button>
                    </form>
                  </div>
                </td>
                <td>
                  <form
                    method="post"
                    action={`${PATH}/move`}
                    class="flex gap-1 items-center"
                  >
                    <input type="hidden" name="id" value={row.entry.id} />
                    <label class="sr-only" for={`move-${row.entry.id}`}>
                      Übergeordnete Seite von {row.entry.title}
                    </label>
                    <select
                      id={`move-${row.entry.id}`}
                      name="parent"
                      class="select select-xs w-52"
                    >
                      <option value="" selected={row.entry.parentId === null}>
                        (oberste Ebene)
                      </option>
                      {props.options
                        .filter((option) => option.id !== row.entry.id)
                        .map((option) => (
                          <option
                            value={option.id}
                            selected={row.entry.parentId === option.id}
                          >
                            {option.label}
                          </option>
                        ))}
                    </select>
                    <button type="submit" class="btn btn-xs btn-outline min-h-6 h-6 px-2">
                      verschieben
                    </button>
                  </form>
                </td>
                <td>
                  <div class="flex gap-1 justify-end">
                    <a
                      href={`${PATH}/${row.entry.id}`}
                      class="btn btn-xs btn-outline min-h-6 h-6 px-2"
                    >
                      bearbeiten
                    </a>
                    <form method="post" action={`${PATH}/delete`}>
                      <input type="hidden" name="id" value={row.entry.id} />
                      <button
                        type="submit"
                        class="btn btn-xs btn-outline btn-error min-h-6 h-6 px-2 gap-1"
                      >
                        <TrashIcon />
                        löschen
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableFrame>

      {/* ---- Weiterleitungen ---- */}
      <SectionHeading>Alte Adressen</SectionHeading>
      <p class="text-sm text-base-content/70 mb-2 max-w-[65ch]">
        Wird eine Seite umbenannt oder verschoben, bleibt ihre alte Adresse hier
        stehen und leitet dauerhaft (301) auf die neue um – damit ein gedrucktes
        Blatt nicht ins Leere zeigt. Die Liste wächst mit jeder Umbenennung;
        was niemand mehr braucht, kann hier weg. Eine entfernte Weiterleitung
        gibt die Adresse für eine neue Seite frei.
      </p>
      <TableFrame class="mb-8">
        <thead>
          <tr>
            <th>Alte Adresse</th>
            <th>Führt zu</th>
            <th>
              <span class="sr-only">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.forwardings.length === 0 ? (
            <EmptyRow columns={3}>
              Noch keine – es wurde nichts umbenannt oder verschoben.
            </EmptyRow>
          ) : (
            props.forwardings.map((entry) => (
              <tr>
                <td class="font-mono text-xs">/{entry.path}</td>
                <td class="text-sm">
                  {entry.to === null ? (
                    <span class="text-base-content/70">
                      nirgendwohin – die Seite gibt es nicht mehr
                    </span>
                  ) : (
                    <a href={`${PAGES.guides.href}/${entry.to}`} class="link">
                      {entry.title} <span class="font-mono text-xs">/{entry.to}</span>
                    </a>
                  )}
                </td>
                <td class="text-right">
                  <form method="post" action={`${PATH}/forget`}>
                    <input type="hidden" name="path" value={entry.path} />
                    <button
                      type="submit"
                      class="btn btn-xs btn-outline min-h-6 h-6 px-2 gap-1"
                    >
                      <TrashIcon />
                      entfernen
                    </button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableFrame>
    </Layout>
  );
};

export default GuidesPage;
export type { Row as GuideRowView };
