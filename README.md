# Redmine for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Redmine](https://www.redmine.org), the open-source project management and issue
tracking web application: issue counters on a device (and optionally one per
project), a dashboard widget of the issues assigned to you, scene triggers on new,
assigned, overdue and closed issues, and scene actions that create an issue or
add a note, so something Gladys detects becomes an issue by itself.

It runs as an external integration: a small Node.js service in its own sandboxed
container, talking to Gladys through the
[integration SDK](https://github.com/GladysAssistant/integration-sdk-js) and to
Redmine through its REST API.

## Features

- **Device "Redmine"**: open issues, issues assigned to me (or to my groups),
  overdue, due today and updated today, as counters with history; the same
  counters on one device per project followed (optional, 10 at most).
- **Widget "My Redmine issues"**: assigned, overdue and due-today counts, and the
  eight most pressing issues assigned to me, overdue ones first and flagged.
- **Scene triggers**: new issue, issue assigned to me, issue overdue, issue
  closed, filtered by project, tracker and priority; subject, project, tracker,
  status, priority, author, assignee, due date and link as variables.
- **Scene actions**: create an issue (project, subject, description with scene
  variables, priority, tracker, assign to me), add a note to an issue.
- Four languages (English, French, German, Spanish).

## Requirements

- Gladys Assistant 5.1.0 or later.
- Redmine 4.2 or later (self-hosted, or hosted), with the REST API turned on
  (Administration → Settings → API), and the API key of a Redmine user.

## Installation

In Gladys: **Integrations** → **Install from GitHub**, with the address of this
repository: `https://github.com/guim31/gladys-redmine`. Once it is in the store,
install **Redmine** from the integration list instead.

Then fill in the address of Redmine and the API key on the **Configuration**
screen, and add the **Redmine** device from the **Discovery** tab. Everything is
in the [documentation](docs/en.md) (also in [French](docs/fr.md),
[German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

- Every 1 to 10 minutes (configurable), four calls: the user of the key
  (`/my/account.json`, the only call that fails when the REST API is off: the
  others would answer as to an anonymous visitor), the open issues, those
  assigned to the user (`assigned_to_id=me`, which counts its groups), and those
  updated since midnight. Lists are read 100 issues per page.
- "Today" is the day in the time zone of Gladys (`TZ`): a due date is a plain day.
- The scene events come from the difference with the previous reading, saved in
  `/data`: an issue number above the highest one seen is new, an open issue newly
  in the "assigned to me" list is assigned, an open issue past its due date is
  overdue, an issue open before and closed now is closed. The first reading only
  takes note. Issues created by the scene action fire nothing, so a scene cannot
  loop.
- The devices are published with `should_poll: false`: the container reads on its
  own timer, and only the changed counters are sent to Gladys.

## Checked on a real Redmine, and what was not

Checked in Docker against the official `redmine` **6.1** image (SQLite, default
data in French, REST API on), with users, projects and issues created through the
API: the answers kept in `test/fixtures/redmine/`, the error of every refusal
(wrong key, REST API off, missing issue, missing route, refused issue), issue
creation and notes, and the integration in its locked-down container against
that Redmine.

Not checked: Redmine 4.2 to 5.0 (the status of an issue does not say whether it
is closed: the integration reads `/issue_statuses.json` for that), a hosted
Redmine (Planio), a Redmine behind a reverse proxy or with LDAP users, and a real
Gladys instance (the tests use the SDK's fake Gladys).

## Limitations

- One Redmine per installation, 10 projects followed at most; a sub-project is not
  counted in its parent's device.
- The 1,000 newest open issues are detailed; the "open" and "assigned to me"
  totals stay exact beyond.
- An issue created then closed between two readings fires "new" but not
  "closed".

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against an in-memory Redmine (`test/helpers/fakeRedmine.js`) that
answers like the real one, and against the SDK's fake Gladys. They never touch the
network.

## Credits

- [Redmine](https://www.redmine.org) by Jean-Philippe Lang and the Redmine
  contributors (GPL-2.0): the integration only talks to its REST API; no code was
  copied. The cover uses the Redmine logo by Martin Herr (CC BY-SA 2.5), from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Redmine_logo.svg)
  (source: [edavis10/redmine_logo](https://github.com/edavis10/redmine_logo)), to
  name the service.
- The architecture, the devices, triggers, actions and widget follow
  [gladys-glpi](https://github.com/guim31/gladys-glpi), and the conformity tests
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Redmine or its
authors. The Redmine name and logo belong to their owners.

## License

Apache-2.0
