# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-22

### Added

- Redmine 4.2 or later in Gladys, through the REST API with the API key of a
  Redmine user.
- A "Redmine" device with five counters: open issues, issues assigned to me (or
  to one of my groups), overdue, due today and updated today; and, optionally,
  one device with the same counters per project followed (10 at most).
- The "My Redmine issues" dashboard widget: assigned, overdue and due-today
  counts, and the eight most pressing issues assigned to me, overdue ones
  flagged.
- Scene triggers "New Redmine issue", "Redmine issue assigned to me", "Redmine
  issue overdue" and "Redmine issue closed", filtered by project, tracker and
  priority, with the issue's subject, project, tracker, status, priority,
  author, assignee, due date and link as variables.
- Scene actions "Create a Redmine issue" (project, subject, description,
  priority, tracker, assign to me) and "Add a note to a Redmine issue".
- A "Test the connection" action, and connection statuses that say what to fix
  (REST API off, key refused, wrong address, self-signed certificate).
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/guim31/gladys-redmine/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-redmine/releases/tag/v1.0.0
