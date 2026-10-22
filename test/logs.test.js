// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never a key.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY, URL_1, createWorld } from './helpers/world.js';

function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  t.mock.method(console, 'warn', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => text.includes('Connected to Redmine at redmine.lan:3000 as admin')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    w.server.change(1, { subject: `Purger les radiateurs ${i}` });
    w.server.addIssue({ subject: `Demande ${i}` });
    await w.hub.poll();
  }
  assert.deepEqual(logs.texts(), []);
});

test('an outage is logged once, and once when Redmine is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.server.online = false;
  for (let i = 0; i < 6; i += 1) {
    await w.hub.poll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  logs.clear();
  w.server.online = true;
  await w.hub.poll();
  await w.hub.poll();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /answers again after \d+ min/);
});

test('an issue created from Gladys writes one line; never a key, even at debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  const ack = await w.fake.sceneAction('create_issue', { project: 'maison', subject: 'Fuite' });
  assert.equal(ack.success, true, ack.error);
  w.server.online = false;
  await w.hub.poll();
  const text = logs.texts().join('\n');
  assert.match(text, /Issue #7 created from Gladys/);
  assert.ok(!text.includes(API_KEY), 'never the API key');

  const refused = await world(t, {
    config: { url: URL_1, api_key: 'secret_wrong_key' },
  });
  await refused.hub.poll();
  const all = logs.texts().join('\n');
  assert.ok(!all.includes('secret_wrong_key'), 'never a refused key');
});
