/**
 * Puts the addresses on the legal pages back together in the browser.
 *
 * The server sends two halves and no `@`; this joins them. See
 * lib/mail-obfuscation.ts for what that buys and what it does not.
 *
 * Inline rather than an island: it is fifteen lines that only two pages need,
 * and a separate request for that would cost more than it saves. The same
 * reasoning the Layout already follows for its two scripts.
 *
 * The link is built with `textContent`, never `innerHTML`. The data comes from
 * a setting an administrator writes, so it is not arbitrary - but a page that
 * pastes stored text into markup is exactly the shape of mistake the Markdown
 * renderer was written to avoid, and there is no reason to reintroduce it here.
 */
export default function MailAddresses() {
  return (
    <script>{`
      (function () {
        var rot13 = function (s) {
          return s.replace(/[a-zA-Z]/g, function (c) {
            var code = c.charCodeAt(0), base = code < 97 ? 65 : 97;
            return String.fromCharCode(((code - base + 13) % 26) + base);
          });
        };
        var spans = document.querySelectorAll("span.lm-mail");
        for (var i = 0; i < spans.length; i++) {
          var span = spans[i];
          var user = span.getAttribute("data-u");
          var host = span.getAttribute("data-h");
          if (!user || !host) continue;
          var address = rot13(user) + "@" + rot13(host);
          var label = span.getAttribute("data-l");
          var link = document.createElement("a");
          link.className = "link";
          link.href = "mailto:" + address;
          link.textContent = label ? rot13(label) : address;
          span.replaceWith(link);
        }
      })();
    `}</script>
  );
}
