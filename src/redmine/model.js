// -----------------------------------------------------------------------------
// From the issues of the Redmine API to what Gladys shows: the counters of the
// devices, the widget and the scene variables.
//
// Definitions:
//   - open: an issue whose status is not closed (Redmine's "open");
//   - assigned to me: open, and assigned to the user of the key or to one of
//     its groups (Redmine's own `assigned_to_id=me`);
//   - overdue: open, and its due date is before today;
//   - due today: open, and its due date is today;
//   - updated today: changed since midnight, open or closed.
// "Today" is the day in the time zone of Gladys (TZ, injected by the
// supervisor): a due date is a plain day, with no time zone of its own.
// -----------------------------------------------------------------------------

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const nameOf = (ref) => text(ref?.name);
const idOf = (ref) => (Number.isInteger(ref?.id) ? ref.id : 0);

/**
 * @param {object} raw an issue of /issues.json or /issues/:id.json
 * @param {Set<number>} [closedStatuses] ids of the closed statuses, when the
 *   issue does not say it (Redmine before 5.1)
 */
export function parseIssue(raw, closedStatuses = new Set()) {
  const id = Number(raw?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  const closed =
    typeof raw.status?.is_closed === 'boolean'
      ? raw.status.is_closed
      : closedStatuses.has(idOf(raw.status));
  return {
    id,
    subject: text(raw.subject) || `#${id}`,
    projectId: idOf(raw.project),
    project: nameOf(raw.project),
    tracker: nameOf(raw.tracker),
    status: nameOf(raw.status),
    closed,
    priority: nameOf(raw.priority),
    author: nameOf(raw.author),
    assignee: nameOf(raw.assigned_to),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date ?? '') ? raw.due_date : '',
    updatedOn: text(raw.updated_on),
    closedOn: text(raw.closed_on),
  };
}

/** A list of raw issues, parsed, without duplicates (offset pages are not stable). */
export function parseIssues(raws, closedStatuses) {
  const seen = new Set();
  return (Array.isArray(raws) ? raws : [])
    .map((raw) => parseIssue(raw, closedStatuses))
    .filter((issue) => {
      if (!issue || seen.has(issue.id)) {
        return false;
      }
      seen.add(issue.id);
      return true;
    });
}

/** `YYYY-MM-DD` of a date, in the time zone of the process (TZ). */
export function localDay(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight of today in the time zone of the process, as a UTC timestamp for Redmine. */
export function midnightUtc(date) {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return midnight.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const isOverdue = (issue, today) =>
  !issue.closed && !!issue.dueDate && issue.dueDate < today;
export const isDueToday = (issue, today) => !issue.closed && issue.dueDate === today;

/**
 * The counters of one device.
 * @param {object} reading `{ open, mine, updated, openTotal, mineTotal, updatedTotal }`
 * @param {string} today `YYYY-MM-DD`
 * @param {number} [projectId] one project only; every issue when absent
 */
export function summarize(reading, today, projectId) {
  const scoped = (issues) =>
    projectId ? issues.filter((issue) => issue.projectId === projectId) : issues;
  const open = scoped(reading.open);
  return {
    // The totals of Redmine are exact beyond the pages read.
    open: projectId ? open.length : Math.max(reading.openTotal, open.length),
    assignedToMe: projectId
      ? scoped(reading.mine).length
      : Math.max(reading.mineTotal, reading.mine.length),
    overdue: open.filter((issue) => isOverdue(issue, today)).length,
    dueToday: open.filter((issue) => isDueToday(issue, today)).length,
    updatedToday: projectId
      ? scoped(reading.updated).length
      : Math.max(reading.updatedTotal, reading.updated.length),
  };
}

/**
 * The issues of the widget: overdue first, then by due date, then the newest.
 * @param {object[]} issues
 */
export function byUrgency(issues, today) {
  const rank = (issue) => (isOverdue(issue, today) ? 0 : issue.dueDate ? 1 : 2);
  return [...issues].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.dueDate && b.dueDate ? a.dueDate.localeCompare(b.dueDate) : 0) ||
      b.id - a.id,
  );
}

const fold = (value) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Find an item by its number (`12`, `#12`), its identifier (projects) or its
 * name; case, accents and repeated blanks ignored.
 * @template {{ id: number, name: string, identifier?: string }} T
 * @param {T[]} items
 * @param {unknown} query
 * @returns {{ item: T|null, reason?: 'empty'|'not_found'|'ambiguous' }}
 */
export function findByIdOrName(items, query) {
  const wanted = typeof query === 'number' ? String(query) : String(query ?? '').trim();
  if (!wanted) {
    return { item: null, reason: 'empty' };
  }
  const number = wanted.match(/^#?(\d+)$/);
  if (number) {
    const byId = items.find((item) => item.id === Number(number[1]));
    if (byId) {
      return { item: byId };
    }
  }
  const byIdentifier = items.find((item) => item.identifier && item.identifier === wanted);
  if (byIdentifier) {
    return { item: byIdentifier };
  }
  const target = fold(wanted);
  const matches = items.filter((item) => fold(String(item.name ?? '')) === target);
  if (matches.length === 1) {
    return { item: matches[0] };
  }
  return { item: null, reason: matches.length > 1 ? 'ambiguous' : 'not_found' };
}

/** `12`, `#12` or a number: the issue number, null otherwise. */
export function parseIssueNumber(query) {
  const match = String(query ?? '')
    .trim()
    .match(/^#?(\d{1,10})$/);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The page of an issue in Redmine. */
export const issueUrl = (base, id) => `${base}/issues/${id}`;
