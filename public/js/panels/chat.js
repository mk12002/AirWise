import { h, replaceChildren } from '../dom.js';

export const STARTER_QUESTIONS = Object.freeze([
  'When can the kids play outside today?',
  'Which purifier size do I need for our bedroom?',
  'Is it safe to go for a morning walk tomorrow?',
]);

/**
 * Appends a chat bubble. Text is inserted as text nodes (never HTML).
 * @param {HTMLElement} log
 * @param {{role: 'user' | 'assistant', text: string, pending?: boolean, lang?: string}} message
 */
export function appendMessage(log, message) {
  const item = h(
    'li',
    { className: `msg msg-${message.role}${message.pending ? ' msg-pending' : ''}` },
    h('span', { className: 'visually-hidden' }, message.role === 'user' ? 'You said: ' : 'AirWise said: '),
    h('p', { lang: message.lang }, message.text),
  );
  log.append(item);
  item.scrollIntoView?.({ block: 'nearest' });
  return item;
}

/** Suggested follow-up questions as buttons. */
export function renderSuggestions(el, questions, onPick) {
  replaceChildren(
    el,
    questions.map((q) => h('button', { type: 'button', className: 'chip chip-button', onclick: () => onPick(q) }, q)),
  );
}
