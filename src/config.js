// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Redmine (its address and the API key of one of its users), read on a
// timer of the container, and optionally a few projects followed each by a
// device of their own.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '120', '300', '600'];

// Projects followed with a device of their own, at most.
export const MAX_PROJECTS = 10;

export const DEFAULT_CONFIG = {
  url: '',
  api_key: '',
  projects: '',
  allow_self_signed: false,
  poll_interval: '300',
  language: 'fr',
};

/**
 * Parse the address typed by the user into the base URL of Redmine: a bare
 * host (`192.0.2.30:3000`), or a page copied from the browser
 * (`https://redmine.example.org/redmine/issues/12`). HTTP by default. A path
 * prefix is kept (Redmine under `/redmine`), the pages of the web app are
 * dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/prefix]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname
    .replace(
      /\/(issues|projects|my|login|admin|activity|news|users|groups|time_entries|search|settings|roles|trackers|issue_statuses|enumerations|workflows|custom_fields)([/.?].*)?$/,
      '',
    )
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

const bool = (value) => value === true || value === 'true';

/**
 * The projects typed by the user (identifiers, names or numbers), separated
 * by commas, semicolons or line breaks; duplicates dropped.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseProjects(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  const seen = new Set();
  return raw
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PROJECTS);
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = typeof source.url === 'string' ? source.url.trim() : '';
  const poll = String(source.poll_interval ?? '');
  return {
    url: parseServerUrl(typed),
    urlTyped: typed !== '',
    // Kept as typed, minus the blanks a copy and paste adds around it.
    apiKey: typeof source.api_key === 'string' ? source.api_key.trim() : '',
    projects: parseProjects(source.projects),
    allowSelfSigned: bool(source.allow_self_signed),
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(poll) ? poll : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
