# Security Policy

## Reporting a vulnerability

Please open a private security advisory on this repository (Security tab → "Report a vulnerability") instead of a
public issue.

## Security design

| Threat                      | Mitigation                                                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API key exposure            | `GEMINI_API_KEY` is read from the environment on the server only. `.env` is git-ignored, and the key is never sent to the browser, returned by `/api/health` or logged.                                                          |
| XSS                         | Strict CSP (`script-src 'self'`, no inline scripts or style attributes). All AI and user text is rendered with text nodes through the `h()` and `svg()` helpers, never `innerHTML`; a regression test checks this.               |
| Prompt injection            | User notes, chat messages and history are JSON-encoded inside tagged blocks that the system prompt declares as untrusted data. Gemini output is constrained by a JSON schema with per-request enums, then re-validated with Zod. |
| LLM hallucinated numbers    | The LLM never produces metrics. All impact figures come from the deterministic model; unknown action ids from the model are dropped.                                                                                             |
| Malicious input             | Strict Zod schemas (`strictObject`) reject unknown fields, out-of-range numbers and unknown enums. Control characters are stripped and the body limit is 50 kB.                                                                  |
| SSRF / upstream abuse       | The server only calls fixed Open-Meteo hosts. Coordinates are validated numbers and the geocode query is URL-encoded. Upstream calls have timeouts, and failures return a generic 502.                                           |
| Abuse / cost blow-up        | Per-IP rate limiting on every AI and data endpoint, AI and upstream timeouts, and caching of air data and plans (keyed by a hash of the profile, not raw personal data).                                                         |
| Privacy                     | No accounts, no database. The profile lives in the browser's localStorage and is sent only to build a plan. Logs record method, path, status and duration, never user content. Geolocation is opt-in and rounded to about 10 m.  |
| Clickjacking & browser APIs | `frame-ancestors 'none'`, `X-Frame-Options`, and a `Permissions-Policy` that allows only same-origin geolocation.                                                                                                                |
| Cross-site requests         | The API accepts only `application/json` POSTs (anything else gets a 415) and sends no CORS headers.                                                                                                                              |
| Information leakage         | A central error handler returns generic messages; `X-Powered-By` is disabled.                                                                                                                                                    |
| Vulnerable dependencies     | `npm audit` runs in CI. The production image installs runtime dependencies only and runs as a non-root user.                                                                                                                     |
