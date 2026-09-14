type Attrs = Record<string, any> & { class?: string; style?: string };
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function section(title: string, opts: { open?: boolean; id?: string; extra?: Node } = {}): { root: HTMLDetailsElement; body: HTMLDivElement } {
  const body = h('div', { class: 'sec-body' });
  const summary = h('summary', { class: 'sec-title' }, h('span', { class: 'sec-name' }, title));
  if (opts.extra) summary.append(opts.extra);
  const root = h('details', { class: 'sec', id: opts.id }, summary, body);
  // Sections start collapsed unless asked otherwise; the user's own toggles are remembered.
  const key = 'sg.panel.' + opts.id;
  let open = opts.open === true;
  try {
    const saved = opts.id ? localStorage.getItem(key) : null;
    if (saved !== null) open = saved === '1';
  } catch { /* storage unavailable */ }
  root.open = open;
  let current = open;
  root.addEventListener('toggle', () => {
    // Setting `open` above also dispatches a toggle event: only persist real changes.
    if (root.open === current) return;
    current = root.open;
    try { if (opts.id) localStorage.setItem(key, root.open ? '1' : '0'); } catch { /* ignore */ }
  });
  return { root, body };
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple });
    input.addEventListener('change', () => resolve(Array.from(input.files || [])));
    input.click();
  });
}

let toastTimer = 0;
export function toast(msg: string, kind: 'info' | 'error' = 'info'): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el!.className = ''), 3200);
}
