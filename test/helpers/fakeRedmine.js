// -----------------------------------------------------------------------------
// An in-memory Redmine, answering the REST routes the integration calls the
// way the real server does (checked on the official `redmine` 6.1 image in
// Docker): empty 401 for a wrong key, empty 403 on /my/account.json when the
// REST API is off (while /issues.json answers as to a visitor), empty 404 for
// a missing issue, a JSON 404 for a missing route, 422 `{ errors }`, `limit`
// capped at 100. Its starting issues are the real answer of Redmine 6.1
// (test/fixtures/redmine/real-issues.json): six issues in two projects, five
// open (one overdue, one due today, three assigned to the user of the key),
// one closed today.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/redmine/${name}.json`, import.meta.url), 'utf8'));

export const API_KEY = '0123456789abcdef0123456789abcdef01234567';
// The time of the changes made in the tests: after the fixtures' own.
export const CHANGED_AT = '2026-10-22T19:00:00Z';

const ERRORS = fixture('real-errors');
const json = (status, value) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: value === '' ? '' : JSON.stringify(value),
});
const error = (name) => json(ERRORS[name].status, ERRORS[name].body);

export class FakeRedmine {
  constructor({ apiKey = API_KEY } = {}) {
    this.apiKey = apiKey;
    this.account = fixture('real-account').user;
    this.issues = fixture('real-issues').issues;
    this.statuses = fixture('real-statuses').issue_statuses;
    this.projects = fixture('real-projects').projects;
    this.priorities = fixture('real-priorities').issue_priorities;
    this.trackers = fixture('real-trackers').trackers;
    /** Groups of the user of the key: `assigned_to_id=me` counts them. */
    this.groups = [];
    this.online = true;
    this.apiEnabled = true;
    this.canCreate = true;
    this.nextId = 7;
    this.created = [];
    this.notes = [];
    this.requests = [];
  }

  issue(id) {
    return this.issues.find((issue) => issue.id === id);
  }

  status(id) {
    const status = this.statuses.find((s) => s.id === id);
    return { id, name: status.name, is_closed: status.is_closed };
  }

  /** An issue created by someone in Redmine. */
  addIssue({ project = 1, subject = 'Nouvelle demande', assignedTo, ...rest } = {}) {
    const p = this.projects.find((item) => item.id === project);
    const issue = {
      id: this.nextId++,
      project: { id: p.id, name: p.name },
      tracker: { id: 1, name: 'Anomalie' },
      status: this.status(1),
      priority: { id: 2, name: 'Normal' },
      author: { id: 5, name: 'Marie Durand' },
      ...(assignedTo ? { assigned_to: assignedTo } : {}),
      subject,
      description: null,
      start_date: '2026-10-22',
      due_date: null,
      done_ratio: 0,
      is_private: false,
      created_on: CHANGED_AT,
      updated_on: CHANGED_AT,
      closed_on: null,
      ...rest,
    };
    this.issues.push(issue);
    return issue;
  }

  /** Change an issue as a user of Redmine would (its update time follows). */
  change(id, fields, updatedOn = CHANGED_AT) {
    Object.assign(this.issue(id), fields, { updated_on: updatedOn });
  }

  close(id, updatedOn = CHANGED_AT) {
    this.change(id, { status: this.status(5), closed_on: updatedOn }, updatedOn);
  }

  list(params) {
    const me = new Set([this.account.id, ...this.groups]);
    const status = params.get('status_id') ?? 'open';
    const since = (params.get('updated_on') ?? '').replace(/^>=/, '');
    const filtered = this.issues
      .filter((issue) =>
        status === '*'
          ? true
          : status === 'closed'
            ? issue.status.is_closed
            : !issue.status.is_closed,
      )
      .filter((issue) => params.get('assigned_to_id') !== 'me' || me.has(issue.assigned_to?.id))
      .filter((issue) => !since || issue.updated_on >= since)
      .sort((a, b) => b.id - a.id);
    const offset = Number(params.get('offset') ?? 0);
    const limit = Math.min(Number(params.get('limit') ?? 25), 100);
    return json(200, {
      issues: filtered.slice(offset, offset + limit),
      total_count: filtered.length,
      offset,
      limit,
    });
  }

  handle(url, { method = 'GET', headers = {}, json: body } = {}) {
    const { pathname, searchParams } = new URL(url);
    this.requests.push({ method, path: pathname, search: searchParams.toString(), headers });
    const route = pathname.replace(/^\/redmine/, '');
    const keyOk = headers['x-redmine-api-key'] === this.apiKey;
    if (route === '/my/account.json') {
      if (!this.apiEnabled) {
        return error('api_disabled');
      }
      return keyOk ? json(200, { user: this.account }) : error('bad_key');
    }
    if (this.apiEnabled && !keyOk) {
      return error('bad_key');
    }
    if (method === 'GET' && route === '/issues.json') {
      return this.list(searchParams);
    }
    if (method === 'GET' && route === '/issue_statuses.json') {
      return json(200, { issue_statuses: this.statuses });
    }
    if (method === 'GET' && route === '/projects.json') {
      return json(200, { projects: this.projects, total_count: this.projects.length });
    }
    if (method === 'GET' && route === '/enumerations/issue_priorities.json') {
      return json(200, { issue_priorities: this.priorities });
    }
    if (method === 'GET' && route === '/trackers.json') {
      return json(200, { trackers: this.trackers });
    }
    if (method === 'POST' && route === '/issues.json') {
      if (!this.canCreate) {
        return json(403, '');
      }
      const input = body?.issue ?? {};
      if (!input.subject) {
        return error('subject_blank');
      }
      this.created.push(input);
      const issue = this.addIssue({
        project: input.project_id,
        subject: input.subject,
        author: { id: this.account.id, name: 'Redmine Admin' },
        ...(input.assigned_to_id
          ? { assigned_to: { id: input.assigned_to_id, name: 'Redmine Admin' } }
          : {}),
      });
      return json(201, { issue });
    }
    const one = route.match(/^\/issues\/(\d+)\.json$/);
    if (one) {
      const issue = this.issue(Number(one[1]));
      if (!issue) {
        return error('not_found');
      }
      if (method === 'GET') {
        return json(200, { issue });
      }
      if (method === 'PUT') {
        this.notes.push({ issue: issue.id, ...(body?.issue ?? {}) });
        return json(204, '');
      }
    }
    return error('route_not_found');
  }
}

/** The network: one fake server per base URL; anything else does not answer. */
export function createNetwork(servers) {
  return {
    servers,
    async request(url, options = {}) {
      const base = Object.keys(servers).find((origin) => url.startsWith(`${origin}/`));
      const server = base ? servers[base] : null;
      if (!server || !server.online) {
        const err = new Error('connect ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        throw err;
      }
      return server.handle(url, options);
    },
  };
}
