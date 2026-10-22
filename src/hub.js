// -----------------------------------------------------------------------------
// The Redmine hub: reads the issues on a timer of the container, publishes the
// counters of the devices when they change, fires the scene events (a new
// issue, an issue assigned to me, overdue, closed), and creates issues or
// adds notes for the scene actions.
//
// Gladys never polls the devices (should_poll: false): the interval goes up
// to 10 minutes, beyond the fixed list of the core scheduler, and the scene
// events must fire even when no device was added.
//
// A reading is four calls: the user of the key (it fails when the REST API is
// off, the others would answer as to a visitor), the open issues, those
// assigned to the user (Redmine's `me` counts its groups too), and those
// updated since midnight. The events come from the difference between two
// readings, persisted under /data (src/store.js). The first reading of a
// Redmine (or of another user) only takes note: what was already there is not
// news.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { buildDevice, featureStates } from './devices.js';
import {
  ERROR_KINDS,
  MAX_PAGES,
  PAGE_SIZE,
  RedmineClient,
  RedmineError,
} from './redmine/client.js';
import {
  findByIdOrName,
  isOverdue,
  issueUrl,
  localDay,
  midnightUtc,
  parseIssue,
  parseIssueNumber,
  parseIssues,
  summarize,
} from './redmine/model.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  allLanguages,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'redmine-hub' });

export const WIDGET_KEY = 'my_issues';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  CREATED: 'issue_created',
  ASSIGNED: 'issue_assigned',
  OVERDUE: 'issue_overdue',
  CLOSED: 'issue_closed',
});

export const HUB_TIMINGS = {
  // A failed read is tried again this soon, whatever the interval.
  retryMs: 30_000,
  // Re-send unchanged values this often: Gladys shows "no recent value" after 48 h.
  heartbeatMs: 12 * 60 * 60_000,
};

// Scene events fired by one reading at most (a mass import, a migration):
// the core admits 300 per minute, and nobody wants 300 notifications.
export const MAX_EVENTS_PER_READING = 30;
// The reading after a command is awaited at most this long: the scene action
// answers within its timeout.
const REFRESH_WAIT_MS = 3_000;
// Issues created by the scene action that the next readings must not
// announce (no loop between a trigger and the action).
const OWN_ISSUES_KEPT = 100;
// Issues gone from the open list read one by one at most, per reading.
const MAX_LOOKUPS = 20;
// Pages of the issues updated today: the total counts beyond them.
const UPDATED_PAGES = 3;
// Answers of Gladys to a scene event that a retry would not change.
const PERMANENT_REFUSALS = [400, 404, 413, 422];
// Redmine caps a subject at 255 characters.
const SUBJECT_MAX = 255;
const DESCRIPTION_MAX = 20_000;

const EMPTY_READING = Object.freeze({
  open: [],
  mine: [],
  updated: [],
  openTotal: 0,
  mineTotal: 0,
  updatedTotal: 0,
});

/** An address of the home network (local transport), else the Internet (cloud). */
export function isLocalHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host.includes(':')) {
    // IPv6: loopback, unique local (fc00::/7) and link-local addresses.
    return host === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(host) || host.startsWith('fe80:');
  }
  if (!host.includes('.') || /\.(local|lan|home|internal|localdomain|home\.arpa)$/.test(host)) {
    return true;
  }
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return false;
}

const ids = (issues) => issues.map((issue) => issue.id);
const intList = (value) => (Array.isArray(value) ? value.filter(Number.isInteger) : []);

export class RedmineHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/redmine/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {Function} [options.now] clock (tests)
   */
  constructor({ gladys, store, request, timers = true, timings, now = () => new Date() }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now;
    this.config = null;
    this.client = null;
    this.reset();
    this.saved = null;
    this.connection = null;
    this.deviceSignature = null;
    this.widgetSignature = null;
    this.transports = new Map();
    this.timer = null;
    this.polling = null;
    this.stopped = false;
    /** Issue numbers created by the scene action, never announced. */
    this.ownIssues = [];
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  reset() {
    this.reading = EMPTY_READING;
    this.today = '';
    /** `{ id, login, name }` of the user of the key. */
    this.account = null;
    /** The projects followed, `{ id, name }`; null until resolved. */
    this.projects = null;
    /** What the user typed and Redmine does not know. */
    this.unknownProjects = [];
    this.error = null;
    this.downSince = null;
    this.readAt = 0;
    this.connectedLogged = false;
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (connected, lost, back, user commands). A
  // problem that repeats is logged once, then at debug until it clears.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  get language() {
    return this.config?.language ?? 'en';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved =
      typeof saved.scope === 'string'
        ? {
            scope: saved.scope,
            maxId: Number.isInteger(saved.maxId) ? saved.maxId : 0,
            open: intList(saved.open),
            overdue: intList(saved.overdue),
            mine: intList(saved.mine),
            own: intList(saved.own),
          }
        : null;
    this.ownIssues = this.saved?.own ?? [];
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.connection = null;
    this.deviceSignature = null;
    this.transports.clear();
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const same =
      previous &&
      previous.url === config.url &&
      previous.apiKey === config.apiKey &&
      previous.allowSelfSigned === config.allowSelfSigned;
    if (!same) {
      this.reset();
      this.transports.clear();
      this.client =
        config.url && config.apiKey
          ? new RedmineClient({
              url: config.url,
              apiKey: config.apiKey,
              insecure: config.allowSelfSigned,
              request: this.request,
            })
          : null;
    } else if (JSON.stringify(previous.projects) !== JSON.stringify(config.projects)) {
      this.projects = null;
    }
    // A new language or new projects: the devices are published again.
    this.deviceSignature = null;
    this.gladys.forgetPublishedStates?.();
    await this.poll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.polling?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    const delay = this.error
      ? Math.min(this.config.pollIntervalMs, this.timings.retryMs)
      : this.config.pollIntervalMs;
    this.timer = setTimeout(() => {
      this.poll().catch((err) => this.problem('poll', 'Reading failed', err, 'error'));
    }, delay);
  }

  // --- Reading ---------------------------------------------------------------

  /** One reading at a time: a call during a reading waits for it, then reads. */
  poll() {
    const run = async () => {
      try {
        await this.read();
      } finally {
        this.schedule();
      }
    };
    this.polling = (this.polling ?? Promise.resolve()).catch(() => {}).then(run);
    return this.polling;
  }

  /** The projects followed, resolved against those the user sees. */
  async resolveProjects(client) {
    if (this.config.projects.length === 0) {
      return { projects: [], unknown: [] };
    }
    const all = (await client.projects())
      .filter((project) => Number.isInteger(project?.id))
      .map((project) => ({
        id: project.id,
        name: String(project.name ?? project.identifier ?? project.id),
        identifier: String(project.identifier ?? ''),
      }));
    const projects = [];
    const unknown = [];
    for (const query of this.config.projects) {
      const { item } = findByIdOrName(all, query);
      if (!item) {
        unknown.push(query);
      } else if (!projects.some((project) => project.id === item.id)) {
        projects.push({ id: item.id, name: item.name });
      }
    }
    return { projects, unknown };
  }

  async read() {
    if (!this.client) {
      await this.publishConnectionStatus();
      return;
    }
    const { client } = this;
    let fresh = null;
    try {
      const now = this.now();
      const account = await client.account();
      const closed = await client.closedStatuses().catch(() => new Set());
      const resolved = this.projects
        ? { projects: this.projects, unknown: this.unknownProjects }
        : await this.resolveProjects(client);
      const open = await client.issues({ status_id: 'open' });
      const mine = await client.issues({ status_id: 'open', assigned_to_id: 'me' });
      const updated = await client.issues(
        { status_id: '*', updated_on: `>=${midnightUtc(now)}` },
        UPDATED_PAGES,
      );
      if (client !== this.client) {
        // The configuration changed during the reading: these are the old
        // Redmine's issues; the new one is being read.
        return;
      }
      this.account = account;
      this.projects = resolved.projects;
      if (resolved.unknown.length > 0) {
        this.problem('projects', `Projects not found in Redmine: ${resolved.unknown.join(', ')}`);
      } else {
        this.resolved('projects');
      }
      this.unknownProjects = resolved.unknown;
      this.today = localDay(now);
      this.reading = {
        open: parseIssues(open.issues, closed).filter((issue) => !issue.closed),
        mine: parseIssues(mine.issues, closed).filter((issue) => !issue.closed),
        updated: parseIssues(updated.issues, closed),
        openTotal: open.total,
        mineTotal: mine.total,
        updatedTotal: updated.total,
      };
      fresh = {
        client,
        account,
        reading: this.reading,
        complete: open.total <= open.issues.length,
      };
      this.readAt = Date.now();
      this.recovered();
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.failed(err);
    }
    if (this.readAt !== 0) {
      await this.publishDevices();
      if (fresh) {
        await this.publishStates();
        // The configuration may have changed meanwhile: these events belong
        // to the previous Redmine.
        if (fresh.client === this.client) {
          await this.fireEvents(fresh);
        }
      }
    }
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.refreshWidget();
  }

  recovered() {
    const host = hostOf(this.config.url);
    if (this.downSince !== null) {
      const minutes = Math.round((Date.now() - this.downSince) / 60_000);
      this.resolved('read', `Redmine at ${host} answers again after ${minutes} min`);
    }
    if (!this.connectedLogged) {
      this.connectedLogged = true;
      logger.info(
        `Connected to Redmine at ${host} as ${this.account.login}: ${this.summary().open} open issue(s)`,
      );
    }
    const limit = PAGE_SIZE * MAX_PAGES;
    if (this.reading.openTotal > limit) {
      this.problem(
        'limit',
        `${this.reading.openTotal} open issues: only the ${limit} newest are detailed`,
      );
    } else {
      this.resolved('limit');
    }
    this.error = null;
    this.downSince = null;
  }

  failed(err) {
    const kind = err instanceof RedmineError ? err.kind : ERROR_KINDS.HTTP;
    this.error = { kind, message: err.message };
    this.downSince ??= Date.now();
    this.problem(
      'read',
      `Redmine at ${hostOf(this.config.url)}: ${err.message}`,
      undefined,
      'error',
    );
  }

  /** The counters of the global device, or of one project. */
  summary(projectId) {
    return summarize(this.reading, this.today, projectId);
  }

  // --- Publishing to Gladys --------------------------------------------------

  devices() {
    return [
      buildDevice(this.gladys, this.language),
      ...(this.projects ?? []).map((project) => buildDevice(this.gladys, this.language, project)),
    ];
  }

  async publishDevices() {
    const devices = this.devices();
    const signature = JSON.stringify(devices);
    if (signature === this.deviceSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.deviceSignature = signature;
      this.resolved('devices');
    } catch (err) {
      this.problem('devices', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: the projects are looked up again too. */
  async rediscover() {
    this.deviceSignature = null;
    this.projects = null;
    await this.poll();
  }

  /** The user added a device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device?.external_id);
    if (!this.error && this.readAt !== 0) {
      await this.publishStates();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async publishStates() {
    const states = [
      ...featureStates(this.gladys, this.summary()),
      ...(this.projects ?? []).flatMap((project) =>
        featureStates(this.gladys, this.summary(project.id), project.id),
      ),
    ];
    try {
      // Only the changes, and every value again after `heartbeatMs`.
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransports() {
    if (this.readAt === 0) {
      return;
    }
    const transport = this.error
      ? DEVICE_TRANSPORTS.UNREACHABLE
      : isLocalHost(new URL(this.config.url).hostname)
        ? DEVICE_TRANSPORTS.LOCAL
        : DEVICE_TRANSPORTS.CLOUD;
    const changed = this.devices()
      .map((device) => device.external_id)
      .filter((id) => this.transports.get(id) !== transport)
      .map((id) => ({ external_id: id, transport }));
    if (changed.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(changed);
      for (const { external_id: id } of changed) {
        this.transports.set(id, transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transport refused: ${err.message}`);
    }
  }

  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (!this.config.apiKey) {
      return { connected: false, message: CONNECTION_TEXT.noKey };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  refreshWidget() {
    const signature = JSON.stringify([this.error?.kind ?? null, this.today, this.reading.mine]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene events ----------------------------------------------------------

  /**
   * What the next reading compares with: the highest issue number, the open,
   * overdue and assigned issues, and the issues created by the scene action
   * (saved, so a restart never announces them).
   */
  snapshot(scope, reading, maxId = 0) {
    return {
      scope,
      maxId: Math.max(
        maxId,
        this.saved?.scope === scope ? this.saved.maxId : 0,
        ...ids(reading.open),
        ...ids(reading.updated),
      ),
      open: ids(reading.open),
      overdue: ids(reading.open.filter((issue) => isOverdue(issue, this.today))),
      mine: ids(reading.mine),
      own: this.ownIssues,
    };
  }

  /**
   * The issues open at the previous reading, absent from the open list now and
   * not updated today: closed before midnight and read after it, deleted,
   * moved out of sight. Read one by one (a few at most), the closed ones are
   * returned.
   */
  async closedOutOfSight(client, before, reading) {
    const listed = new Set([...ids(reading.open), ...ids(reading.updated)]);
    const gone = before.open.filter((id) => !listed.has(id)).slice(0, MAX_LOOKUPS);
    const closed = [];
    const statuses = await client.closedStatuses().catch(() => new Set());
    for (const id of gone) {
      try {
        const issue = parseIssue(await client.issue(id), statuses);
        if (issue?.closed) {
          closed.push(issue);
        }
      } catch (err) {
        logger.debug(`Issue #${id} not readable: ${err.message}`);
      }
    }
    return closed;
  }

  async fireEvents({ client, account, reading, complete }) {
    // Per Redmine and per user: another user sees other issues.
    const scope = `${this.config.url}#${account.id}`;
    if (this.saved?.scope !== scope) {
      // First reading: the highest number of every issue, open or not, so
      // that an old issue reopened later is not taken for a new one.
      let lastId = 0;
      try {
        lastId = await client.lastIssueId();
      } catch (err) {
        logger.debug(`Last issue number not readable: ${err.message}`);
      }
      this.saved = this.snapshot(scope, reading, lastId);
      this.store.save(this.saved);
      return;
    }
    const before = this.saved;
    const own = new Set(this.ownIssues);
    const wasOpen = new Set(before.open);
    const wasOverdue = new Set(before.overdue);
    const wasMine = new Set(before.mine);
    const seen = new Map([...reading.updated, ...reading.open].map((issue) => [issue.id, issue]));
    // Overdue and closed first: a mass import of new issues must not crowd them out.
    const events = [
      ...reading.open
        .filter((issue) => isOverdue(issue, this.today) && !wasOverdue.has(issue.id))
        .map((issue) => ({ key: TRIGGERS.OVERDUE, issue })),
      ...reading.updated
        .filter((issue) => issue.closed && wasOpen.has(issue.id))
        .map((issue) => ({ key: TRIGGERS.CLOSED, issue })),
      ...(complete ? await this.closedOutOfSight(client, before, reading) : []).map((issue) => ({
        key: TRIGGERS.CLOSED,
        issue,
      })),
      ...reading.mine
        .filter((issue) => !wasMine.has(issue.id) && !own.has(issue.id))
        .map((issue) => ({ key: TRIGGERS.ASSIGNED, issue })),
      ...[...seen.values()]
        .filter((issue) => issue.id > before.maxId && !own.has(issue.id))
        .sort((a, b) => a.id - b.id)
        .map((issue) => ({ key: TRIGGERS.CREATED, issue })),
    ];

    if (events.length > MAX_EVENTS_PER_READING) {
      this.problem(
        'burst',
        `${events.length} scene events at once: only the first ${MAX_EVENTS_PER_READING} are sent`,
      );
    }
    // When Gladys cannot take an event now (restarting?), it and the next
    // ones are tried again at the next reading; one it refuses for good is
    // skipped, or it would block every later event.
    const batch = events.slice(0, MAX_EVENTS_PER_READING);
    let unsent = [];
    for (const [index, { key, issue }] of batch.entries()) {
      if ((await this.fire(key, this.eventData(issue))) === 'retry') {
        unsent = batch.slice(index);
        break;
      }
    }
    const next = this.snapshot(scope, reading);
    for (const { key, issue } of unsent) {
      if (key === TRIGGERS.CREATED) {
        // Sent in increasing order: the first one unsent bounds the others.
        next.maxId = Math.min(next.maxId, issue.id - 1);
      } else if (key === TRIGGERS.OVERDUE) {
        next.overdue = next.overdue.filter((id) => id !== issue.id);
      } else if (key === TRIGGERS.ASSIGNED) {
        next.mine = next.mine.filter((id) => id !== issue.id);
      } else if (!next.open.includes(issue.id)) {
        next.open.push(issue.id);
      }
    }
    this.saved = next;
    if (JSON.stringify(this.saved) !== JSON.stringify(before)) {
      this.store.save(this.saved);
    }
  }

  eventData(issue) {
    return {
      issue_id: issue.id,
      subject: issue.subject,
      project: issue.project,
      tracker: issue.tracker,
      status: issue.status,
      priority: issue.priority,
      author: issue.author,
      assigned_to: issue.assignee,
      due_date: issue.dueDate,
      url: issueUrl(this.config.url, issue.id),
    };
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
      return 'sent';
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
      // A refusal a retry would not change is skipped, the rest tried again.
      return PERMANENT_REFUSALS.includes(err?.status) ? 'skip' : 'retry';
    }
  }

  // --- Commands --------------------------------------------------------------

  /** A Redmine error, in words for the user (Redmine's own messages for a 422). */
  explain(err) {
    if (!(err instanceof RedmineError)) {
      return err;
    }
    const language = this.language;
    const colon = language === 'fr' ? ' : ' : ': ';
    const details = err.details.length > 0 ? ` (${err.details.join('; ')})` : '';
    const status = !details && err.status ? ` (HTTP ${err.status})` : '';
    return new Error(
      `Redmine${colon}${pick(ERROR_TEXT[err.kind], language)}${details || status}`.slice(0, 400),
      { cause: err },
    );
  }

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.notConfigured, this.language));
    }
    return this.client;
  }

  fail(key) {
    return new Error(pick(ACTION_TEXT[key], this.language));
  }

  /** Read again now, and wait for it a little (the scene should not lag). */
  async refreshSoon() {
    const refresh = this.poll().catch(() => {});
    let timer;
    await Promise.race([
      refresh,
      new Promise((resolve) => {
        timer = setTimeout(resolve, REFRESH_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  /** An item of a Redmine list by number, identifier or name. */
  find(items, query, notFound) {
    const { item, reason } = findByIdOrName(
      items.filter((entry) => Number.isInteger(entry?.id)),
      query,
    );
    if (!item) {
      throw this.fail(reason === 'ambiguous' ? 'ambiguous' : notFound);
    }
    return item;
  }

  /**
   * Create an issue, authored by the user of the key.
   * @param {object} fields project, subject, description, priority, tracker (strings), assign_to_me
   * @returns {Promise<{ id: number, subject: string, url: string }>}
   */
  async createIssue(fields = {}) {
    const client = this.requireClient();
    const projectQuery = String(fields.project ?? '').trim();
    if (!projectQuery) {
      throw this.fail('emptyProject');
    }
    const subject = String(fields.subject ?? '').trim();
    if (!subject) {
      throw this.fail('emptySubject');
    }
    const description = String(fields.description ?? '').trim();
    let created;
    try {
      const project = this.find(await client.projects(), projectQuery, 'projectNotFound');
      const input = { project_id: project.id, subject: subject.slice(0, SUBJECT_MAX) };
      if (description) {
        input.description = description.slice(0, DESCRIPTION_MAX);
      }
      if (String(fields.priority ?? '').trim()) {
        input.priority_id = this.find(
          await client.priorities(),
          fields.priority,
          'priorityNotFound',
        ).id;
      }
      if (String(fields.tracker ?? '').trim()) {
        input.tracker_id = this.find(await client.trackers(), fields.tracker, 'trackerNotFound').id;
      }
      if (fields.assign_to_me === true || fields.assign_to_me === 'true') {
        input.assigned_to_id = (this.account ?? (await client.account())).id;
      }
      created = await client.createIssue(input);
    } catch (err) {
      throw this.explain(err);
    }
    const id = Number(created.id);
    // Never announced by the next reading: a scene "new issue → create an
    // issue" would loop.
    this.ownIssues = [...this.ownIssues, id].slice(-OWN_ISSUES_KEPT);
    if (this.saved) {
      this.saved = { ...this.saved, own: this.ownIssues };
      this.store.save(this.saved);
    }
    logger.info(`Issue #${id} created from Gladys`);
    await this.refreshSoon();
    return { id, subject, url: issueUrl(this.config.url, id) };
  }

  /** Add a note to an issue, written by the user of the key. */
  async addNote(fields = {}) {
    const client = this.requireClient();
    const id = parseIssueNumber(fields.issue);
    if (id === null) {
      throw this.fail('badIssue');
    }
    const notes = String(fields.text ?? '').trim();
    if (!notes) {
      throw this.fail('emptyText');
    }
    let issue;
    try {
      // Read first: a clear message for an issue that does not exist.
      issue = parseIssue(await client.issue(id));
      await client.addNote(id, notes.slice(0, DESCRIPTION_MAX));
    } catch (err) {
      if (err instanceof RedmineError && err.kind === ERROR_KINDS.NOT_FOUND) {
        throw this.fail('issueNotFound');
      }
      throw this.explain(err);
    }
    logger.info(`Note added to issue #${id} from Gladys`);
    return { id, subject: issue?.subject ?? `#${id}` };
  }

  /** The "Test the connection" action: read now, report. */
  async testConnection() {
    this.projects = null;
    await this.poll();
    const status = this.connectionStatus();
    if (!status.connected) {
      const message = allLanguages((language) =>
        REPORT_TEXT[language].failed(pick(status.message, language)),
      );
      throw new Error(message[this.language]);
    }
    const summary = this.summary();
    const user = this.account.name || this.account.login;
    const unknown = this.unknownProjects.join(', ');
    return allLanguages(
      (language) =>
        REPORT_TEXT[language].ok(user, summary.open, summary.assignedToMe, summary.overdue) +
        (unknown ? REPORT_TEXT[language].unknownProjects(unknown) : ''),
    );
  }
}
