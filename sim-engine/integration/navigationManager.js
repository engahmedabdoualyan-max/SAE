/**
 * @file Sticky sub-navigation manager: injects a scrollable pill bar below the
 * page header and keeps the active pill in sync with the viewport via
 * IntersectionObserver.
 *
 * Idempotent by design — calling {@link initNavigation} again removes any bar
 * previously created by this module before rendering the new one.
 *
 * @example
 * import { initNavigation } from './sim-engine/integration/navigationManager.js';
 * initNavigation([
 *   { id: 'sec-dashboard', label: 'Dashboard', icon: '📊' },
 *   { id: 'sec-editor',    label: 'Editor',    icon: '✏️' },
 * ]);
 */

const BAR_ATTR = 'data-sae-subnav';
const STYLE_ID = 'sae-subnav-styles';

/**
 * Inject the module stylesheet once (active-pill rules + scrollbar hiding).
 * @private
 */
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[data-sae-subnav]{scrollbar-width:none;-ms-overflow-style:none}
[data-sae-subnav]::-webkit-scrollbar{display:none}
.sae-subnav-btn.nav-active{background-color:#4f46e5 !important;color:#ffffff !important;border-color:#6366f1 !important}`;
  document.head.appendChild(style);
}

/**
 * Remove any sub-nav bar previously injected by this module, detaching its
 * observers and listeners first. Safe to call when nothing exists yet.
 * @returns {void}
 */
export function destroyNavigation() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`[${BAR_ATTR}]`).forEach((bar) => {
    try {
      bar.__saeDestroy?.();
    } catch {
      /* observer already gone */
    }
    bar.remove();
  });
}

/**
 * Initialize (or re-initialize) the sticky section navigation bar.
 *
 * Behaviour:
 *  - Sticky below the existing `header` (position:sticky; top-16; z-40).
 *  - Dark slate background, horizontally scrollable on mobile.
 *  - Pill buttons with icon + label per section.
 *  - Smooth-scroll on click with header/bar offset compensation.
 *  - Active pill tracked by IntersectionObserver (`.nav-active` class).
 *
 * @param {Array<{id:string, label:string, icon?:string}>} sectionIds
 *   Ordered section descriptors. Sections missing from the DOM are skipped
 *   for observation but still rendered as disabled pills.
 * @param {Object} [opts]
 * @param {string|Element|null} [opts.after] Element/selector after which the
 *   bar is inserted (defaults to the first `header`, else `<body>` start).
 * @returns {HTMLElement|null} The injected nav element, or null when no DOM
 *   or no valid sections are available.
 *
 * @example initNavigation([{id:'map', label:'Map', icon:'🗺'}]);
 */
export function initNavigation(sectionIds = [], opts = {}) {
  if (typeof document === 'undefined') return null;

  const items = Array.isArray(sectionIds)
    ? sectionIds.filter((s) => s && typeof s.id === 'string' && s.id.length > 0)
    : [];
  if (items.length === 0) return null;

  // Idempotency: drop the previous bar (and its observers) first.
  destroyNavigation();
  ensureStyles();

  const o = opts && typeof opts === 'object' ? opts : {};

  // --- build bar -----------------------------------------------------------
  const bar = document.createElement('nav');
  bar.setAttribute(BAR_ATTR, '');
  bar.className =
    'sticky top-16 z-40 w-full border-b border-slate-700 bg-slate-900/95 shadow-md backdrop-blur';
  bar.setAttribute('aria-label', 'Section navigation');

  const scroller = document.createElement('div');
  scroller.className = 'overflow-x-auto whitespace-nowrap';

  const inner = document.createElement('div');
  inner.className = 'mx-auto flex max-w-7xl items-center gap-2 px-4 py-2';
  scroller.appendChild(inner);
  bar.appendChild(scroller);

  const buttons = new Map(); // section id -> button element

  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.target = item.id;
    btn.className =
      'sae-subnav-btn inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none';
    const icon = document.createElement('span');
    icon.className = 'text-base leading-none';
    icon.textContent = item.icon ?? '';
    const label = document.createElement('span');
    label.textContent = item.label ?? item.id;
    if (item.icon) btn.appendChild(icon);
    btn.appendChild(label);

    const target = document.getElementById(item.id);
    if (!target) btn.disabled = true;
    buttons.set(item.id, btn);
    inner.appendChild(btn);
  }

  // --- insert below existing header ----------------------------------------
  let anchor = null;
  if (typeof o.after === 'string') anchor = document.querySelector(o.after);
  else if (o.after instanceof Element) anchor = o.after;
  if (!anchor) anchor = document.querySelector('header');
  if (anchor?.parentElement) anchor.insertAdjacentElement('afterend', bar);
  else document.body.prepend(bar);

  // --- smooth scrolling with offset -----------------------------------------
  const offsetPx = () => {
    const hdr = document.querySelector('header')?.offsetHeight ?? 64;
    return hdr + bar.offsetHeight + 8;
  };

  function setActive(id) {
    for (const [sid, btn] of buttons) {
      const active = sid === id;
      btn.classList.toggle('nav-active', active);
      btn.classList.toggle('bg-indigo-600', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('text-slate-300', !active);
    }
    const activeBtn = buttons.get(id);
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  const onClick = (ev) => {
    const btn = ev.target.closest('[data-target]');
    if (!btn || btn.disabled) return;
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    target.style.scrollMarginTop = `${offsetPx()}px`;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(btn.dataset.target); // instant feedback; observer confirms later
  };
  inner.addEventListener('click', onClick);

  // --- active-section tracking ------------------------------------------------
  let observer = null;
  const visible = new Map(); // id -> intersection ratio

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        let bestId = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId) setActive(bestId);
      },
      { rootMargin: '-15% 0px -45% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
  }

  // Highlight the first valid section immediately.
  const firstValid = items.find((it) => document.getElementById(it.id));
  setActive(firstValid ? firstValid.id : items[0].id);

  // --- teardown hook for idempotent re-init ---------------------------------
  bar.__saeDestroy = () => {
    inner.removeEventListener('click', onClick);
    observer?.disconnect();
    visible.clear();
  };

  return bar;
}

export default initNavigation;
