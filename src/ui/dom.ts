type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/** Tiny hyperscript helper: h('button', { class: 'x', onclick: fn }, 'Text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, ...children);
  return el;
}

export function append(el: Element, ...children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** Segmented single-choice control built from radio buttons. */
export function segmented<T extends string>(
  name: string,
  label: string,
  options: readonly { value: T; label: string }[],
  selected: T,
  onChange: (value: T) => void,
): HTMLFieldSetElement {
  return h(
    'fieldset',
    { class: 'segmented' },
    h('legend', {}, label),
    h(
      'div',
      { class: 'segmented-options' },
      ...options.map((o) =>
        h(
          'label',
          {},
          h('input', {
            type: 'radio',
            name,
            value: o.value,
            checked: o.value === selected,
            onchange: () => onChange(o.value),
          }),
          h('span', {}, o.label),
        ),
      ),
    ),
  );
}
