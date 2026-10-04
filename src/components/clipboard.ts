/**
 * Puts text on the clipboard, and says whether it got there. Issue #589.
 *
 * `navigator.clipboard` exists only on a secure origin - https, or localhost -
 * so on an installation reached as `http://192.168.0.190:8090` it is undefined,
 * and the `navigator.clipboard?.writeText(text)` every copy button used to call
 * did nothing at all, silently. Most installations on a LAN are exactly that.
 *
 * So the asynchronous API where the browser offers it, and otherwise the older
 * route every browser still honours inside a click: a hidden textarea, selected,
 * and `document.execCommand('copy')`. It is deprecated and it is also the only
 * thing that works over plain http, which is why it is here and nowhere else -
 * every copy button in the interface goes through this function, so the rule is
 * written once.
 *
 * Resolves false rather than throwing, so a caller can say it could not copy
 * instead of saying "Copied" over an empty clipboard.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (a permission, a document without focus): the older route may still work.
    }
  }
  return copyThroughSelection(text);
}

/**
 * The fallback: select the text in a textarea nobody sees, and copy the
 * selection. Whatever had focus and whatever was selected are put back, so a
 * copy pressed while somebody is typing does not lose their caret.
 */
function copyThroughSelection(text: string): boolean {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const ranges: Range[] = [];
  if (selection !== null) {
    for (let at = 0; at < selection.rangeCount; at += 1) ranges.push(selection.getRangeAt(at));
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  // On screen as far as the browser is concerned - a hidden element cannot be selected - but out of sight.
  Object.assign(area.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(area);

  let copied = false;
  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    area.remove();
    focused?.focus({ preventScroll: true });
    if (selection !== null && ranges.length > 0) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
  }
  return copied;
}
