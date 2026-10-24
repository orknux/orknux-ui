/**
 * An http(s) address as it will be stored: typed without a scheme, it is taken
 * as `http://`; typed with one, it is left as it is.
 *
 * The server applies the same rule on every save (`Addresses.withScheme`), so
 * this is not what makes an address work - it is what lets the person see the
 * http before they press Save, instead of finding it in the list afterwards. A
 * field calls it when it loses focus, so typing is never rewritten under the
 * caret. Only for a field that is an http(s) address: a mail server's host and
 * a proxy's host are not, and stay as typed.
 */
export function withScheme(text: string): string {
  const given = text.trim();
  if (given === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(given)) return given;
  return `http://${given}`;
}
