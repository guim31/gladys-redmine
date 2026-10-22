// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report and the scene
// action errors. Four languages, the four of the Gladys interface; German
// says "du", Spanish "usted". The names of statuses, priorities, trackers and
// projects come from Redmine, in its own language. test/i18n.test.js checks
// every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './redmine/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Redmine in the configuration.',
    fr: "Saisissez l'adresse de votre Redmine dans la configuration.",
    de: 'Gib die Adresse deines Redmine in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Redmine en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. https://redmine.example.org',
    fr: 'Adresse incomprise, ex. https://redmine.example.org',
    de: 'Adresse nicht verstanden, z. B. https://redmine.example.org',
    es: 'Dirección no válida, p. ej. https://redmine.example.org',
  },
  noKey: {
    en: 'Enter the API key of a Redmine user in the configuration (My account, API access key).',
    fr: "Saisissez la clé d'API d'un utilisateur Redmine dans la configuration (Mon compte, Clé d'accès API).",
    de: 'Gib in der Konfiguration den API-Schlüssel eines Redmine-Benutzers ein (Mein Konto, API-Zugriffsschlüssel).',
    es: 'Introduzca la clave de API de un usuario de Redmine en la configuración (Mi cuenta, Clave de acceso a la API).',
  },
};

// One short explanation per error kind (src/redmine/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Redmine does not answer',
    fr: 'Redmine ne répond pas',
    de: 'Redmine antwortet nicht',
    es: 'Redmine no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused: check it in My account, or the user is locked',
    fr: "clé d'API refusée : vérifiez-la dans Mon compte, ou l'utilisateur est verrouillé",
    de: 'API-Schlüssel abgelehnt: Prüfe ihn unter Mein Konto, oder der Benutzer ist gesperrt',
    es: 'clave de API rechazada: compruébela en Mi cuenta, o el usuario está bloqueado',
  },
  [ERROR_KINDS.API_DISABLED]: {
    en: 'the REST API is off: turn it on in Administration, Settings, API',
    fr: "l'API REST est désactivée : activez-la dans Administration, Configuration, API",
    de: 'die REST-API ist aus: Schalte sie unter Administration, Konfiguration, API ein',
    es: 'la API REST está desactivada: actívela en Administración, Configuración, API',
  },
  [ERROR_KINDS.RIGHTS]: {
    en: 'the Redmine user lacks a permission in this project',
    fr: "l'utilisateur Redmine n'a pas la permission nécessaire dans ce projet",
    de: 'dem Redmine-Benutzer fehlt eine Berechtigung in diesem Projekt',
    es: 'al usuario de Redmine le falta un permiso en este proyecto',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'not found, or not visible to the user of the key',
    fr: "introuvable, ou invisible pour l'utilisateur de la clé",
    de: 'nicht gefunden oder für den Benutzer des Schlüssels unsichtbar',
    es: 'no encontrado, o no visible para el usuario de la clave',
  },
  [ERROR_KINDS.INVALID]: {
    en: 'refused by Redmine',
    fr: 'refusé par Redmine',
    de: 'von Redmine abgelehnt',
    es: 'rechazado por Redmine',
  },
  [ERROR_KINDS.NOT_REDMINE]: {
    en: 'no Redmine API at this address',
    fr: 'aucune API Redmine à cette adresse',
    de: 'keine Redmine-API unter dieser Adresse',
    es: 'no hay ninguna API de Redmine en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (user, open, mine, overdue) =>
      `Redmine OK, user ${user}: ${open} open issue(s), ${mine} assigned to you, ${overdue} overdue.`,
    failed: (reason) => `Redmine: ${reason}.`,
    unknownProjects: (names) => ` Projects not found: ${names}.`,
  },
  fr: {
    ok: (user, open, mine, overdue) =>
      `Redmine OK, utilisateur ${user} : ${open} demande(s) ouverte(s), ${mine} assignée(s) à vous, ${overdue} en retard.`,
    failed: (reason) => `Redmine : ${reason}.`,
    unknownProjects: (names) => ` Projets introuvables : ${names}.`,
  },
  de: {
    ok: (user, open, mine, overdue) =>
      `Redmine OK, Benutzer ${user}: ${open} offene(s) Ticket(s), ${mine} dir zugewiesen, ${overdue} überfällig.`,
    failed: (reason) => `Redmine: ${reason}.`,
    unknownProjects: (names) => ` Projekte nicht gefunden: ${names}.`,
  },
  es: {
    ok: (user, open, mine, overdue) =>
      `Redmine OK, usuario ${user}: ${open} petición(es) abierta(s), ${mine} asignada(s) a usted, ${overdue} atrasada(s).`,
    failed: (reason) => `Redmine: ${reason}.`,
    unknownProjects: (names) => ` Proyectos no encontrados: ${names}.`,
  },
};

// Errors of the scene actions (shown in the scene logs of Gladys).
export const ACTION_TEXT = {
  notConfigured: {
    en: 'Redmine is not configured.',
    fr: "Redmine n'est pas configuré.",
    de: 'Redmine ist nicht konfiguriert.',
    es: 'Redmine no está configurado.',
  },
  emptyProject: {
    en: 'Give the project of the issue.',
    fr: 'Indiquez le projet de la demande.',
    de: 'Gib das Projekt des Tickets an.',
    es: 'Indique el proyecto de la petición.',
  },
  emptySubject: {
    en: 'Give the subject of the issue.',
    fr: 'Indiquez le sujet de la demande.',
    de: 'Gib den Betreff des Tickets an.',
    es: 'Indique el asunto de la petición.',
  },
  emptyText: {
    en: 'Give the text of the note.',
    fr: 'Indiquez le texte de la note.',
    de: 'Gib den Text der Notiz an.',
    es: 'Indique el texto de la nota.',
  },
  badIssue: {
    en: 'Give the number of the issue, e.g. 125 or #125.',
    fr: 'Indiquez le numéro de la demande, ex. 125 ou #125.',
    de: 'Gib die Nummer des Tickets an, z. B. 125 oder #125.',
    es: 'Indique el número de la petición, p. ej. 125 o #125.',
  },
  issueNotFound: {
    en: 'Redmine has no issue with this number, or the user of the key cannot see it.',
    fr: "Redmine n'a aucune demande avec ce numéro, ou l'utilisateur de la clé ne la voit pas.",
    de: 'Redmine hat kein Ticket mit dieser Nummer, oder der Benutzer des Schlüssels sieht es nicht.',
    es: 'Redmine no tiene ninguna petición con este número, o el usuario de la clave no puede verla.',
  },
  projectNotFound: {
    en: 'The user of the key sees no project with this identifier, name or number.',
    fr: "L'utilisateur de la clé ne voit aucun projet avec cet identifiant, ce nom ou ce numéro.",
    de: 'Der Benutzer des Schlüssels sieht kein Projekt mit dieser Kennung, diesem Namen oder dieser Nummer.',
    es: 'El usuario de la clave no ve ningún proyecto con este identificador, nombre o número.',
  },
  priorityNotFound: {
    en: 'Redmine has no priority with this name.',
    fr: "Redmine n'a aucune priorité de ce nom.",
    de: 'Redmine hat keine Priorität mit diesem Namen.',
    es: 'Redmine no tiene ninguna prioridad con este nombre.',
  },
  trackerNotFound: {
    en: 'Redmine has no tracker with this name.',
    fr: "Redmine n'a aucun tracker de ce nom.",
    de: 'Redmine hat keinen Tracker mit diesem Namen.',
    es: 'Redmine no tiene ningún tipo con este nombre.',
  },
  ambiguous: {
    en: 'Several items have this name in Redmine: give the identifier or the number.',
    fr: "Plusieurs éléments portent ce nom dans Redmine : indiquez l'identifiant ou le numéro.",
    de: 'Mehrere Einträge haben diesen Namen in Redmine: Gib die Kennung oder die Nummer an.',
    es: 'Varios elementos tienen este nombre en Redmine: indique el identificador o el número.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A multi-language object from a function of the language. */
export const allLanguages = (render) =>
  Object.fromEntries(Object.keys(INIT_FAILED).map((language) => [language, render(language)]));
