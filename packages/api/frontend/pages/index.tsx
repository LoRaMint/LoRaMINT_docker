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
  manage,
  setupAccount,
} from "../../config";
import { verifySetupAccount } from "../../services/setup-account";
import {
  measurements,
  logEntries,
  auditLog,
  authenticate,
  runConsoleSql,
} from "../../services";
import {
  clientAddress,
  createSession,
  currentUser,
  hasRole,
  loginThrottle,
  rolesOf,
  SESSION_COOKIE,
  type Role,
} from "../../lib";
import HomePage from "./home/page";
import PlotsPage from "./plots/page";
import ExportPage from "./export/page";
import StatusPage from "./status/page";
import Esp32GuidePage from "./guides/esp32/page";
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
import ImpressumPage from "./impressum/page";
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
    c.get("page").title = "Plots";
    return <PlotsPage />;
  }),
);

pages.get(
  "/export",
  ...ssr((c) => {
    c.get("page").title = "CSV-Export";
    return <ExportPage />;
  }),
);

pages.get(
  "/status",
  ...ssr(async (c) => {
    c.get("page").title = "Status";
    const [sensors, logs] = await Promise.all([
      measurements.status(),
      logEntries.status(),
    ]);
    return <StatusPage sensors={sensors} logs={logs} />;
  }),
);

pages.get(
  "/guides/esp32",
  ...ssr((c) => {
    c.get("page").title = "Anleitung: ESP32 mit Thonny";
    return <Esp32GuidePage />;
  }),
);

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

    setCookie(
      c,
      SESSION_COOKIE,
      createSession(result.data, auth.session.secret!, auth.session.ttlHours),
      {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: auth.session.secureCookie,
        maxAge: auth.session.ttlHours * 3600,
      },
    );
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
  const requireRole = (role: Role) =>
    createMiddleware(async (c, next) => {
      const user = currentUser();
      if (!user) return c.redirect("/login", 303);
      if (!hasRole(user, role, auth)) return c.notFound();
      await next();
    });

  // Open to anyone signed in: it only shows what the session already contains.
  pages.get(
    "/profile",
    requireLogin,
    ...ssr((c) => {
      c.get("page").title = "Profil";
      const user = currentUser()!;
      return <ProfilePage user={user} roles={rolesOf(user, auth)} />;
    }),
  );

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

    pages.get(
      "/sql",
      requireRole("data"),
      ...ssr((c) => {
        c.get("page").title = "SQL";
        return renderConsole("", false);
      }),
    );

    // POST, because a statement may change data: a GET would be repeated by a
    // refresh and reachable from a foreign page by a link or an image tag.
    pages.post(
      "/sql",
      requireRole("data"),
      ...ssr(async (c) => {
        c.get("page").title = "SQL";
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
    requireRole("management"),
    ...ssr(async (c) => {
      c.get("page").title = "Daten verwalten";
      const [measurementCount, logCount, auditCount] = await Promise.all([
        measurements.count(),
        logEntries.count(),
        auditLog.count(),
      ]);
      return (
        <ManageDataPage
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
      requireRole: requireRole("management"),
      sameOrigin,
    });
  }

  // The change log is read by the same role that writes the data it records.
  // Taking something back is a rung higher, because that changes data again.
  registerAuditRoutes(pages, {
    requireRead: requireRole("management"),
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

export default pages;
