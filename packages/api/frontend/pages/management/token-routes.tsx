import type { Hono, MiddlewareHandler } from "hono";
import { ssr } from "../../../config/ssr";
import { auth } from "../../../config";
import { currentUser, hasRole } from "../../../lib";
import { dataGroupsOf, listDataGroups } from "../../../services/data-groups";
import * as apiTokens from "../../../services/api-tokens";
import type { TokenActor, TokenRow, Visibility } from "../../../services/api-tokens";
import TokensPage from "./tokens-page";
import TokenCreatedPage from "./token-created-page";
import TokenHistoryPage from "./token-history-page";

/**
 * API tokens: issuing them, and granting or withdrawing what they may read.
 *
 * A token belongs to a data group, never to a person - that is what lets a
 * nightly export keep working after whoever set it up has left. Every member of
 * the owning group may act on it, including deleting it: there are no roles
 * within a group, deliberately, because the application records as little about
 * people as it can.
 *
 * See docs/api-token.md.
 */

const PATH = "/management/tokens";

const back = (message: { saved?: string; error?: string }) => {
  const params = new URLSearchParams();
  if (message.saved) params.set("saved", message.saved);
  if (message.error) params.set("error", message.error);
  return `${PATH}?${params.toString()}`;
};

const text = (form: Record<string, unknown>, key: string) =>
  typeof form[key] === "string" ? (form[key] as string) : "";

const actorFrom = (): TokenActor => {
  const user = currentUser()!;
  return { username: user.username, displayName: user.displayName ?? null };
};

/** The declared data groups this person is in - the ones a token may belong to. */
const ownGroups = async (): Promise<string[]> => {
  const declared = (await listDataGroups()).map((group) => group.name);
  return dataGroupsOf(currentUser(), declared);
};

/**
 * Whether this person may act on `token`.
 *
 * Membership of the owning group, or administrator. Seeing a token because it
 * is openly visible is expressly not enough - visibility exists so another
 * group can ask to have it made known to them, not so they can change it.
 */
const mayAdminister = async (token: TokenRow): Promise<boolean> =>
  hasRole(currentUser(), "admin", auth) || (await ownGroups()).includes(token.ownerGroup);

/**
 * Why this person may not open `group`'s data to this token, or null if they may.
 *
 * A group grants its own data, so membership is the first condition. For anyone
 * outside the owning group there is a second: the token must actually have been
 * announced to *that* group. Without it, somebody in both an announced-to group
 * and an unrelated one could feed the token data from the unrelated one - which
 * it was never made known to.
 */
const mayGrantFor = async (token: TokenRow, group: string): Promise<string | null> => {
  if (hasRole(currentUser(), "admin", auth)) return null;
  const groups = await ownGroups();
  if (!groups.includes(group)) {
    return "Du kannst nur über die Daten deiner eigenen Gruppen verfügen.";
  }
  if (group === token.ownerGroup || token.announcedTo.includes(group)) return null;
  return `„${group}" ist dieses Token nicht bekannt gemacht worden.`;
};

export const registerTokenRoutes = (
  pages: Hono,
  guards: { requireGroupMember: MiddlewareHandler; sameOrigin: MiddlewareHandler },
) => {
  pages.get(
    PATH,
    guards.requireGroupMember,
    ...ssr(async (c) => {
      c.get("page").title = "API-Token";
      const isAdmin = hasRole(currentUser(), "admin", auth);
      const [groups, declared] = await Promise.all([ownGroups(), listDataGroups()]);
      const tokens = await apiTokens.listForUser(groups, isAdmin);
      return (
        <TokensPage
          tokens={tokens}
          ownGroups={groups}
          allGroups={declared.map((group) => group.name)}
          isAdmin={isAdmin}
          {...(c.req.query("saved") ? { saved: c.req.query("saved")! } : {})}
          {...(c.req.query("error") ? { error: c.req.query("error")! } : {})}
        />
      );
    }),
  );

  pages.get(
    `${PATH}/history`,
    guards.requireGroupMember,
    ...ssr(async (c) => {
      c.get("page").title = "API-Token: Historie";
      const isAdmin = hasRole(currentUser(), "admin", auth);
      const entries = await apiTokens.history(await ownGroups(), isAdmin);
      return <TokenHistoryPage entries={entries} />;
    }),
  );

  /**
   * Creating a token renders its value instead of redirecting.
   *
   * A redirect cannot carry the plaintext, and it must not be stored anywhere to
   * be fetched afterwards - so the one moment it exists is this response. Shown
   * once, then gone; losing it means issuing a new token.
   */
  pages.post(PATH, guards.requireGroupMember, guards.sameOrigin, ...ssr(async (c) => {
    const form = await c.req.parseBody();
    const group = text(form, "owner_group");
    const groups = await ownGroups();
    const isAdmin = hasRole(currentUser(), "admin", auth);

    if (!isAdmin && !groups.includes(group)) {
      return c.redirect(back({ error: "Diese Gruppe gehört dir nicht." }), 303);
    }

    const result = await apiTokens.createToken(
      {
        name: text(form, "name"),
        ownerGroup: group,
        days: Number.parseInt(text(form, "days"), 10) || 360,
        visibility: text(form, "visibility") === "signed_in" ? "signed_in" : "group",
      },
      actorFrom(),
    );
    if (!result.ok) return c.redirect(back({ error: result.error }), 303);

    c.get("page").title = "API-Token angelegt";
    return (
      <TokenCreatedPage name={text(form, "name")} value={result.data.plaintext} />
    );
  }));

  /**
   * Loads the token and checks the right the action needs.
   *
   * Two different rights, and they must not be conflated. Administering a token
   * - deleting, extending, announcing it - belongs to the owning group alone.
   * Granting and withdrawing data belongs to whichever group the data is, which
   * after an announcement includes that group. Giving it the owner's powers
   * would let a group the token was merely made known to delete it.
   */
  const withToken = (
    permission: "administer" | "reach",
    handler: (token: TokenRow, form: Record<string, unknown>) => Promise<{ saved?: string; error?: string }>,
  ) =>
    async (c: any) => {
      const token = await apiTokens.getToken(c.req.param("id"));
      if (!token) return c.redirect(back({ error: "Das Token wurde nicht gefunden." }), 303);

      const allowed =
        permission === "administer"
          ? await mayAdminister(token)
          : (await mayAdminister(token)) ||
            (await ownGroups()).some((group) => token.announcedTo.includes(group));
      if (!allowed) {
        return c.redirect(back({ error: "Dieses Token gehört einer anderen Gruppe." }), 303);
      }

      const form = await c.req.parseBody();
      return c.redirect(back(await handler(token, form)), 303);
    };

  pages.post(
    `${PATH}/:id/delete`,
    guards.requireGroupMember,
    guards.sameOrigin,
    withToken("administer", async (token) => {
      const result = await apiTokens.deleteToken(token, actorFrom());
      return result.ok
        ? { saved: `„${token.name}" wurde gelöscht und wirkt ab sofort nicht mehr.` }
        : { error: result.error };
    }),
  );

  pages.post(
    `${PATH}/:id/extend`,
    guards.requireGroupMember,
    guards.sameOrigin,
    withToken("administer", async (token, form) => {
      const days = Number.parseInt(text(form, "days"), 10) || 360;
      const result = await apiTokens.extendToken(token, days, actorFrom());
      return result.ok
        ? { saved: `Die Laufzeit von „${token.name}" wurde verlängert.` }
        : { error: result.error };
    }),
  );

  pages.post(
    `${PATH}/:id/visibility`,
    guards.requireGroupMember,
    guards.sameOrigin,
    withToken("administer", async (token, form) => {
      const visibility: Visibility =
        text(form, "visibility") === "signed_in" ? "signed_in" : "group";
      const result = await apiTokens.setVisibility(token, visibility, actorFrom());
      return result.ok
        ? { saved: `Die Sichtbarkeit von „${token.name}" wurde geändert.` }
        : { error: result.error };
    }),
  );

  /**
   * Granting is done by the group whose data it is - so the group here is the
   * granting one, and today that can only be a group the person is in.
   */
  pages.post(
    `${PATH}/:id/grant`,
    guards.requireGroupMember,
    guards.sameOrigin,
    withToken("reach", async (token, form) => {
      const group = text(form, "group_name");
      const refusal = await mayGrantFor(token, group);
      if (refusal) return { error: refusal };
      const filter: Record<string, string> = {};
      for (const key of ["device_eui", "measurand", "sensor", "location", "datatype"]) {
        const value = text(form, key).trim();
        if (value) filter[key] = value;
      }
      const result = await apiTokens.grant(token, group, filter, actorFrom());
      return result.ok
        ? { saved: `„${group}" hat „${token.name}" Zugriff erteilt.` }
        : { error: result.error };
    }),
  );

  pages.post(
    `${PATH}/:id/revoke`,
    guards.requireGroupMember,
    guards.sameOrigin,
    withToken("reach", async (token, form) => {
      const group = text(form, "group_name");
      const refusal = await mayGrantFor(token, group);
      if (refusal) return { error: refusal };
      const result = await apiTokens.revoke(token, group, actorFrom());
      return result.ok
        ? { saved: `Die Freigabe von „${group}" wurde entzogen und wirkt sofort nicht mehr.` }
        : { error: result.error };
    }),
  );

  /**
   * Making the token known to another group, so it may grant this token its
   * data.
   *
   * Only the owning group announces - it cannot be passed on, or the owner would
   * lose track of who may open data to its token. The value never travels with
   * it; see services/api-tokens.ts.
   */
  pages.post(
    `${PATH}/:id/announce`,
    guards.requireGroupMember,
    guards.sameOrigin,
    withToken("administer", async (token, form) => {
      const group = text(form, "to_group");
      const result = await apiTokens.announce(token, group, actorFrom());
      return result.ok
        ? {
            saved:
              `„${token.name}" ist „${group}" jetzt bekannt: die Gruppe sieht es ` +
              "und kann ihm eigene Daten freigeben. Den Wert erfährt sie nicht.",
          }
        : { error: result.error };
    }),
  );

  pages.post(
    `${PATH}/:id/unannounce`,
    guards.requireGroupMember,
    guards.sameOrigin,
    withToken("administer", async (token, form) => {
      const group = text(form, "to_group");
      const result = await apiTokens.withdrawAnnouncement(token, group, actorFrom());
      return result.ok
        ? {
            saved:
              `Die Bekanntmachung bei „${group}" wurde zurückgezogen – alle ` +
              "daraus entstandenen Freigaben sind sofort erloschen.",
          }
        : { error: result.error };
    }),
  );
};
