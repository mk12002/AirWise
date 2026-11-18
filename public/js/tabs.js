/**
 * WAI-ARIA tabs pattern: arrow keys / Home / End move between tabs, only the
 * active tab is in the tab order, and panels are linked with aria-controls.
 *
 * @param {HTMLElement} tablist
 * @returns {{select: (id: string) => void}}
 */
export function setupTabs(tablist) {
  const tabs = /** @type {HTMLElement[]} */ ([...tablist.querySelectorAll('[role="tab"]')]);

  function select(tab, focus = false) {
    for (const t of tabs) {
      const active = t === tab;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
    }
    if (focus) tab.focus();
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      const i = tabs.indexOf(tab);
      const next = {
        ArrowRight: tabs[(i + 1) % tabs.length],
        ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
        Home: tabs[0],
        End: tabs.at(-1),
      }[event.key];
      if (next) {
        event.preventDefault();
        select(next, true);
      }
    });
  }

  return {
    select: (id) => {
      const tab = tabs.find((t) => t.id === id);
      if (tab) select(tab);
    },
  };
}
