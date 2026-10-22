// -----------------------------------------------------------------------------
// The pieces under the hub: the configuration, the client's reading of the
// Redmine answers (errors as the real server gives them), the model.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseProjects, parseServerUrl } from '../src/config.js';
import { ERROR_KINDS, RedmineClient, RedmineError } from '../src/redmine/client.js';
import { findByIdOrName, localDay, midnightUtc, parseIssue } from '../src/redmine/model.js';
import { fixture } from './helpers/fakeRedmine.js';

process.env.TZ = 'Europe/Paris';

test('the address: bare host, page copied from the browser, folder kept', () => {
  assert.equal(parseServerUrl('192.0.2.30:3000'), 'http://192.0.2.30:3000');
  assert.equal(
    parseServerUrl(' https://redmine.example.org/redmine/issues/12?tab=history '),
    'https://redmine.example.org/redmine',
  );
  assert.equal(parseServerUrl('https://pm.example.org/projects/maison'), 'https://pm.example.org');
  assert.equal(parseServerUrl('https://pm.example.org/my/page'), 'https://pm.example.org');
  assert.equal(parseServerUrl('https://pm.example.org/issues.json'), 'https://pm.example.org');
  assert.equal(parseServerUrl('ftp://x'), null);
  assert.equal(parseServerUrl('https://user:pass@pm.example.org'), null, 'no credentials');
  assert.equal(parseServerUrl(''), null);
});

test('the projects: separators, duplicates, 10 at most', () => {
  assert.deepEqual(parseProjects('maison, Bureau;\nmaison ,, jardin'), [
    'maison',
    'Bureau',
    'jardin',
  ]);
  assert.equal(parseProjects(Array.from({ length: 12 }, (_, i) => `p${i}`).join(',')).length, 10);
  assert.deepEqual(parseProjects(undefined), []);
});

test('the configuration is normalized, with the manifest defaults', () => {
  assert.deepEqual(normalizeConfig({ url: 'redmine.lan', api_key: ' k ', poll_interval: '7' }), {
    url: 'http://redmine.lan',
    urlTyped: true,
    apiKey: 'k',
    projects: [],
    allowSelfSigned: false,
    pollIntervalMs: 300_000,
    language: 'fr',
  });
});

const answer =
  (status, body = '', headers = {}) =>
  async () => ({ status, headers, body });
const kindOf = async (request, call = (client) => client.account()) => {
  const client = new RedmineClient({ url: 'http://redmine.lan', apiKey: 'k', request });
  try {
    await call(client);
  } catch (err) {
    assert.ok(err instanceof RedmineError, err.message);
    return err.kind;
  }
  return 'ok';
};

test('the errors of the real server, each to its kind', async () => {
  const errors = fixture('real-errors');
  const real = (name) =>
    answer(errors[name].status, errors[name].body === '' ? '' : JSON.stringify(errors[name].body));
  assert.equal(await kindOf(real('bad_key')), ERROR_KINDS.AUTH);
  assert.equal(await kindOf(real('api_disabled')), ERROR_KINDS.API_DISABLED);
  assert.equal(await kindOf(real('route_not_found')), ERROR_KINDS.NOT_REDMINE);
  assert.equal(await kindOf(real('not_found'), (c) => c.issue(9)), ERROR_KINDS.NOT_FOUND);
  assert.equal(await kindOf(real('api_disabled'), (c) => c.createIssue({})), ERROR_KINDS.RIGHTS);
  assert.equal(await kindOf(real('subject_blank'), (c) => c.createIssue({})), ERROR_KINDS.INVALID);
  assert.equal(await kindOf(answer(200, '<!DOCTYPE html>')), ERROR_KINDS.NOT_REDMINE);
  assert.equal(await kindOf(answer(301, '')), ERROR_KINDS.REDIRECT);
  assert.equal(await kindOf(answer(502, 'Bad gateway')), ERROR_KINDS.HTTP);
  const tls = async () => {
    throw Object.assign(new Error('self signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  };
  assert.equal(await kindOf(tls), ERROR_KINDS.TLS);
  const refused = async () => {
    throw Object.assign(new Error('connect'), { code: 'ECONNREFUSED' });
  };
  assert.equal(await kindOf(refused), ERROR_KINDS.UNREACHABLE);
  assert.equal(
    await kindOf(answer(200, JSON.stringify(fixture('real-account')))),
    'ok',
    'the real account',
  );
});

test('an issue of Redmine 6.1, and of a Redmine before 5.1 (no is_closed)', () => {
  const [, closed] = fixture('real-issues').issues;
  assert.deepEqual(parseIssue(closed), {
    id: 5,
    subject: 'Ticket fermé',
    projectId: 2,
    project: 'Bureau',
    tracker: 'Anomalie',
    status: 'Fermé',
    closed: true,
    priority: 'Bas',
    author: 'Redmine Admin',
    assignee: '',
    dueDate: '',
    createdOn: '2026-10-22T21:06:13Z',
    updatedOn: '2026-10-22T21:06:19Z',
    closedOn: '2026-10-22T21:06:19Z',
  });
  const old = { ...closed, status: { id: 5, name: 'Fermé' } };
  assert.equal(parseIssue(old).closed, false);
  assert.equal(parseIssue(old, new Set([5, 6])).closed, true);
  assert.equal(parseIssue({ id: 'x' }), null);
});

test('today and its midnight, in the time zone of Gladys', () => {
  const evening = new Date('2026-10-22T22:30:00Z'); // 00:30 in Paris, the 23rd
  assert.equal(localDay(evening), '2026-10-23');
  assert.equal(midnightUtc(evening), '2026-10-22T22:00:00Z');
});

test('a project by number, identifier or name; an ambiguous name refused', () => {
  const projects = fixture('real-projects').projects;
  assert.equal(findByIdOrName(projects, '#2').item.name, 'Bureau');
  assert.equal(findByIdOrName(projects, 'maison').item.id, 1);
  assert.equal(findByIdOrName(projects, ' BUREAU ').item.id, 2);
  assert.equal(findByIdOrName(projects, 'jardin').reason, 'not_found');
  const twins = [
    { id: 1, name: 'Été' },
    { id: 2, name: 'ete' },
  ];
  assert.equal(findByIdOrName(twins, 'ÉTÉ').reason, 'ambiguous');
});
