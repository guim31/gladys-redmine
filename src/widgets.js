// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `my_issues`.
//
// The use case: the screen of the office (or of the kitchen) shows what waits
// for the user of the key, without opening Redmine. Budget (8 components):
// three tiles (assigned to me, overdue, due today) and one list of the eight
// most pressing issues assigned to the user (overdue first, then by due date),
// each linked to its page in Redmine when Redmine is served in HTTPS (the
// widget links https only). The figures are values, not bound to device
// features, so the widget works before the device is added.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { byUrgency, isDueToday, isOverdue, issueUrl } from './redmine/model.js';
import { pick } from './texts.js';

const MAX_ITEMS = 8;

export const TEXT = {
  configure: {
    en: 'Enter the address of your Redmine and an API key in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre Redmine et une clé d'API dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Redmine und einen API-Schlüssel in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su Redmine y una clave de API en la configuración de la integración.',
  },
  noAnswer: {
    en: 'Redmine does not answer: see the Configuration screen of the integration.',
    fr: "Redmine ne répond pas : voir l'écran Configuration de l'intégration.",
    de: 'Redmine antwortet nicht: Sieh dir die Konfiguration der Integration an.',
    es: 'Redmine no responde: consulte la pantalla de configuración de la integración.',
  },
  stale: {
    en: 'Redmine does not answer: last known issues.',
    fr: 'Redmine ne répond pas : dernières demandes connues.',
    de: 'Redmine antwortet nicht: zuletzt bekannte Tickets.',
    es: 'Redmine no responde: últimas peticiones conocidas.',
  },
  nothing: {
    en: 'No open issue assigned to you.',
    fr: 'Aucune demande ouverte ne vous est assignée.',
    de: 'Dir ist kein offenes Ticket zugewiesen.',
    es: 'No tiene ninguna petición abierta asignada.',
  },
  mine: { en: 'Assigned to me', fr: 'Assignées à moi', de: 'Mir zugewiesen', es: 'Asignadas a mí' },
  overdue: { en: 'Overdue', fr: 'En retard', de: 'Überfällig', es: 'Atrasadas' },
  dueToday: { en: 'Due today', fr: "Pour aujourd'hui", de: 'Heute fällig', es: 'Vencen hoy' },
  overdueBadge: { en: 'Overdue', fr: 'En retard', de: 'Überfällig', es: 'Atrasada' },
  todayBadge: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  open_link: {
    en: 'Open in Redmine',
    fr: 'Ouvrir dans Redmine',
    de: 'In Redmine öffnen',
    es: 'Abrir en Redmine',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** One issue of the list: number and subject, project, status and priority, a due badge. */
function issueItem(hub, issue, language) {
  const subtitle = [issue.project, issue.status, issue.priority].filter(Boolean).join(' · ');
  const item = { title: fit(`#${issue.id} ${issue.subject}`, 60), subtitle: fit(subtitle, 80) };
  if (isOverdue(issue, hub.today)) {
    item.badge = { text: t(TEXT.overdueBadge, language), color: WIDGET_COLORS.DANGER };
  } else if (isDueToday(issue, hub.today)) {
    item.badge = { text: t(TEXT.todayBadge, language), color: WIDGET_COLORS.WARNING };
  }
  if (hub.config.url.startsWith('https://')) {
    item.links = [{ url: issueUrl(hub.config.url, issue.id), label: t(TEXT.open_link, language) }];
  }
  return item;
}

async function get(hub, { language = 'en' } = {}) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.readAt === 0) {
    return message(TEXT.noAnswer, language);
  }
  const { mine, mineTotal } = hub.reading;
  const overdue = mine.filter((issue) => isOverdue(issue, hub.today)).length;
  const dueToday = mine.filter((issue) => isDueToday(issue, hub.today)).length;
  const components = [];
  if (hub.error) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.stale, language) });
  }
  components.push(
    {
      type: 'value',
      value: Math.max(mineTotal, mine.length),
      label: t(TEXT.mine, language),
      icon: 'user',
    },
    {
      type: 'value',
      value: overdue,
      label: t(TEXT.overdue, language),
      icon: 'alert-circle',
      color: overdue > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    },
    {
      type: 'value',
      value: dueToday,
      label: t(TEXT.dueToday, language),
      icon: 'calendar',
      ...(dueToday > 0 ? { color: WIDGET_COLORS.WARNING } : {}),
    },
  );
  if (mine.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothing, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: byUrgency(mine, hub.today)
        .slice(0, MAX_ITEMS)
        .map((issue) => issueItem(hub, issue, language)),
    });
  }
  return { ttl_seconds: 300, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get },
};
