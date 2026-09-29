/** Keep each JSON frame below the host limit, including escaped control bytes.
 * Do not split surrogate pairs; concatenation preserves bracketed-paste markers.
 */
export function* splitInput(data: string): Generator<string> {
  for (let start = 0; start < data.length;) {
    let end = Math.min(start + 8192, data.length);
    const last = data.charCodeAt(end - 1);
    if (end < data.length && last >= 0xd800 && last <= 0xdbff) end--;
    yield data.slice(start, end);
    start = end;
  }
}
