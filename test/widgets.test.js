// -----------------------------------------------------------------------------
// The "my issues" widget: content within the core budget (validated by the
// SDK's validateWidgetContent), overdue issues first and flagged, links in
// HTTPS only, and the degraded states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { BASE_CONFIG, URL_CLOUD, createWorld } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, language = 'en') {
  const ack = await w.fake.widgetGet('my_issues', { settings: {}, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  return tree;
}

const ofType = (data, type) => data.components.filter((component) => component.type === type);

test('three tiles and my open issues, overdue first', async (t) => {
  const w = await world(t);
  const data = await content(w);
  assert.deepEqual(
    ofType(data, 'value').map((tile) => [tile.label, tile.value]),
    [
      ['Assigned to me', 3],
      ['Overdue', 1],
      ['Due today', 1],
    ],
  );
  const items = ofType(data, 'card-list')[0].items;
  assert.deepEqual(
    items.map((item) => [item.title, item.subtitle, item.badge?.text ?? null]),
    [
      ['#6 Changer la VMC', 'Maison · Nouveau · Haut', 'Overdue'],
      ['#1 Purger les radiateurs', 'Maison · Nouveau · Normal', 'Today'],
      ['#4 Renouveler le certificat TLS', 'Bureau · Nouveau · Normal', null],
    ],
  );
  assert.ok(
    items.every((item) => item.links === undefined),
    'no link to an http:// Redmine',
  );
});

test('in French, with links to an https:// Redmine', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, url: URL_CLOUD } });
  const data = await content(w, 'fr');
  assert.equal(ofType(data, 'value')[1].label, 'En retard');
  const [first] = ofType(data, 'card-list')[0].items;
  assert.deepEqual(first.links, [{ url: `${URL_CLOUD}/issues/6`, label: 'Ouvrir dans Redmine' }]);
});

test('nothing assigned, Redmine down, not configured', async (t) => {
  const w = await world(t);
  for (const issue of w.server.issues) {
    delete issue.assigned_to;
  }
  await w.hub.poll();
  let data = await content(w);
  assert.equal(ofType(data, 'text')[0].text, 'No open issue assigned to you.');
  w.server.online = false;
  await w.hub.poll();
  data = await content(w);
  assert.equal(ofType(data, 'text')[0].text, 'Redmine does not answer: last known issues.');
  const down = await world(t, { config: { ...BASE_CONFIG, url: 'http://198.51.100.9' } });
  assert.match(ofType(await content(down), 'text')[0].text, /Redmine does not answer/);
  const empty = await world(t, { config: {} });
  assert.match(ofType(await content(empty), 'text')[0].text, /Enter the address/);
});
