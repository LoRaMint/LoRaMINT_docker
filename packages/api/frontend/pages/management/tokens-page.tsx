import Layout from "../../components/layout/Layout";
import TableFrame from "../../components/TableFrame";
import LocalTime from "../../components/LocalTime";
import PageHeading from "../../components/PageHeading";
import Notice from "../../components/Notice";
import Field from "../../components/Field";
import SectionHeading from "../../components/SectionHeading";
import type { TokenRow } from "../../../services/api-tokens";
import { FILTER_KEYS, MAX_DAYS, type GrantFilter } from "../../../lib/api-tokens";
import { PAGES } from "../../../lib";

const PATH = "/management/tokens";

/** "nur Gerät A840, nur Temperatur" - or a word for "everything the group has". */
const describeFilter = (filter: GrantFilter): string => {
  const parts = FILTER_KEYS.filter((key) => filter[key]).map((key) => `${key}=${filter[key]}`);
  return parts.length === 0 ? "alles der Gruppe" : parts.join(", ");
};

/**
 * Issuing API tokens and deciding what they may read.
 *
 * The value itself appears exactly once, on the page after creating it, and
 * never here - only its hash is stored. What a token may read is not a property
 * of the token but a list of permissions beside it, which is why withdrawing
 * one changes nothing about the token itself.
 */
export default function TokensPage(props: {
  tokens: TokenRow[];
  /** The declared data groups this person is in - the ones they may act for. */
  ownGroups: string[];
  /** Every declared group, for an administrator granting on behalf of one. */
  allGroups: string[];
  isAdmin: boolean;
  saved?: string;
  error?: string;
}) {
  const mayActFor = (group: string) => props.isAdmin || props.ownGroups.includes(group);

  /**
   * Which of my groups may open their data to this token: my own if I own it,
   * plus any it was made known to. Mirrors `mayGrantFor` in token-routes.tsx -
   * the page only decides what is worth offering, the route checks again.
   */
  const grantableFor = (token: TokenRow) =>
    props.isAdmin
      ? props.allGroups
      : props.ownGroups.filter(
          (group) => group === token.ownerGroup || token.announcedTo.includes(group),
        );

  return (
    <Layout>
      <PageHeading
        title={PAGES.tokens.label}
        intro={
          <>
            Ein Token lässt ein Programm die API lesen, ohne dass jemandes
            Passwort im Skript steht. Es gehört einer Gruppe, nicht einer Person –
            und was es lesen darf, steht daneben und lässt sich einzeln entziehen,
            ohne dass sich das Token ändert.
          </>
        }
      />

      {props.saved && <Notice tone="success">{props.saved}</Notice>}
      {props.error && <Notice tone="error">{props.error}</Notice>}

      <p class="mb-4">
        <a href={`${PATH}/history`} class="link text-sm">
          Historie der Berechtigungen ansehen →
        </a>
      </p>

      {props.tokens.length === 0 ? (
        <p class="text-base-content/70 mb-8">Noch kein Token angelegt.</p>
      ) : (
        <div class="space-y-4 mb-8">
          {props.tokens.map((token) => (
            <div class="rounded-box border border-base-300 p-4">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <div>
                  <span class="font-bold">{token.name}</span>{" "}
                  <span class="text-sm text-base-content/70">
                    gehört <code>{token.ownerGroup}</code>
                  </span>
                </div>
                <div class="text-sm text-base-content/60">
                  läuft ab <LocalTime at={token.expiresAt} />
                  {token.lastUsedAt ? (
                    <>
                      {" "}
                      · zuletzt benutzt <LocalTime at={token.lastUsedAt} />
                    </>
                  ) : (
                    <> · noch nie benutzt</>
                  )}
                </div>
              </div>

              {/* Freigaben */}
              <TableFrame class="mb-3">
                <thead>
                  <tr>
                    <th>Freigegeben von</th>
                    <th>Umfang</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {token.grants.length === 0 ? (
                    <tr>
                      <td colspan={3} class="text-base-content/60">
                        Keine Freigabe – dieses Token sieht nur, was ohnehin
                        öffentlich ist.
                      </td>
                    </tr>
                  ) : (
                    token.grants.map((grant) => (
                      <tr>
                        <td>
                          <code>{grant.group}</code>
                        </td>
                        <td class="text-sm">{describeFilter(grant.filter)}</td>
                        <td class="text-right">
                          {mayActFor(grant.group) && (
                            <form method="post" action={`${PATH}/${token.id}/revoke`}>
                              <input type="hidden" name="group_name" value={grant.group} />
                              <button type="submit" class="btn btn-ghost btn-xs">
                                Entziehen
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </TableFrame>

              {grantableFor(token).length > 0 && (
                <details class="mb-3">
                  <summary class="cursor-pointer text-sm link">Freigabe erteilen</summary>
                  <form
                    method="post"
                    action={`${PATH}/${token.id}/grant`}
                    class="flex flex-wrap items-end gap-2 mt-2"
                  >
                    <label class="text-sm">
                      <span class="block text-base-content/70">Gruppe</span>
                      <select name="group_name" required class="select select-sm">
                        {grantableFor(token).map((group) => (
                          <option value={group}>{group}</option>
                        ))}
                      </select>
                    </label>
                    {FILTER_KEYS.map((key) => (
                      <label class="text-sm">
                        <span class="block text-base-content/70">{key}</span>
                        <input name={key} placeholder="alle" class="input input-sm w-32" />
                      </label>
                    ))}
                    <button type="submit" class="btn btn-primary btn-sm">
                      Erteilen
                    </button>
                  </form>
                  <p class="text-xs text-base-content/60 mt-1">
                    Leere Felder heißen „alles der Gruppe". Ausgefüllte engen ein.
                  </p>
                </details>
              )}

              {/* Bekanntmachen: nur die Besitzergruppe, und nicht weitergebbar. */}
              {mayActFor(token.ownerGroup) && (
                <details class="mb-3">
                  <summary class="cursor-pointer text-sm link">
                    Bekannt machen{" "}
                    {token.announcedTo.length > 0 && (
                      <span class="text-base-content/60">
                        (bei {token.announcedTo.join(", ")})
                      </span>
                    )}
                  </summary>

                  {token.announcedTo.length > 0 && (
                    <ul class="mt-2 space-y-1">
                      {token.announcedTo.map((group) => (
                        <li class="flex items-center gap-2 text-sm">
                          <code>{group}</code>
                          <form method="post" action={`${PATH}/${token.id}/unannounce`}>
                            <input type="hidden" name="to_group" value={group} />
                            <button type="submit" class="btn btn-ghost btn-xs">
                              Zurückziehen
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    method="post"
                    action={`${PATH}/${token.id}/announce`}
                    class="flex flex-wrap items-end gap-2 mt-2"
                  >
                    <label class="text-sm">
                      <span class="block text-base-content/70">Bei Gruppe</span>
                      <select name="to_group" required class="select select-sm">
                        {props.allGroups
                          .filter(
                            (group) =>
                              group !== token.ownerGroup && !token.announcedTo.includes(group),
                          )
                          .map((group) => (
                            <option value={group}>{group}</option>
                          ))}
                      </select>
                    </label>
                    <button type="submit" class="btn btn-primary btn-sm">
                      Bekannt machen
                    </button>
                  </form>
                  <p class="text-xs text-base-content/60 mt-1">
                    Die Gruppe sieht das Token danach und kann ihm <em>eigene</em>{" "}
                    Daten freigeben. Den Wert erfährt sie nicht – sie könnte es
                    sonst selbst benutzen und käme damit auch an die Daten aller
                    anderen. Wird die Bekanntmachung zurückgezogen, erlöschen alle
                    daraus entstandenen Freigaben sofort.
                  </p>
                </details>
              )}

              {mayActFor(token.ownerGroup) && (
                <div class="flex flex-wrap items-end gap-4 pt-2 border-t border-base-300">
                  <form
                    method="post"
                    action={`${PATH}/${token.id}/extend`}
                    class="flex items-end gap-2"
                  >
                    <label class="text-sm">
                      <span class="block text-base-content/70">Verlängern um Tage</span>
                      <input
                        name="days"
                        type="number"
                        min="1"
                        max={MAX_DAYS}
                        value={String(MAX_DAYS)}
                        class="input input-sm w-24"
                      />
                    </label>
                    <button type="submit" class="btn btn-ghost btn-xs">
                      Verlängern
                    </button>
                  </form>

                  <form
                    method="post"
                    action={`${PATH}/${token.id}/visibility`}
                    class="flex items-end gap-2"
                  >
                    <label class="text-sm">
                      <span class="block text-base-content/70">Sichtbar für</span>
                      <select name="visibility" class="select select-sm">
                        <option value="group" selected={token.visibility === "group"}>
                          nur die eigene Gruppe
                        </option>
                        <option
                          value="signed_in"
                          selected={token.visibility === "signed_in"}
                        >
                          alle Angemeldeten
                        </option>
                      </select>
                    </label>
                    <button type="submit" class="btn btn-ghost btn-xs">
                      Übernehmen
                    </button>
                  </form>

                  <form method="post" action={`${PATH}/${token.id}/delete`}>
                    <button type="submit" class="btn btn-ghost btn-xs text-error">
                      Token löschen
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <SectionHeading>Neues Token</SectionHeading>

      {props.ownGroups.length === 0 && !props.isAdmin ? (
        <p class="text-base-content/70">
          Du bist in keiner Datengruppe – ein Token braucht aber eine Gruppe, der
          es gehört.
        </p>
      ) : (
        <form method="post" action={PATH} class="max-w-3xl space-y-3">
          <Field
            label="Name"
            required
            hint="Wofür es benutzt wird – das ist später der einzige Hinweis darauf."
            class="max-w-md"
          >
            <input name="name" required placeholder="Nächtlicher Export" class="input w-full" />
          </Field>

          <Field label="Gehört der Gruppe" required class="max-w-md">
            <select name="owner_group" required class="select w-full">
              {(props.isAdmin ? props.allGroups : props.ownGroups).map((group) => (
                <option value={group}>{group}</option>
              ))}
            </select>
          </Field>

          <Field
            label="Laufzeit in Tagen"
            hint={`Höchstens ${MAX_DAYS}. Verlängern ist später möglich, wieder um höchstens ${MAX_DAYS} Tage ab dann.`}
            class="max-w-md"
          >
            <input
              name="days"
              type="number"
              min="1"
              max={MAX_DAYS}
              value={String(MAX_DAYS)}
              class="input w-full"
            />
          </Field>

          <Field
            label="Sichtbar für"
            hint={
              <>
                „Alle Angemeldeten" zeigt nur, <em>dass</em> es das Token gibt –
                nie seinen Wert. Das ist der Weg, auf dem eine andere Gruppe es
                findet, um eine Freigabe anzubieten.
              </>
            }
            class="max-w-md"
          >
            <select name="visibility" class="select w-full">
              <option value="group">nur die eigene Gruppe</option>
              <option value="signed_in">alle Angemeldeten</option>
            </select>
          </Field>

          <button type="submit" class="btn btn-primary">
            Anlegen
          </button>
        </form>
      )}
    </Layout>
  );
}
