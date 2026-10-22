// -----------------------------------------------------------------------------
// The Gladys devices: one "Redmine" device for every issue the user of the key
// sees, and one per project followed (configuration, `projects`).
//
// Identity: `tracker` / `main` for the global device (one Redmine per
// integration, so it keeps its history when the address or the key changes),
// `project` / `<project number>` for a project (the number never changes in
// Redmine, the identifier and the name may).
//
// Features (category/type couples of the core table, test/gladys-rules.test.js):
// five counter-sensor/integer counters, definitions in src/redmine/model.js.
//
// The devices are published with should_poll: false: the integration reads
// Redmine on its own timer (src/hub.js), every 1 to 10 minutes.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'tracker';
export const DEVICE_ID = 'main';
export const PROJECT_TYPE = 'project';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  OPEN: 'open',
  ASSIGNED_TO_ME: 'assigned_to_me',
  OVERDUE: 'overdue',
  DUE_TODAY: 'due_today',
  UPDATED_TODAY: 'updated_today',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.OPEN]: 'Open issues',
    [FEATURE_KEYS.ASSIGNED_TO_ME]: 'Issues assigned to me',
    [FEATURE_KEYS.OVERDUE]: 'Overdue issues',
    [FEATURE_KEYS.DUE_TODAY]: 'Issues due today',
    [FEATURE_KEYS.UPDATED_TODAY]: 'Issues updated today',
  },
  fr: {
    [FEATURE_KEYS.OPEN]: 'Demandes ouvertes',
    [FEATURE_KEYS.ASSIGNED_TO_ME]: 'Demandes assignées à moi',
    [FEATURE_KEYS.OVERDUE]: 'Demandes en retard',
    [FEATURE_KEYS.DUE_TODAY]: "Demandes à échéance aujourd'hui",
    [FEATURE_KEYS.UPDATED_TODAY]: "Demandes mises à jour aujourd'hui",
  },
  de: {
    [FEATURE_KEYS.OPEN]: 'Offene Tickets',
    [FEATURE_KEYS.ASSIGNED_TO_ME]: 'Mir zugewiesene Tickets',
    [FEATURE_KEYS.OVERDUE]: 'Überfällige Tickets',
    [FEATURE_KEYS.DUE_TODAY]: 'Heute fällige Tickets',
    [FEATURE_KEYS.UPDATED_TODAY]: 'Heute aktualisierte Tickets',
  },
  es: {
    [FEATURE_KEYS.OPEN]: 'Peticiones abiertas',
    [FEATURE_KEYS.ASSIGNED_TO_ME]: 'Peticiones asignadas a mí',
    [FEATURE_KEYS.OVERDUE]: 'Peticiones atrasadas',
    [FEATURE_KEYS.DUE_TODAY]: 'Peticiones que vencen hoy',
    [FEATURE_KEYS.UPDATED_TODAY]: 'Peticiones actualizadas hoy',
  },
};

// Display bound (the core never applies it on write).
const COUNTER_MAX = 100000;

// Order = display order in Gladys; `value` reads a summary of src/redmine/model.js.
const FEATURES = [
  [FEATURE_KEYS.OPEN, (summary) => summary.open],
  [FEATURE_KEYS.ASSIGNED_TO_ME, (summary) => summary.assignedToMe],
  [FEATURE_KEYS.OVERDUE, (summary) => summary.overdue],
  [FEATURE_KEYS.DUE_TODAY, (summary) => summary.dueToday],
  [FEATURE_KEYS.UPDATED_TODAY, (summary) => summary.updatedToday],
];

/** The external ids of the global device (no project) or of a project's. */
export const deviceIds = (gladys, projectId) =>
  projectId
    ? gladys.externalIds(PROJECT_TYPE, String(projectId))
    : gladys.externalIds(DEVICE_TYPE, DEVICE_ID);

/**
 * @param {object} gladys
 * @param {string} language
 * @param {{ id: number, name: string }} [project] absent: the global device
 */
export function buildDevice(gladys, language = 'en', project) {
  const ids = deviceIds(gladys, project?.id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: project ? `Redmine ${project.name}`.slice(0, 80) : 'Redmine',
    external_id: ids.device,
    should_poll: false,
    features: FEATURES.map(([key]) => ({
      name: names[key],
      external_id: ids.feature(key),
      category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: COUNTER_MAX,
    })),
  };
}

/** The states of the five counters, in the `publishStates` format. */
export function featureStates(gladys, summary, projectId) {
  const ids = deviceIds(gladys, projectId);
  return FEATURES.map(([key, value]) => ({
    device_feature_external_id: ids.feature(key),
    state: value(summary),
  }));
}
