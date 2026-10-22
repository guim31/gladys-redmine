// -----------------------------------------------------------------------------
// The hub against the in-memory Redmine (real answers of Redmine 6.1):
// counters, project devices, scene events and their persistence, the scene
// actions, the connection status and the transport.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isLocalHost } from '../src/hub.js';
import {
  API_KEY,
  BASE_CONFIG,
  FakeRedmine,
  URL_1,
  URL_CLOUD,
  createAll,
  createWorld,
  deviceId,
  projectId,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const KEYS = ['open', 'assigned_to_me', 'overdue', 'due_today', 'updated_today'];
const counters = (w, ids = deviceId(w.gladys)) =>
  Object.fromEntries(KEYS.map((key) => [key, w.fake.lastState(ids.feature(key))]));

const keys = (w) => w.fake.sceneEvents.map((event) => `${event.key}:${event.data.issue_id}`);
const ME = { id: 1, name: 'Redmine Admin' };

test('the counters of the device, published once added', async (t) => {
  const w = await world(t);
  await createAll(w);
  assert.deepEqual(counters(w), {
    open: 5,
    assigned_to_me: 3,
    overdue: 1,
    due_today: 1,
    updated_today: 6,
  });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Redmine'],
  );
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: deviceId(w.gladys).device,
    transport: 'local',
  });
  // Every call carries the key in its header, never in the address.
  assert.ok(w.server.requests.every((r) => r.headers['x-redmine-api-key'] === API_KEY));
  assert.ok(w.server.requests.every((r) => !r.search.includes(API_KEY)));
});

test('a device per project followed, by identifier or name; unknown ones reported', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, projects: 'maison, Bureau, jardin' } });
  await createAll(w);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Redmine', 'Redmine Maison', 'Redmine Bureau'],
  );
  assert.deepEqual(counters(w, projectId(w.gladys, 1)), {
    open: 3,
    assigned_to_me: 2,
    overdue: 1,
    due_today: 1,
    updated_today: 3,
  });
  assert.deepEqual(counters(w, projectId(w.gladys, 2)), {
    open: 2,
    assigned_to_me: 1,
    overdue: 0,
    due_today: 0,
    updated_today: 3,
  });
  const ack = await w.fake.action('test_connection', {});
  assert.match(ack.data.message.en, /Projects not found: jardin\.$/);
});

test('nothing fires at the first reading; then each event, once', async (t) => {
  const w = await world(t);
  assert.deepEqual(w.fake.sceneEvents, [], 'what was already there is not news');

  w.server.addIssue({
    project: 2,
    subject: 'Imprimante du 2e en panne',
    priority: { id: 4, name: 'Urgent' },
    assignedTo: ME,
  });
  w.server.change(2, { assigned_to: ME });
  w.server.close(3);
  await w.hub.poll();
  // The next day: issue 1 (due on the 22nd) is overdue.
  w.clock.now = new Date('2026-10-23T06:00:00Z');
  await w.hub.poll();
  await w.hub.poll();
  assert.deepEqual(keys(w), [
    'issue_closed:3',
    'issue_assigned:7',
    'issue_assigned:2',
    'issue_created:7',
    'issue_overdue:1',
  ]);
  assert.deepEqual(w.fake.sceneEvents[3].data, {
    issue_id: 7,
    subject: 'Imprimante du 2e en panne',
    project: 'Bureau',
    tracker: 'Anomalie',
    status: 'Nouveau',
    priority: 'Urgent',
    author: 'Marie Durand',
    assigned_to: 'Redmine Admin',
    due_date: '',
    url: `${URL_1}/issues/7`,
  });
  assert.equal(w.fake.sceneEvents[4].data.due_date, '2026-10-22');
});

test('the events survive a restart: neither repeated nor lost', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'gladys-redmine-'));
  const server = new FakeRedmine();
  const first = await world(t, { server, dataDir });
  await first.app.stop();
  // Created while the integration was stopped.
  server.addIssue({ subject: 'Wi-Fi coupé' });
  const second = await world(t, { server, dataDir });
  assert.deepEqual(keys(second), ['issue_created:7']);
  await second.app.stop();
  const third = await world(t, { server, dataDir });
  assert.deepEqual(keys(third), [], 'not again after another restart');
});

test('another Redmine user starts from scratch: no flood of events', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'gladys-redmine-'));
  const server = new FakeRedmine();
  const first = await world(t, { server, dataDir });
  await first.app.stop();
  server.account = { ...server.account, id: 5, login: 'marie' };
  server.addIssue({ subject: 'Wi-Fi coupé' });
  const second = await world(t, { server, dataDir });
  assert.deepEqual(keys(second), []);
});

test('an issue assigned to a group of the user counts as mine', async (t) => {
  const w = await world(t);
  w.server.groups = [9];
  w.server.change(2, { assigned_to: { id: 9, name: 'Plomberie' } });
  await w.hub.poll();
  assert.deepEqual(keys(w), ['issue_assigned:2']);
  assert.equal(w.fake.sceneEvents[0].data.assigned_to, 'Plomberie');
});

test('an issue closed before midnight and read after it still fires "closed"', async (t) => {
  const w = await world(t);
  w.server.close(4, '2026-10-21T20:00:00Z');
  await w.hub.poll();
  assert.deepEqual(keys(w), ['issue_closed:4']);
  assert.equal(w.fake.sceneEvents[0].data.subject, 'Renouveler le certificat TLS');
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 1);
});

test('an old issue reopened is not a new issue', async (t) => {
  const server = new FakeRedmine();
  server.issue(5).updated_on = '2026-10-01T10:00:00Z';
  const w = await world(t, { server });
  server.change(5, { status: server.status(1), closed_on: null });
  await w.hub.poll();
  assert.deepEqual(keys(w), []);
});

test('an event Gladys refuses is sent again at the next reading', async (t) => {
  const w = await world(t);
  w.server.addIssue({ subject: 'A' });
  w.server.addIssue({ subject: 'B' });
  const publish = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  w.gladys.publishSceneEvent = async (key, data) => {
    if (refuse && data.issue_id === 8) {
      throw new Error('Gladys restarting');
    }
    return publish(key, data);
  };
  await w.hub.poll();
  assert.deepEqual(keys(w), ['issue_created:7']);
  refuse = false;
  await w.hub.poll();
  assert.deepEqual(keys(w), ['issue_created:7', 'issue_created:8']);
});

test('an event Gladys refuses for good does not block the next ones', async (t) => {
  const w = await world(t);
  w.server.addIssue({ subject: 'A' });
  w.server.addIssue({ subject: 'B' });
  const publish = w.gladys.publishSceneEvent.bind(w.gladys);
  w.gladys.publishSceneEvent = async (key, data) => {
    if (data.issue_id === 7) {
      throw Object.assign(new Error('Bad request'), { status: 400 });
    }
    return publish(key, data);
  };
  await w.hub.poll();
  await w.hub.poll();
  assert.deepEqual(keys(w), ['issue_created:8']);
});

test('a mass import fires 30 events at most', async (t) => {
  const w = await world(t);
  for (let i = 0; i < 45; i += 1) {
    w.server.addIssue({ subject: `Import ${i}` });
  }
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 30);
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 30, 'the rest is not sent later either');
});

test('more than 100 open issues: read page by page, counted exactly', async (t) => {
  const server = new FakeRedmine();
  for (let i = 0; i < 230; i += 1) {
    server.addIssue({ subject: `Import ${i}` });
  }
  const w = await world(t, { server });
  await createAll(w);
  assert.equal(counters(w).open, 235);
  assert.equal(counters(w).updated_today, 236);
});

test('create an issue: project, priority and tracker by name, assigned to me', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('create_issue', {
    project: 'maison',
    subject: 'Fuite d’eau détectée',
    description: 'Capteur cuisine : 1\nÀ 3 h 12',
    priority: 'urgent',
    tracker: 'Assistance',
    assign_to_me: true,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { issue_id: 7, url: `${URL_1}/issues/7` });
  assert.deepEqual(w.server.created, [
    {
      project_id: 1,
      subject: 'Fuite d’eau détectée',
      description: 'Capteur cuisine : 1\nÀ 3 h 12',
      priority_id: 4,
      tracker_id: 3,
      assigned_to_id: 1,
    },
  ]);
  await w.hub.poll();
  assert.deepEqual(keys(w), [], 'an issue created by Gladys is never announced');
  assert.equal(w.hub.summary().open, 6, 'counted at once');
});

test('create an issue: defaults, and the errors in the language of the configuration', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  let ack = await w.fake.sceneAction('create_issue', { project: '2', subject: 'Congélateur' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.server.created[0], { project_id: 2, subject: 'Congélateur' });
  ack = await w.fake.sceneAction('create_issue', { project: 'maison', subject: '  ' });
  assert.match(ack.error, /Indiquez le sujet de la demande/);
  ack = await w.fake.sceneAction('create_issue', { project: '', subject: 'x' });
  assert.match(ack.error, /Indiquez le projet/);
  ack = await w.fake.sceneAction('create_issue', { project: 'jardin', subject: 'x' });
  assert.match(ack.error, /ne voit aucun projet/);
  ack = await w.fake.sceneAction('create_issue', {
    project: 'maison',
    subject: 'x',
    priority: 'Critique',
  });
  assert.match(ack.error, /aucune priorité/);
  w.server.canCreate = false;
  ack = await w.fake.sceneAction('create_issue', { project: 'maison', subject: 'x' });
  assert.match(ack.error, /^Redmine : l'utilisateur Redmine n'a pas la permission/);
});

test('a creation Redmine refuses gives its own reason', async (t) => {
  const w = await world(t);
  const handle = w.server.handle.bind(w.server);
  w.server.handle = (url, options = {}) =>
    options.method === 'POST'
      ? {
          status: 422,
          headers: {},
          body: JSON.stringify({ errors: ['Due date must be greater than start date'] }),
        }
      : handle(url, options);
  const ack = await w.fake.sceneAction('create_issue', { project: 'maison', subject: 'x' });
  assert.equal(ack.error, 'Redmine: refused by Redmine (Due date must be greater than start date)');
});

test('add a note: by number, the issue must exist', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('add_note', { issue: '#6', text: 'VMC changée' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { issue_id: 6, subject: 'Changer la VMC' });
  assert.deepEqual(w.server.notes, [{ issue: 6, notes: 'VMC changée' }]);
  ack = await w.fake.sceneAction('add_note', { issue: '999', text: 'x' });
  assert.match(ack.error, /Redmine has no issue with this number/);
  ack = await w.fake.sceneAction('add_note', { issue: 'vmc', text: 'x' });
  assert.match(ack.error, /Give the number of the issue/);
  ack = await w.fake.sceneAction('add_note', { issue: '6', text: '' });
  assert.match(ack.error, /Give the text of the note/);
});

test('test the connection: user, counts; or the reason', async (t) => {
  const w = await world(t);
  let ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(
    ack.data.message.fr,
    'Redmine OK, utilisateur Redmine Admin : 5 demande(s) ouverte(s), 3 assignée(s) à vous, 1 en retard.',
  );
  w.server.apiEnabled = false;
  ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /the REST API is off/);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  w.server.apiEnabled = true;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('the connection status explains a missing address, key or a bad key', async (t) => {
  let w = await world(t, { config: { language: 'en' } });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(JSON.stringify(w.fake.connectionStatus), /Enter the address of your Redmine/);
  w = await world(t, { config: { url: URL_1 } });
  assert.match(JSON.stringify(w.fake.connectionStatus), /API key of a Redmine user/);
  w = await world(t, { config: { url: URL_1, api_key: 'wrong' } });
  assert.match(JSON.stringify(w.fake.connectionStatus), /API key refused/);
  w = await world(t, { config: { url: 'ftp://x', api_key: API_KEY } });
  assert.match(JSON.stringify(w.fake.connectionStatus), /Address not understood/);
  w = await world(t, { config: { url: `${URL_1}/wiki`, api_key: API_KEY } });
  assert.match(JSON.stringify(w.fake.connectionStatus), /no Redmine API at this address/);
});

test('a Redmine on the Internet is a cloud device, under its folder', async (t) => {
  const w = await world(t, {
    config: { ...BASE_CONFIG, url: `${URL_CLOUD}/projects/maison/issues` },
  });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.transports.at(-1).transport, 'cloud');
  assert.ok(w.server.requests.every((r) => r.path.startsWith('/redmine/')));
  assert.equal(isLocalHost('192.168.1.20'), true);
  assert.equal(isLocalHost('redmine'), true);
  assert.equal(isLocalHost('redmine.lan'), true);
  assert.equal(isLocalHost('172.20.0.4'), true);
  assert.equal(isLocalHost('pm.example.org'), false);
  assert.equal(isLocalHost('8.8.8.8'), false);
  assert.equal(isLocalHost('[2001:db8::1]'), false);
  assert.equal(isLocalHost('[fd12:3456::1]'), true);
});

test('a new language renames the features; new projects add devices', async (t) => {
  const w = await world(t);
  await w.fake.configUpdated({ ...BASE_CONFIG, language: 'de' });
  assert.equal(w.fake.discoveredDevices[0].features[0].name, 'Offene Tickets');
  await w.fake.configUpdated({ ...BASE_CONFIG, language: 'de', projects: 'bureau' });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Redmine', 'Redmine Bureau'],
  );
});

test('an issue created by Gladys is not announced after a restart either', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'gladys-redmine-'));
  const server = new FakeRedmine();
  const first = await world(t, { server, dataDir });
  // Stopped before any reading saw the new issue.
  first.hub.refreshSoon = async () => {};
  const created = await first.fake.sceneAction('create_issue', {
    project: 'maison',
    subject: 'Fuite',
    assign_to_me: true,
  });
  assert.equal(created.success, true, created.error);
  await first.app.stop();
  const second = await world(t, { server, dataDir });
  assert.deepEqual(keys(second), []);
});
