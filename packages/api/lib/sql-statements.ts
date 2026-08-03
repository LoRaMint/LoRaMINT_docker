/**
 * Recognising where one SQL statement ends and the next begins.
 *
 * The admin console needs this for one reason: Postgres reports only the *last*
 * command of a multi-statement request, so `DELETE FROM t; SELECT 1` comes back
 * tagged `SELECT`. The confirmation step before a deletion keys off that tag, so
 * without this check a deletion could slip past it - not as an attack (an
 * administrator may delete anyway) but as an accident, which is exactly what the
 * confirmation is there to catch.
 *
 * A plain search for `;` would be wrong often enough to be annoying:
 * `DELETE FROM log_entries WHERE message = 'a;b'` contains one and is a single
 * statement. So this skips over the places a semicolon does not separate
 * anything - string literals, quoted identifiers, dollar-quoted bodies and
 * comments.
 */

/**
 * One pass over `text`, reporting both things anyone here wants to know: how
 * many statements it holds, and where the first separating semicolon is.
 *
 * The second is what lets a single statement be cut loose from its terminator
 * without guessing. Trimming a trailing `;` with a regular expression looks
 * equivalent and is not: `SELECT 1;;` keeps one, and `SELECT 1; -- Rest` has the
 * semicolon in the middle. Both then travel into a subquery and turn into a
 * syntax error.
 */
const scan = (text: string): { statements: number; firstSeparator: number } => {
  let statements = 0;
  let firstSeparator = -1;
  let hasContent = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];

    // -- line comment
    if (c === "-" && next === "-") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end + 1;
      continue;
    }

    // /* block comment */, which nests in Postgres
    if (c === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (text[i] === "*" && text[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      continue;
    }

    // 'string literal', where '' is an escaped quote
    if (c === "'") {
      i++;
      while (i < text.length) {
        if (text[i] === "'") {
          if (text[i + 1] === "'") i += 2;
          else {
            i++;
            break;
          }
        } else i++;
      }
      hasContent = true;
      continue;
    }

    // "quoted identifier", where "" is an escaped quote
    if (c === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') i += 2;
          else {
            i++;
            break;
          }
        } else i++;
      }
      hasContent = true;
      continue;
    }

    // $$ body $$ or $tag$ body $tag$
    if (c === "$") {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i));
      if (tag) {
        const marker = tag[0];
        const end = text.indexOf(marker, i + marker.length);
        i = end === -1 ? text.length : end + marker.length;
        hasContent = true;
        continue;
      }
    }

    if (c === ";") {
      // A semicolon only ends a statement if something preceded it; `;;` and a
      // leading `;` are empty statements, not extra ones.
      if (hasContent) {
        statements++;
        if (firstSeparator === -1) firstSeparator = i;
      }
      hasContent = false;
      i++;
      continue;
    }

    if (!/\s/.test(c)) hasContent = true;
    i++;
  }

  // Trailing content without a closing semicolon is still a statement.
  return { statements: statements + (hasContent ? 1 : 0), firstSeparator };
};

/** Counts the statements in `text`, ignoring a trailing semicolon and whitespace. */
export const countStatements = (text: string): number => scan(text).statements;

/** True when `text` holds more than one statement. */
export const hasMultipleStatements = (text: string) => countStatements(text) > 1;

/**
 * The single statement in `text` with its terminator removed, or null when it is
 * not exactly one statement.
 *
 * What "removed" has to mean is the whole point: everything from the separating
 * semicolon onwards goes, not just a semicolon at the very end. With one
 * statement there is at most one separator, and whatever follows it is by
 * definition empty - more semicolons, whitespace, a comment.
 */
export const singleStatement = (text: string): string | null => {
  const { statements, firstSeparator } = scan(text);
  if (statements !== 1) return null;
  return (firstSeparator === -1 ? text : text.slice(0, firstSeparator)).trim();
};
