// -----------------------------------------------------------------------------
// Redmine REST API client. Every call carries the API key of one Redmine user
// (`X-Redmine-API-Key`, in its "My account" page). Checked against the
// official `redmine` 6.1 image in Docker, October 2026.
//
//   GET /my/account.json                     { user: { id, login, firstname… } }
//   GET /issues.json?status_id=…&offset=…    { issues, total_count, offset, limit }
//   GET /issues/:id.json                     { issue }
//   POST /issues.json                        { issue } (201)
//   PUT /issues/:id.json                     204 (a note: { issue: { notes } })
//   GET /issue_statuses.json                 { issue_statuses: [{ id, name, is_closed }] }
//   GET /projects.json?offset=…              { projects, total_count }
//   GET /enumerations/issue_priorities.json  { issue_priorities }
//   GET /trackers.json                       { trackers }
//
// Pitfalls found on the real server:
//   - With the REST API turned off, the key is ignored: /issues.json answers
//     200 with the issues of the public projects, as to an anonymous visitor.
//     Only /my/account.json tells (a 403 with an empty body): it is read first,
//     at every reading.
//   - A wrong key is a 401 with an empty body; a missing right, a 403; a
//     refused issue, a 422 `{ errors: [...] }` in the language of the user.
//   - `limit` is capped at 100: the lists are read page by page (`offset`).
//   - The dates of the issue (`due_date`) are plain days; `created_on` and
//     `updated_on` are UTC. A filter on `updated_on` accepts a UTC timestamp.
//   - A due date before the start date is refused (422): the start date is
//     today by default.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // the API key is wrong, or its user is locked
  API_DISABLED: 'api_disabled', // Administration > Settings > API: the REST API is off
  RIGHTS: 'rights', // the user lacks a permission
  NOT_FOUND: 'not_found', // no such issue (or not visible to the user)
  INVALID: 'invalid', // Redmine refused the data (422)
  NOT_REDMINE: 'not_redmine', // something answers, but not the Redmine API
  REDIRECT: 'redirect', // HTTP redirected to HTTPS, or a login portal
  HTTP: 'http', // any other unexpected answer
});

export class RedmineError extends Error {
  constructor(kind, message, status, details = []) {
    super(message);
    this.name = 'RedmineError';
    this.kind = kind;
    this.status = status;
    /** Redmine's own messages, for a 422. */
    this.details = details;
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const PAGE_SIZE = 100;
export const MAX_PAGES = 10;

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new RedmineError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  if (String(err.code ?? '').startsWith('HPE_')) {
    // Something answers on that port, but not in HTTP (a database, SSH…).
    return new RedmineError(ERROR_KINDS.NOT_REDMINE, `${err.code}`);
  }
  return new RedmineError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

export class RedmineClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of Redmine, without trailing slash
   * @param {string} options.apiKey API key of a Redmine user (its "My account" page)
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] HTTP seam (src/redmine/http.js)
   */
  constructor({ url, apiKey, insecure = false, request = httpRequest }) {
    this.url = url;
    this.apiKey = apiKey;
    this.insecure = insecure;
    this.request = request;
    this.statusCache = null;
  }

  async call(path, { method = 'GET', json } = {}) {
    let response;
    try {
      response = await this.request(`${this.url}${path}`, {
        method,
        json,
        insecure: this.insecure,
        headers: { 'x-redmine-api-key': this.apiKey },
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status, body } = response;
    if (status >= 300 && status < 400) {
      throw new RedmineError(ERROR_KINDS.REDIRECT, `HTTP ${status}`, status);
    }
    let parsed = null;
    let html = false;
    if (body && body.trim() !== '') {
      try {
        parsed = JSON.parse(body);
      } catch {
        html = true;
      }
    }
    if (status >= 200 && status < 300) {
      if (html) {
        // Another site, or Redmine's web pages: an HTML answer.
        throw new RedmineError(ERROR_KINDS.NOT_REDMINE, `HTTP ${status}, not JSON`, status);
      }
      return parsed;
    }
    if (status === 401) {
      throw new RedmineError(ERROR_KINDS.AUTH, 'HTTP 401', status);
    }
    if (status === 403) {
      throw new RedmineError(ERROR_KINDS.RIGHTS, 'HTTP 403', status);
    }
    if (status === 404) {
      // Redmine's own 404 is empty; a missing route or another site has a body.
      const kind = !html && parsed === null ? ERROR_KINDS.NOT_FOUND : ERROR_KINDS.NOT_REDMINE;
      throw new RedmineError(kind, 'HTTP 404', status);
    }
    if (status === 422) {
      const details = (Array.isArray(parsed?.errors) ? parsed.errors : [])
        .map((message) => String(message).slice(0, 200))
        .slice(0, 5);
      throw new RedmineError(
        ERROR_KINDS.INVALID,
        `HTTP 422 ${details.join('; ')}`.trim(),
        status,
        details,
      );
    }
    throw new RedmineError(ERROR_KINDS.HTTP, `HTTP ${status}`, status);
  }

  /**
   * The user of the key. Read first at every reading: with the REST API off,
   * this is the only call that fails (403), the others answer as to a visitor.
   * @returns {Promise<{ id: number, login: string, name: string, admin: boolean }>}
   */
  async account() {
    let data;
    try {
      data = await this.call('/my/account.json');
    } catch (err) {
      if (err instanceof RedmineError && err.kind === ERROR_KINDS.RIGHTS) {
        throw new RedmineError(ERROR_KINDS.API_DISABLED, 'HTTP 403 on /my/account', 403);
      }
      if (err instanceof RedmineError && err.kind === ERROR_KINDS.NOT_FOUND) {
        throw new RedmineError(ERROR_KINDS.NOT_REDMINE, 'HTTP 404 on /my/account', 404);
      }
      throw err;
    }
    const user = data?.user;
    if (!user || !Number.isInteger(user.id)) {
      throw new RedmineError(ERROR_KINDS.NOT_REDMINE, 'no user in /my/account', 200);
    }
    const name = [user.firstname, user.lastname].filter(Boolean).join(' ').trim();
    return {
      id: user.id,
      login: String(user.login ?? ''),
      name: name || String(user.login ?? ''),
      admin: user.admin === true,
    };
  }

  /**
   * Issues matching the filters, newest first, at most PAGE_SIZE × MAX_PAGES.
   * @param {Record<string, string>} filters query parameters of /issues.json
   * @param {number} [maxPages]
   * @returns {Promise<{ issues: object[], total: number }>}
   */
  async issues(filters, maxPages = MAX_PAGES) {
    const issues = [];
    let total = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        ...filters,
        sort: 'id:desc',
        offset: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      const data = await this.call(`/issues.json?${params}`);
      if (!data || !Array.isArray(data.issues) || !Number.isFinite(Number(data.total_count))) {
        throw new RedmineError(ERROR_KINDS.NOT_REDMINE, 'no issues in /issues.json', 200);
      }
      total = Number(data.total_count);
      issues.push(...data.issues);
      if (data.issues.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= total) {
        break;
      }
    }
    return { issues, total };
  }

  /** The highest issue number the user sees, open or closed (0 when none). */
  async lastIssueId() {
    const data = await this.call('/issues.json?status_id=*&sort=id:desc&limit=1');
    const id = Number(data?.issues?.[0]?.id);
    return Number.isInteger(id) && id > 0 ? id : 0;
  }

  async issue(id) {
    const data = await this.call(`/issues/${encodeURIComponent(id)}.json`);
    if (!data?.issue) {
      throw new RedmineError(ERROR_KINDS.NOT_REDMINE, 'no issue in the answer', 200);
    }
    return data.issue;
  }

  /** Ids of the closed statuses (read once: Redmine before 5.1 does not say it in the issue). */
  async closedStatuses() {
    if (!this.statusCache) {
      const data = await this.call('/issue_statuses.json');
      const statuses = Array.isArray(data?.issue_statuses) ? data.issue_statuses : [];
      this.statusCache = new Set(statuses.filter((s) => s.is_closed === true).map((s) => s.id));
    }
    return this.statusCache;
  }

  /** Every active project the user sees. */
  async projects() {
    const projects = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = await this.call(`/projects.json?offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`);
      const items = Array.isArray(data?.projects) ? data.projects : [];
      projects.push(...items);
      if (items.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= Number(data?.total_count)) {
        break;
      }
    }
    return projects;
  }

  async priorities() {
    const data = await this.call('/enumerations/issue_priorities.json');
    return Array.isArray(data?.issue_priorities) ? data.issue_priorities : [];
  }

  async trackers() {
    const data = await this.call('/trackers.json');
    return Array.isArray(data?.trackers) ? data.trackers : [];
  }

  /** Create an issue; resolves it. */
  async createIssue(input) {
    const data = await this.call('/issues.json', { method: 'POST', json: { issue: input } });
    const id = Number(data?.issue?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new RedmineError(ERROR_KINDS.HTTP, 'no id in the answer', 201);
    }
    return data.issue;
  }

  /** Add a note to an issue. */
  async addNote(id, notes) {
    await this.call(`/issues/${encodeURIComponent(id)}.json`, {
      method: 'PUT',
      json: { issue: { notes } },
    });
  }
}
