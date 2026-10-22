// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Redmine on a fake
// network and a temporary /data, with the integration wired on top through
// registerHandlers. No timer runs unless `timers: true`: the tests read
// Redmine with `world.hub.poll()`. The clock is fixed on 22 October 2026,
// 22:00 in Paris: issue 6 is overdue, issue 1 due today.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { API_KEY, FakeRedmine, createNetwork } from './fakeRedmine.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Paris';

export const NOW = new Date('2026-10-22T20:00:00Z');

// A Redmine of the home or office network (local), and one on the Internet (cloud).
export const URL_1 = 'http://redmine.lan:3000';
export const URL_CLOUD = 'https://pm.example.org/redmine';

export const BASE_CONFIG = { url: URL_1, api_key: API_KEY, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakeRedmine} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  server,
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-redmine-')),
  timings = {},
  timers = false,
  clock = { now: NOW },
} = {}) {
  const redmine = server ?? new FakeRedmine();
  const network = createNetwork({ [URL_1]: redmine, [URL_CLOUD]: redmine });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: () => new Date(clock.now),
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server: redmine, app, hub: app.hub, dataDir, network, clock };
}

export const deviceId = (gladys) => gladys.externalIds('tracker', 'main');
export const projectId = (gladys, id) => gladys.externalIds('project', String(id));

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { API_KEY, FakeRedmine };
