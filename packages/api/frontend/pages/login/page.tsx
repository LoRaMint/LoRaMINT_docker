import Layout from "../../components/layout/Layout";
import { auth } from "../../../config";
import type { AuthError } from "../../../services";

/**
 * Login form. Submits via POST so the password never lands in a URL, in the
 * browser history or in an access log. The credentials are checked against LDAP
 * in the POST /login handler; on failure it redirects back here with an error
 * *code*, which is mapped to a fixed message below - nothing caller-controlled
 * is ever rendered.
 *
 * Note on styling: daisyUI 5 dropped the v4 form classes (`form-control`,
 * `label-text`, `input-bordered`), so fields go through components/Field.tsx,
 * which is built from plain Tailwind for exactly that reason.
 */
/**
 * The codes this page understands: what the directory can say, plus the one the
 * route itself produces when a name has been locked out for guessing.
 */
type LoginMessage = AuthError | "too_many_attempts";

const MESSAGES: Record<LoginMessage, string> = {
  invalid_credentials: "Anmeldename oder Passwort ist falsch.",
  unavailable: "Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.",
  disabled: "Die Anmeldung ist auf diesem Server nicht aktiviert.",
  too_many_attempts:
    "Zu viele Fehlversuche. Die Anmeldung ist vorübergehend gesperrt.",
};

/** "in 5 Minuten", "in 1 Minute", "in wenigen Sekunden". */
const inWords = (seconds: number) => {
  if (seconds <= 60) return "in wenigen Sekunden";
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "in 1 Minute" : `in ${minutes} Minuten`;
};

export default function LoginPage(props: {
  error?: string | null;
  /**
   * How long the lock still has to run. Computed on the server from its own
   * clock, never taken from the request - the same rule the codes follow.
   */
  retryAfterSeconds?: number;
}) {
  const labelClass = "block";
  const captionClass = "block text-sm mb-1 text-base-content/80";
  const fieldClass = "input w-full";

  // Unknown codes fall back to the neutral message instead of being echoed.
  const message = !props.error
    ? null
    : props.error === "too_many_attempts" && props.retryAfterSeconds
      ? `Zu viele Fehlversuche. Bitte ${inWords(props.retryAfterSeconds)} erneut versuchen.`
      : (MESSAGES[props.error as LoginMessage] ?? MESSAGES.invalid_credentials);

  return (
    <Layout>
      <div class="flex justify-center">
        <div class="w-full max-w-sm mt-8">
          <form
            method="post"
            action="/login"
            class="rounded-box border border-base-300 p-6"
          >
            <h2 class="text-xl font-bold border-b border-base-300 pb-2 mb-4">
              Anmelden
            </h2>

            <div class="grid gap-4">
              <label class={labelClass}>
                <span class={captionClass}>Anmeldename</span>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck={false}
                  class={fieldClass}
                />
              </label>

              <label class={labelClass}>
                <span class={captionClass}>Passwort</span>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autocomplete="current-password"
                  class={fieldClass}
                />
              </label>

              <button type="submit" class="btn btn-primary w-full">
                Anmelden
              </button>

              {/* The label names the destination rather than the wish, because
                  what the variable points at is a user directory one has to be
                  signed in to - not a forgotten-password path. Promising the
                  latter would strand exactly the person who cannot get in.
                  Without the variable there is nothing to point at, and the
                  honest answer is the one that was always there. */}
              {auth.passwordResetUrl ? (
                <a
                  href={auth.passwordResetUrl}
                  rel="noopener noreferrer"
                  class="link link-hover text-sm text-center"
                >
                  Passwort ändern in der Nutzerverwaltung
                </a>
              ) : (
                <span class="text-sm text-center text-base-content/60">
                  Passwort vergessen? Bitte an die Administration wenden.
                </span>
              )}
            </div>
          </form>

          {/* Below the card, so the form does not jump when it appears. */}
          {message && (
            <p role="alert" class="text-error text-sm text-center mt-3">
              {message}
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
