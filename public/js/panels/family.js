import { h, replaceChildren } from '../dom.js';
import { HEALTH_LABELS, KIND_LABELS, WHO_LABELS } from '../labels.js';
import { meter } from './air.js';

/**
 * Family-wide daily checklist (tickable, persisted by the controller) plus
 * health notes for vulnerable members.
 *
 * @param {HTMLElement} el
 * @param {object} plan
 * @param {{done: Record<string, boolean>, onToggle: (id: string, checked: boolean) => void}} options
 */
export function renderFamily(el, plan, { done, onToggle }) {
  const total = plan.checklist.length;
  const completed = plan.checklist.filter((t) => done[t.id]).length;
  const progressText = `${completed} of ${total} done today`;

  const items = plan.checklist.map((task) =>
    h(
      'li',
      { className: 'task' },
      h('input', {
        type: 'checkbox',
        id: `chk-${task.id}`,
        checked: Boolean(done[task.id]),
        onchange: (/** @type {Event} */ e) => onToggle(task.id, /** @type {HTMLInputElement} */ (e.target).checked),
      }),
      h(
        'label',
        { for: `chk-${task.id}` },
        h('span', { className: `who who-${task.who}` }, WHO_LABELS[task.who] ?? task.who),
        h('span', { className: 'task-time' }, task.time),
        h('span', { className: 'task-text' }, task.task),
      ),
    ),
  );

  replaceChildren(
    el,
    h('h2', { className: 'panel-title' }, "Today's family checklist"),
    h('p', { className: 'hint' }, 'Tick things off as you go. Progress is saved on this device only.'),
    h(
      'p',
      { className: 'progress', id: 'progress-text' },
      meter(total ? (completed / total) * 100 : 0, 'meter meter-progress'),
      progressText,
    ),
    h('ul', { className: 'task-list', 'aria-describedby': 'progress-text' }, items),
    h('h2', { className: 'panel-title' }, 'Health notes for your household'),
    h(
      'ul',
      { className: 'notes' },
      plan.healthNotes.map((n) => h('li', null, h('strong', null, `${HEALTH_LABELS[n.group] ?? n.group}: `), n.note)),
    ),
    h(
      'p',
      { className: 'hint' },
      'General guidance, not medical advice. See a doctor for breathlessness, chest pain or worsening asthma.',
    ),
  );
}

/** A ready-to-paste message for the building or school group. */
export function neighbourhoodMessage(plan) {
  const { current, band } = plan.conditions;
  const best = plan.windows.best ? ` Cleanest hours today: ${plan.windows.best.label}.` : '';
  const worst = plan.windows.worst ? ` Avoid outdoor activity ${plan.windows.worst.label}.` : '';
  return `Air alert for ${plan.location.name}: AQI ${current.aqi} (${band.label}).${best}${worst} Keep windows shut at peak hours, avoid burning anything outdoors, and consider sharing rides today. Shared via AirWise.`;
}

/**
 * Community and neighbourhood ideas with a shareable alert.
 * @param {HTMLElement} el
 * @param {object} plan
 * @param {{onCopy: (text: string) => void}} options
 */
export function renderCommunity(el, plan, { onCopy }) {
  const message = neighbourhoodMessage(plan);
  replaceChildren(
    el,
    h('h2', { className: 'panel-title' }, 'Community & neighbourhood'),
    h(
      'p',
      { className: 'hint' },
      'Clean air is a team sport: these ideas multiply your impact across your street, building and school.',
    ),
    h(
      'div',
      { className: 'action-grid' },
      plan.community.map((idea) =>
        h(
          'article',
          { className: 'action community' },
          h(
            'p',
            { className: 'badges' },
            h('span', { className: 'badge badge-muted' }, KIND_LABELS[idea.kind] ?? idea.kind),
          ),
          h('h3', null, idea.title),
          h('p', null, idea.detail),
        ),
      ),
    ),
    h(
      'section',
      { className: 'share card-inset', 'aria-labelledby': 'share-title' },
      h('h3', { id: 'share-title' }, 'Share an air alert with your building or school group'),
      h('p', { className: 'share-text', id: 'share-text' }, message),
      h('button', { type: 'button', className: 'btn btn-secondary', onclick: () => onCopy(message) }, 'Copy message'),
    ),
  );
}
