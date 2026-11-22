/** Shared reading metrics from the approved UI Lab, inside the opaque frame. */
export function previewStyles() {
  return `:root {
    font-family:'DM Sans Variable',Inter,system-ui,-apple-system,sans-serif;
    font-synthesis:none; color-scheme:light;
    --text:#343c3a; --text-strong:#202724; --muted:#797e7a;
    --divider:#e3e6e2; --surface:#f6f7f5; --accent:#375e4c; --document-bg:#fff;
  }
  :root[data-theme='dark'] {color-scheme:dark;--text:#f1f2f1;--text-strong:#f8f8f7;--muted:#b2b5b5;--divider:#2c2e2f;--surface:#242627;--accent:#d4ded8;--document-bg:#191a1b}
  * {box-sizing:border-box}
  html,body {margin:0;padding:0;min-width:0;background:var(--document-bg)}
  body {font-size:16px;font-weight:450;line-height:1.88;letter-spacing:-.003em;color:var(--text);overflow-wrap:anywhere}
  #preview {min-height:120px;display:flow-root;padding-bottom:24px}
  p {margin:0 0 20px}
  h1,h2,h3,h4,h5,h6 {color:var(--text-strong);font-weight:600;line-height:1.4;scroll-margin-top:25px}
  h1 {font-size:28px;letter-spacing:-.04em;margin:30px 0 18px}
  h2 {font-size:19.5px;letter-spacing:-.035em;margin:41px 0 16px}
  h3 {font-size:16px;letter-spacing:-.02em;margin:30px 0 12px}
  h4,h5,h6 {font-size:15px;letter-spacing:-.01em;margin:25px 0 12px}
  :is(h1,h2,h3,h4,h5,h6):first-child {margin-top:0}
  strong {color:var(--text-strong);font-weight:650}
  em {font-style:italic}
  a {color:var(--accent);text-decoration:underline;text-underline-offset:3px}
  ul,ol {margin:15px 0 23px;padding-left:25px}
  li {padding-left:4px;margin:6px 0}
  li>p {margin:6px 0}
  blockquote {margin:25px 0;padding:2px 0 2px 20px;border-left:2px solid var(--accent);color:var(--muted)}
  blockquote p {margin:6px 0}
  code {font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.85em;background:var(--surface);padding:2px 5px;border-radius:4px;letter-spacing:0}
  pre {padding:17px 19px;margin:24px 0;background:var(--surface);border:1px solid var(--divider);border-radius:9px;overflow:auto;line-height:1.7;max-width:100%;white-space:pre}
  pre code {padding:0;background:none}
  hr {border:0;border-top:1px solid var(--divider);margin:35px 0}
  table {border-collapse:collapse;width:100%;margin:24px 0;font-size:14px;display:block;overflow:auto}
  th,td {border:1px solid var(--divider);padding:9px 14px;text-align:left}
  th {font-weight:600;background:var(--surface)}
  input,button,select,textarea {font:inherit;color:inherit}
  button {border:1px solid var(--divider);background:var(--surface);border-radius:7px;padding:6px 12px;cursor:pointer}
  button:hover {border-color:var(--accent)}
  :focus-visible {outline:2px solid var(--accent);outline-offset:2px}
  input:not([type=checkbox]),textarea,select {max-width:100%;border:1px solid var(--divider);border-radius:6px;background:var(--surface);padding:5px 9px}
  img {max-width:100%}
  .katex-display {overflow-x:auto;overflow-y:hidden;padding:6px 0;margin:22px 0}
  .katex {font-size:1.13em}
  .katex-error {white-space:pre-wrap;color:#b94b4b}
  .task-list-item {list-style:none}
  .task-list-item input {margin-right:8px}
  :root[data-compact='true'] body {font-size:15.5px;line-height:1.85}
  @media(prefers-reduced-motion:reduce) {*,*::before,*::after {scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
}
