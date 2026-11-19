/*
 * Keeps the household profile, last plan and checklist ticks in localStorage
 * so a refresh (or tomorrow's visit) does not lose them. Storage can be
 * unavailable (private mode, blocked cookies), so every access is guarded and
 * failure simply means "no persistence". Nothing is stored on the server.
 */

const KEY = 'airwise.session.v1';

/** @returns {{profile?: object, plan?: object, done?: Record<string, boolean>, chat?: Array, selected?: string[], areaUnit?: string} | null} */
export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Quota exceeded or storage disabled: keep working in memory.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore: nothing to clear.
  }
}
