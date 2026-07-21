/**
 * A tiny project-local behavior registry, parallel to wb-starter's own
 * `x-behavior` system (node_modules/wb-starter/src/wb-viewmodels/index.js).
 * That registry is closed: every `x-behavior` name resolves only to a
 * module co-located inside wb-starter's own package, with no public hook
 * for a consuming project to add its own names into that same attribute.
 * This is that hook, scoped to this project -- a separate attribute
 * (`data-gt-behavior`) so it never collides with wb-starter's own
 * MutationObserver-based `x-behavior` scanning.
 *
 * Each gt-*.js behavior module (fullscreen-toggle.js, pinch-zoom.js, etc.)
 * calls registerBehavior() once, at import time, to add itself --
 * mirroring how gt-fretboard.js self-registers via customElements.define()
 * at the bottom of its own file. scanBehaviors() is called once from
 * index.html, after every behavior module has been imported and WB.scan()
 * has finished, and applies every `[data-gt-behavior]` element's
 * space-separated list of behaviors -- same multi-name convention as
 * `x-behavior="draggable resizable"`.
 *
 * A single shared `context` (this app's one <gt-fretboard> and its card --
 * one page, one fretboard, not a multi-instance component library) is
 * passed to every behavior alongside its element, since most of these need
 * a second target beyond the element they're attached to.
 */
const registry = {};

export function registerBehavior(name, fn) {
  registry[name] = fn;
}

export function scanBehaviors(root, context = {}) {
  root.querySelectorAll('[data-gt-behavior]').forEach((el) => {
    el.getAttribute('data-gt-behavior').split(/\s+/).filter(Boolean).forEach((name) => {
      const fn = registry[name];
      if (!fn) { console.warn(`[gt-behaviors] Unknown behavior: ${name}`); return; }
      fn(el, context);
    });
  });
}
