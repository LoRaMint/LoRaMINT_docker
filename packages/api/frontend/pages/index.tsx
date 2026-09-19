import { Hono } from "hono";
import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { setCookie, deleteCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { html, ssr } from "../../config/ssr";
import {
  config,
  legal,
  auth,
  sqlConsole,
  board,
  manage,
  setupAccount,
  uploads,
} from "../../config";
import { verifySetupAccount } from "../../services/setup-account";
import {
  measurements,
  logEntries,
  auditLog,
  authenticate,
  rememberSignIn,
  runConsoleSql,
  savePreferences,
  userRecord,
} from "../../services";
import {
  clientAddress,
  createSession,
  canReachData,
  currentUser,
  hasRole,
  loginThrottle,
  rolesOf,
  SESSION_COOKIE,
  themeCookieValue,
  THEME_COOKIE,
  type Role,
  type SessionUser,
  PAGES,
} from "../../lib";
import HomePage from "./home/page";
import PlotsPage from "./plots/page";
import ExportPage from "./export/page";
import StatusPage from "./status/page";
import BoardPage from "./board/page";
import * as dashboard from "../../services/dashboard";
import * as deviceNames from "../../services/device-names";
import { deviceStates } from "../../lib/device-state";
import GuidePage, { EmptyGuidesPage } from "./guides/page";
import NotFoundPage from "./not-found/page";
import LoginPage from "./login/page";
import SqlPage from "./sql/page";
import ProfilePage from "./profile/page";
import ManageDataPage from "./management/data-page";
import {
  logEntryBackend,
  measurementBackend,
  registerAuditRoutes,
  registerResourceRoutes,
} from "./management/routes";
import { registerDeviceRoutes } from "./management/devices-routes";
import { registerConfigRoutes } from "./management/config-routes";
import { registerDataGroupRoutes } from "./management/data-groups-routes";
import { registerBoardRoutes } from "./management/board-routes";
import { registerTokenRoutes } from "./management/token-routes";
import { dataGroupsOf, listDataGroups } from "../../services/data-groups";
import ImpressumPage from "./impressum/page";
import DownloadsPage from "./downloads/page";
import { registerGuideRoutes } from "./management/guides-routes";
import { registerFileRoutes } from "./management/files-routes";
import { listVisibleFiles } from "../../services/uploads";
import {
  allGuides,
  forwardingFor,
  guideAt,
  guideBody,
  guidePath,
  guideTree,
} from "../../services/guides";
import DatenschutzPage from "./datenschutz/page";

const pages = new Hono();

/**
 * Refuses a write that a foreign page triggered.
 *
 * `SameSite=Lax` already means a cross-site POST arrives without the session
 * cookie and fails the role check, so this is a second, independent layer that
 * still holds if the cookie settings are ever loosened. A request without an
 * Origin header is allowed through: some clients omit it, and the cookie rule
 * already covers that case.
 */
const sameOrigin = createMiddleware(async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (host === null || host !== c.req.header("Host")) {
      return c.text("Forbidden", 403);
    }
  }
  await next();
});

pages.get(
  "/",
  ...ssr((c) => {
    c.get("page").title = "LoRaMINT";
    return <HomePage />;
  }),
);

pages.get(
  "/plots",
  ...ssr((c) => {
    c.get("page").title = PAGES.plots.label;
    return <PlotsPage />;
  }),
);

pages.get(
  "/export",
  ...ssr((c) => {
    c.get("page").title = PAGES.export.label;
    return <ExportPage />;
  }),
);

pages.get(
  "/status",
  ...ssr(async (c) => {
    c.get("page").title = PAGES.status.label;
    const [sensors, logs, registered] = await Promise.all([
      measurements.status(),
      logEntries.status(),
      deviceNames.registeredEuis(),
    ]);
    /*
     * aktiv, stumm or verwaist per device - the same three the device overview
     * shows, decided by the same rule (lib/device-state.ts).
     *
     * Two differences to over there, both forced by this page being public. The
     * registration comes from the local copy rather than from TTN
     * (services/device-names.ts), so the label is as fresh as the last sync. And
     * a device that is registered but has never sent anything has no row here at
     * all - this table is built from what arrived, not from what exists - so
     * "stumm" on this page means "nothing in the last 24 hours".
     *
     * Knowing nothing is not the same as knowing a device is unregistered: with
     * an empty registry (no TTN key configured, or a list that never arrived)
     * every row would read verwaist, which is worse than silence. So in that case
     * the badges stay away entirely.
     */
    const states =
      registered.size === 0
        ? null
        : deviceStates([...sensors, ...logs], registered);
    return <StatusPage sensors={sensors} logs={logs} states={states} />;
  }),
);

// Switchable, like the SQL console: a deployment with nothing worth showing yet
// can turn the page off rather than publish an empty one. /management/board
// stays reachable either way, so entries can be prepared while it is off.
if (board.enabled) {
  pages.get(
    "/board",
    ...ssr(async (c) => {
      c.get("page").title = PAGES.board.label;
      const tiles = await dashboard.boardTiles();
      return <BoardPage tiles={tiles} />;
    }),
  );
}

// The login exists as soon as there is any way to sign in - a directory, the
// local setup account, or both. A deployment with neither keeps working
// unchanged instead of offering a sign-in that cannot succeed, and the header
// button is gated on the same condition.
//
// The setup account counts here on purpose: it is what makes a fresh server
// configurable at all, since the pages on which LDAP gets configured are behind
// this very block.
if (auth.enabled || setupAccount.enabled) {
  pages.get(
    "/login",
    ...ssr((c) => {
      c.get("page").title = "Anmelden";
      return <LoginPage error={c.req.query("error")} />;
    }),
  );

  /**
   * The login page again, carrying the lock and the 429 it deserves.
   *
   * Rendered rather than redirected to, unlike every other failure here: a
   * redirect would end in a plain 200 and throw the status away, and the status
   * is the part a proxy or a log can act on. Nothing is resubmitted by a refresh
   * that would cost anything - a locked name never reaches the directory.
   */
  const lockedResponse = async (remainingMs: number) => {
    const seconds = Math.ceil(remainingMs / 1000);
    const page = await html(
      <LoginPage error="too_many_attempts" retryAfterSeconds={seconds} />,
      { title: "Anmelden" },
    );
    return new Response(page.body, {
      status: 429,
      headers: {
        ...Object.fromEntries(page.headers),
        "Retry-After": String(seconds),
      },
    });
  };

  /**
   * Who this request is from, as far as the throttle is concerned.
   *
   * `getConnInfo` throws when the Bun server is not on the context - which it is
   * in production, but not in every test harness - and an address the throttle
   * cannot read must never be the reason a login fails.
   */
  const addressOf = (c: Context) => {
    let socket: string | null = null;
    try {
      socket = getConnInfo(c).remote.address ?? null;
    } catch {
      socket = null;
    }
    return clientAddress(
      c.req.header("X-Forwarded-For"),
      socket,
      config.trustedProxies,
    );
  };

  /**
   * Writes both cookies at once, because they have to agree.
   *
   * The session carries the preferences so pages can read them without a query;
   * the theme cookie exists so the HTML shell is right in its first byte, which
   * the session alone cannot guarantee for a visitor who then signs out. Setting
   * one without the other is how a user ends up looking at a light page while the
   * profile insists they chose dark, so there is one function that does both and
   * every caller uses it.
   *
   * They are protected differently on purpose: the session is signed and
   * httpOnly because it says who you are, the theme cookie is neither because it
   * says what colour the page is. The script in the Layout has to be able to read
   * and write it.
   */
  const issueSession = (c: Context, user: SessionUser) => {
    setCookie(
      c,
      SESSION_COOKIE,
      createSession(user, auth.session.secret!, auth.session.ttlHours),
      {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: auth.session.secureCookie,
        maxAge: auth.session.ttlHours * 3600,
      },
    );

    setCookie(c, THEME_COOKIE, themeCookieValue(user.darkMode === true), {
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
      secure: auth.session.secureCookie,
      // Deliberately outlives the session: signing out should not throw the
      // choice away and hand somebody a bright white login page at night.
      maxAge: 365 * 24 * 3600,
    });
  };

  pages.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const username = typeof form.username === "string" ? form.username : "";
    const address = addressOf(c);

    // Before the directory is asked, so guessing costs the attacker a request
    // and this server neither a bind nor a password comparison.
    const locked = loginThrottle.lockedFor(username, address);
    if (locked > 0) return lockedResponse(locked);

    const password = typeof form.password === "string" ? form.password : "";

    // The setup account first, and a name that belongs to it is decided there
    // and nowhere else: "wrong" does not fall through to the directory. That
    // keeps the name unambiguously local and stops anybody learning by trial
    // whether a directory entry of the same name exists.
    const local = await verifySetupAccount(username, password);
    const result =
      local.kind === "ok"
        ? ({ ok: true, data: local.user } as const)
        : local.kind === "wrong"
          ? ({ ok: false, error: "invalid_credentials" } as const)
          : await authenticate(username, password);

    // Redirect after POST either way, so a refresh never resubmits the password.
    // Only the error code travels in the URL, never the credentials.
    if (!result.ok) {
      // Only a wrong password counts towards the lock. An unreachable directory
      // is not the user's mistake, and counting it would lock everyone out of a
      // site that is merely having a bad day.
      if (result.error === "invalid_credentials") {
        const nowLocked = loginThrottle.recordFailure(username, address);
        if (nowLocked > 0) return lockedResponse(nowLocked);
      }
      return c.redirect(`/login?error=${encodeURIComponent(result.error)}`, 303);
    }

    loginThrottle.recordSuccess(username, address);

    // Records the sign-in and hands back what this person chose last time. It
    // never throws: somebody the directory accepted is signed in whether or not
    // the preferences table could be reached, because refusing them a session
    // over a cosmetic setting would turn a nicety into an outage.
    const preferences = await rememberSignIn(
      result.data.username,
      result.data.displayName,
    );

    issueSession(c, {
      ...result.data,
      ...(preferences.timezone ? { timezone: preferences.timezone } : {}),
      ...(typeof preferences.darkMode === "boolean"
        ? { darkMode: preferences.darkMode }
        : {}),
    });
    return c.redirect("/", 303);
  });

  // POST, not GET: with SameSite=Lax a cross-site link would still carry the
  // cookie, so a GET route would let any page sign the user out.
  pages.post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, {
      path: "/",
      secure: auth.session.secureCookie,
    });
    return c.redirect("/", 303);
  });

  // Sends anonymous visitors to the login instead of rendering the page. The
  // check lives here rather than in the page so a route can never be added
  // without it by forgetting a guard inside the component.
  const requireLogin = createMiddleware(async (c, next) => {
    if (!currentUser()) return c.redirect("/login", 303);
    await next();
  });

  /**
   * Sends a signed-in user without `role` away as if the page did not exist,
   * rather than telling them what they are missing. Anonymous visitors still get
   * the login, so a bookmark keeps working after the session expires.
   */
  /**
   * The measurement pages, for whoever may see any measurements at all.
   *
   * Not `requireRole("data")`: since the ladder went, membership of a data group
   * is a source of rights on its own, and somebody in `klasse-8b` with no role
   * at all may correct their own class's readings. What they then see is decided
   * by the row-level policies, not here - this only keeps the page from being a
   * dead end for people who would find nothing on it.
   */
  const requireDataAccess = createMiddleware(async (c, next) => {
    const user = currentUser();
    if (!user) return c.redirect("/login", 303);
    const declared = (await listDataGroups()).map((group) => group.name);
    if (!canReachData(user, auth, declared)) return c.notFound();
    await next();
  });

  const requireRole = (role: Role) =>
    createMiddleware(async (c, next) => {
      const user = currentUser();
      if (!user) return c.redirect("/login", 303);
      if (!hasRole(user, role, auth)) return c.notFound();
      await next();
    });

  /**
   * The API token pages, for whoever has a group a token could belong to.
   *
   * Narrower than `requireDataAccess` on purpose: that one also admits the
   * `data` role, which sees every group but is in none. A token has to be owned
   * by a *data group*, so somebody with the role and no membership would find a
   * page they cannot use. Administrators are let in because they may act for
   * any group.
   */
  const requireGroupMember = createMiddleware(async (c, next) => {
    const user = currentUser();
    if (!user) return c.redirect("/login", 303);
    if (!hasRole(user, "admin", auth)) {
      const declared = (await listDataGroups()).map((group) => group.name);
      if (dataGroupsOf(user, declared).length === 0) return c.notFound();
    }
    await next();
  });

  // Open to anyone signed in, and the only page where a user writes anything
  // about themselves. What they may write is their own presentation - never a
  // group, which decides access and comes from the directory.
  pages.get(
    "/profile",
    requireLogin,
    ...ssr(async (c) => {
      c.get("page").title = PAGES.profile.label;
      const user = currentUser()!;
      // Awaited here and not in the prop: Solid compiles props into getters, and
      // a getter cannot be async - the page would receive a Promise.
      const record = await userRecord(user.username);
      const declared = await listDataGroups();
      return (
        <ProfilePage
          user={user}
          roles={rolesOf(user, auth)}
          record={record}
          dataGroups={dataGroupsOf(user, declared.map((group) => group.name))}
          saved={c.req.query("saved") === "1"}
          {...(c.req.query("error") ? { error: c.req.query("error")! } : {})}
        />
      );
    }),
  );

  pages.post("/profile", requireLogin, sameOrigin, async (c) => {
    const user = currentUser()!;
    const form = await c.req.parseBody();
    const timezone = typeof form.timezone === "string" ? form.timezone : null;
    // An unchecked box sends nothing at all, which is how a checkbox says false.
    const darkMode = form.darkMode === "on";

    const outcome = await savePreferences(user.username, { timezone, darkMode });
    if (!outcome.ok) {
      return c.redirect(`/profile?error=${encodeURIComponent(outcome.error)}`, 303);
    }

    // Re-issued rather than left to expire: the session carries the preferences
    // so pages need no query for them, which only works if saving updates it. An
    // 8-hour-old cookie insisting on the old timezone is exactly the bug that
    // looks like the save silently failing.
    //
    // Built field by field rather than spread over the old session: spreading
    // would carry the previous timezone along, and clearing the field back to
    // "use the browser's" would then appear to do nothing.
    issueSession(c, {
      username: user.username,
      displayName: user.displayName,
      groups: user.groups,
      ...(user.setup ? { setup: true as const } : {}),
      ...(outcome.preferences.timezone
        ? { timezone: outcome.preferences.timezone }
        : {}),
      darkMode,
    });
    return c.redirect("/profile?saved=1", 303);
  });

  // The SQL console. Both roles use the same page; which connection it runs on
  // is decided per request, so an administrator gets write access and everyone
  // else read-only, without a second page to keep in step.
  if (sqlConsole.enabled) {
    /** Renders the console for whoever is asking, having run `statement`. */
    const renderConsole = async (statement: string, confirmed: boolean) => {
      // The capability comes from the request's own user, never from the form.
      const writable = hasRole(currentUser(), "admin", auth);
      if (!statement.trim()) return <SqlPage statement="" writable={writable} />;

      const result = await runConsoleSql(statement, writable, confirmed);
      return (
        <SqlPage
          statement={statement}
          writable={writable}
          result={result.ok ? result.data : null}
          error={result.ok ? null : result.error}
        />
      );
    };

    // Open to anyone signed in. What a statement may see is decided by the
    // row-level policies and not by this guard - which is the only way to bound
    // a query somebody wrote themselves. Writing still needs `admin`, decided
    // further in.
    pages.get(
      "/sql",
      requireLogin,
      ...ssr((c) => {
        c.get("page").title = PAGES.sql.label;
        return renderConsole("", false);
      }),
    );

    // POST, because a statement may change data: a GET would be repeated by a
    // refresh and reachable from a foreign page by a link or an image tag.
    pages.post(
      "/sql",
      requireLogin,
      ...ssr(async (c) => {
        c.get("page").title = PAGES.sql.label;
        const form = await c.req.parseBody();
        // Only the second submit carries this, so a deletion always needs two
        // deliberate clicks rather than one.
        return renderConsole(
          typeof form.statement === "string" ? form.statement : "",
          form.confirm === "1",
        );
      }),
    );
  }

  pages.get(
    "/management/data",
    requireDataAccess,
    ...ssr(async (c) => {
      c.get("page").title = PAGES.data.label;
      // The change log needs the data role, unlike the two datasets, which a
      // group member reaches too. Showing its card to everybody here sent them
      // to a 404 - the card has to ask the same question the route does.
      const maySeeAudit = hasRole(currentUser(), "data", auth);
      const [measurementCount, logCount, auditCount] = await Promise.all([
        measurements.count(),
        logEntries.count(),
        maySeeAudit ? auditLog.count() : Promise.resolve(0),
      ]);
      return (
        <ManageDataPage
          maySeeAudit={maySeeAudit}
          counts={{
            measurements: measurementCount,
            "log-entries": logCount,
            audit: auditCount,
          }}
        />
      );
    }),
  );

  // One registration per dataset: the table, saving and deleting are written
  // once in ./management/routes and differ only in the backend handed in.
  for (const backend of [measurementBackend, logEntryBackend]) {
    registerResourceRoutes(pages, backend as never, {
      requireRole: requireDataAccess,
      sameOrigin,
    });
  }

  /**
   * The change log, for the data role rather than for anyone who may edit
   * something.
   *
   * It would read more naturally as "whoever may change measurements may see the
   * record of changes", and that is what this said at first - wrongly.
   * `audit_log` carries the full contents of every row before and after, and it
   * has no row-level policy of its own, so a member of one data group reading it
   * would see other groups' measurements through the back door. Giving it a
   * group of its own is the proper fix and is not done here.
   *
   * Taking something back changes data again and stays with administrators.
   */
  registerAuditRoutes(pages, {
    requireRead: requireRole("data"),
    requireAdmin: requireRole("admin"),
    sameOrigin,
  });

  // The devices, which live in The Things Network rather than in this database.
  // Revealing a device's AppKey is a rung higher than seeing the page, the same
  // way taking a change back is.
  registerDeviceRoutes(pages, {
    requireRole: requireRole("management"),
    requireAdmin: requireRole("admin"),
    sameOrigin,
  });

  // The configuration overview. Administrators only: it lists bind accounts,
  // database roles and the shape of every secret, which is deployment knowledge
  // rather than something the management role needs.
  registerConfigRoutes(pages, {
    requireAdmin: requireRole("admin"),
    sameOrigin,
  });

  registerDataGroupRoutes(pages, {
    requireAdmin: requireRole("admin"),
    sameOrigin,
  });

  registerBoardRoutes(pages, {
    requireRole: requireRole("board"),
    sameOrigin,
  });

  // API tokens. Not behind a role: a token belongs to a data group, so what
  // matters is being in one - see requireGroupMember.
  registerTokenRoutes(pages, { requireGroupMember, sameOrigin });

  // The guides and the files they draw on. Their own role, because looking
  // after teaching material is neither measurements nor devices - and an
  // editor should not inherit either.
  registerGuideRoutes(pages, {
    requireEditor: requireRole("editor"),
    sameOrigin,
  });

  registerFileRoutes(pages, {
    requireEditor: requireRole("editor"),
    sameOrigin,
  });
}

/**
 * The legal pages exist whenever their text does - decided per request, not once
 * at startup.
 *
 * Registering them conditionally would mean that filling in an Impressum on the
 * configuration page did nothing until somebody restarted the server, and a
 * restart is not something one does to publish a page. The route is always
 * there; without text it is simply not found, which is the same thing from
 * outside.
 */
pages.get(
  "/impressum",
  ...ssr((c) => {
    if (!legal.impressum) return c.notFound();
    c.get("page").title = "Impressum";
    return <ImpressumPage />;
  }),
);

pages.get(
  "/datenschutz",
  ...ssr((c) => {
    if (!legal.datenschutz) return c.notFound();
    c.get("page").title = "Datenschutz";
    return <DatenschutzPage />;
  }),
);

/**
 * The uploaded files, listed.
 *
 * Deliberately **not** bound to `content.workshop` the way the page above is:
 * files stand on their own, and until this page existed they were reachable
 * only by knowing an address, because the listing lived at the foot of a page
 * that a missing workshop text took down with it.
 *
 * `/downloads/<name>` serves one file and is registered on the root app
 * (index.ts). It matches only with a segment after the slash, so this bare path
 * reaches the pages instead of being swallowed by it.
 */
pages.get(
  "/downloads",
  ...ssr(async (c) => {
    c.get("page").title = PAGES.downloads.label;
    // Awaited before the element, not inside a prop: Solid's SSR transform turns
    // every dynamic prop into a getter, and a getter cannot be awaited in.
    const files = await listVisibleFiles();
    return <DownloadsPage files={files} />;
  }),
);

//====================================
// ANLEITUNGEN
//====================================

/**
 * The addresses of the guides, and the one trap in this file.
 *
 * `/anleitungen/*` matches everything under the prefix, so **it is registered
 * last**. Hono takes the first route that matches, and anything fixed added
 * under `/anleitungen/` after this line would never be reached - a failure with
 * no error in it, on a page that renders perfectly and is simply the wrong one.
 * `guides-routes.test.ts` checks the order, the same way
 * `devices-routes.test.ts` checks `/photo` against `/:deviceId`.
 */

/** May this person see a page that has not been published? */
const mayEditGuides = () => hasRole(currentUser(), "editor", auth);

/** The slug the written overview lives under, at the root of the tree. */
const OVERVIEW_SLUG = "uebersicht";

/** The pages directly below this one, as links. Drafts only for an editor. */
const childLinks = (parentId: string | null, drafts: boolean) => {
  const level =
    parentId === null
      ? guideTree({ drafts })
      : (function find(nodes): ReturnType<typeof guideTree> {
          for (const node of nodes) {
            if (node.id === parentId) return node.children;
            const deeper = find(node.children);
            if (deeper.length > 0) return deeper;
          }
          return [];
        })(guideTree({ drafts }));

  return level.map((child) => ({
    href: `${PAGES.guides.href}/${guidePath(child)}`,
    label: child.title,
  }));
};

pages.get(
  PAGES.guides.href,
  ...ssr(async (c) => {
    c.get("page").title = PAGES.guides.label;
    const drafts = mayEditGuides();

    /*
     * The overview is a guide like any other, written in the editor and stored
     * at the root under `OVERVIEW_SLUG`. There is no special row and no
     * generated grid of tiles: a written overview can say which guide to read
     * first, and a generated one can only repeat the menu.
     *
     * Until somebody writes it, the root pages are listed instead. That is not
     * a second design - it is the empty state, and it names the next step for
     * whoever can take it.
     */
    const overview = allGuides().find(
      (entry) => entry.parentId === null && entry.slug === OVERVIEW_SLUG,
    );
    const guide =
      overview && (overview.published || drafts)
        ? await guideBody(overview.id)
        : null;

    if (!guide) {
      return (
        <EmptyGuidesPage mayEdit={drafts} roots={childLinks(null, drafts)} />
      );
    }

    return (
      <GuidePage
        title={guide.title}
        body={guide.body}
        below={childLinks(null, drafts).filter(
          (link) => link.href !== `${PAGES.guides.href}/${OVERVIEW_SLUG}`,
        )}
        {...(guide.published ? {} : { draft: true })}
      />
    );
  }),
);

/**
 * The two addresses the guides used to live at.
 *
 * Three lines, and they are what keeps every printed worksheet and every link
 * in a sent mail working. The targets are the slugs the two pages are expected
 * to be re-created under - see packages/api/docs/anleitungen.md, which also
 * says what to do if they were given different ones.
 *
 * Above the wildcard, although neither collides with it: everything that is
 * not the wildcard belongs above the wildcard, and a rule with an exception is
 * a rule nobody follows.
 */
for (const [alt, neu] of [
  ["/workshop", "workshop"],
  ["/guides/esp32", "esp32"],
] as const) {
  pages.get(alt, (c) => c.redirect(`${PAGES.guides.href}/${neu}`, 301));
}

// ---- ZULETZT: der Platzhalter, der alles darunter schluckt ----
//
// `{.+}` and not `*`, for two reasons that both bite. A bare `*` matches the
// empty rest as well, so it would answer `/anleitungen` too and swallow the
// overview above it. And Hono gives a `*` route no parameter to read the match
// back from - `c.req.param("*")` is null - so the handler would silently see an
// empty path and answer 404 for every guide on the site.
pages.get(
  `${PAGES.guides.href}/:pfad{.+}`,
  ...ssr(async (c) => {
    /*
     * Taken from the path rather than from the parameter, and not decoded.
     * Hono hands a named parameter back percent-decoded, and a slug is
     * `[a-z0-9-]` only - so an encoded request should simply fail to match
     * rather than be turned into something that might.
     */
    const path = c.req.path.slice(`${PAGES.guides.href}/`.length);
    const drafts = mayEditGuides();

    const entry = guideAt(path);
    if (!entry) {
      /*
       * Not in the tree: it may be an address a page used to have. Only then is
       * the table asked, so a hit costs nothing and a miss costs one query -
       * and a printed worksheet keeps working after a rename.
       */
      const forwarding = await forwardingFor(path);
      if (forwarding && forwarding !== path) {
        return c.redirect(`${PAGES.guides.href}/${forwarding}`, 301);
      }
      return c.notFound();
    }

    // A draft is a 404 for everybody else, not a 403: "this exists but you may
    // not see it" is more than an anonymous visitor needs to be told.
    if (!entry.published && !drafts) return c.notFound();

    const guide = await guideBody(entry.id);
    if (!guide) return c.notFound();

    c.get("page").title = guide.title;
    const parent = allGuides().find((other) => other.id === entry.parentId);

    return (
      <GuidePage
        title={guide.title}
        body={guide.body}
        below={childLinks(entry.id, drafts)}
        parent={
          parent
            ? { href: `${PAGES.guides.href}/${guidePath(parent)}`, label: parent.title }
            : PAGES.guides
        }
        {...(guide.published ? {} : { draft: true })}
      />
    );
  }),
);

/**
 * The 404 page, as a finished response.
 *
 * Exported rather than registered here: a `notFound` handler on this sub-app is
 * dropped when it is mounted, so index.ts puts it on the root app. The
 * rendering stays here because that file is `.ts` and cannot hold JSX.
 */
export const renderNotFound = async (): Promise<Response> => {
  const page = await html(<NotFoundPage />, { title: "Seite nicht gefunden" });
  return new Response(page.body, { status: 404, headers: page.headers });
};

export default pages;
