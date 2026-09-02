/**
 * Keeping the addresses on the legal pages out of the served HTML.
 *
 * **What this does and does not do.** The address is not in the page; it is
 * assembled in the browser from two halves. A harvester that only fetches HTML
 * and matches `\S+@\S+` finds nothing, and that is the great majority of them.
 * A harvester that runs JavaScript gets the address, and no amount of encoding
 * changes that - anything the browser can undo, a scraper can undo. The
 * protection here is the requirement to execute, not the encoding, and the
 * encoding is ROT13 precisely because pretending otherwise would be worse than
 * saying so.
 *
 * **Why there is still a fallback.** §5 DDG wants the address on the Impressum
 * reachable, and an address that exists only for visitors with JavaScript is a
 * poor answer to that. So the markup carries a `<noscript>` with the address in
 * a form a person reads and a naive pattern does not match - "name (at) host".
 * That is for availability, not a second line of defence; it is legible to
 * anything that bothers to look.
 *
 * The local part and the host are kept apart on purpose. ROT13 leaves `@`
 * alone, so encoding the address whole would still leave the one character
 * every address pattern keys on sitting in the attribute.
 */

/** ROT13. Its own inverse, which is why the browser side needs no second table. */
export const rot13 = (text: string): string =>
  text.replace(/[a-zA-Z]/g, (character) => {
    const code = character.charCodeAt(0);
    const base = code < 97 ? 65 : 97;
    return String.fromCharCode(((code - base + 13) % 26) + base);
  });

/** Whether a piece of link text is itself an address rather than a word. */
export const looksLikeAddress = (text: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());

/** `name@host` split in two, or null if it is not an address at all. */
export const splitAddress = (
  address: string,
): { local: string; host: string } | null => {
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  return { local: address.slice(0, at), host: address.slice(at + 1) };
};

/** The form a person reads when JavaScript did not run. */
export const readableAddress = (address: string): string =>
  address.replace("@", " (at) ");

/**
 * What stands there without JavaScript.
 *
 * When the link text is the address - which is how every address in these
 * documents is written - saying it twice would be silly, so only the readable
 * address appears. When the text is a word ("Kontakt"), the address is added
 * behind it, because otherwise turning JavaScript off would remove the contact
 * from the Impressum entirely.
 */
export const fallbackText = (label: string, address: string): string =>
  looksLikeAddress(label)
    ? readableAddress(address)
    : `${label} (${readableAddress(address)})`;
