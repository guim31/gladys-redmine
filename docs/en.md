# Redmine

The issues of your [Redmine](https://www.redmine.org) in Gladys: how many are
open, assigned to you, overdue, due today, updated today. A scene reacts to a new
issue, to an issue assigned to you, to an issue going overdue or to an issue
closed, and Gladys can **create an issue by itself** when it detects something
to do: a water leak, a filter to change, a printer that stopped answering.

> **Feedback welcome.** This integration was tested against a real Redmine (the
> official `redmine` 6.1 Docker image, October 2026), not yet day to day on a
> real tracker. If something does not work as described, say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-redmine/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- **Redmine 4.2 or later**, self-hosted or hosted (Planio, a server of yours on
  the Internet), reachable from Gladys.
- A **Redmine user** Gladys reads and creates the issues as: yours, or one
  created for it (`gladys`), member of the projects to follow with a role that
  may view, add issues and add notes (the default **Developer** role does). The
  integration sees exactly what this user sees in Redmine.

## Installation

### In Redmine

1. **Administration** → **Settings** → **API** tab: tick **Enable REST web
   service**, then save.
2. Log in as the user of Gladys, open **My account**, and in the right column,
   under **API access key**, click **Show**: copy the key.

### In Gladys

1. **Integrations** → install **Redmine**.
2. On the **Configuration** screen, fill in:
   - **Address**: the address of Redmine as in the browser, e.g.
     `https://redmine.example.org` or `http://192.168.1.30:3000` (a `/redmine`
     folder is kept, `/issues/…` or `/projects/…` are dropped);
   - **API key**: the key copied at step 2;
   - **Projects with their own device** (optional): identifiers or names of
     projects, separated by commas, e.g. `house, office` (10 at most);
   - **Accept self-signed certificates**: for a Redmine on `https://` with a
     self-signed certificate;
   - **Refresh interval**: 1, 2, 5 (default) or 10 minutes;
   - **Language of the feature names**: the language of the names given to the
     features of the devices.
3. **Test the connection** tells the user and the number of open issues,
   assigned to it and overdue, and names the projects it could not find.
4. **Discovery** tab: add the **Redmine** device, and the device of each project
   followed (**Redmine House**, for example).

## Devices

One **Redmine** device for every issue the user sees, and one device per project
followed, with five counters updated at every reading:

| Feature               | What it counts                                            |
| --------------------- | --------------------------------------------------------- |
| Open issues           | issues whose status is not closed                         |
| Issues assigned to me | open issues assigned to the user, or to one of its groups |
| Overdue issues        | open issues whose due date is before today                |
| Issues due today      | open issues due today                                     |
| Issues updated today  | issues changed since midnight, open or closed             |

"Today" is the day in the time zone of Gladys. An issue without a due date is
never overdue. The counters keep their history, and serve as conditions in scenes
("if Overdue issues is above 0"). A project device counts the issues of that
project only, not those of its sub-projects.

## Dashboard

The **My Redmine issues** widget shows three tiles (assigned to me, overdue, due
today) and the eight most pressing open issues assigned to the user: overdue ones
first (red "Overdue" badge), then those due today (orange "Today" badge), then by
due date. Each line gives the project, the status and the priority. When Redmine
is on `https://`, each issue offers an **Open in Redmine** link.

## Scenes

### Triggers

The four triggers filter by **Project name**, **Tracker** and **Priority**,
written as in Redmine (capitals included; empty: any).

- **New Redmine issue**: an issue was created in Redmine, by a user, by email or
  by another tool. The issues created by Gladys itself fire nothing (no loop).
- **Redmine issue assigned to me**: an open issue is now assigned to the user of
  the key (or to one of its groups): just created so, or reassigned.
- **Redmine issue overdue**: an open issue just passed its due date. Checked at
  every reading: the first reading after midnight fires it for the issues due the
  day before.
- **Redmine issue closed**: an issue open at the previous reading now has a closed
  status (Closed, Rejected…).

Variables passed to the actions: issue number, subject, project, tracker, status,
priority, author, assignee, due date and link to the issue. The names are the
ones Redmine shows, in its language.

The events are detected at every reading: they arrive at most one refresh
interval after the facts. At the very first reading (or after a change of server
or user), the integration takes note of what exists without firing anything. A
reading fires 30 events at most (a mass import does not flood Gladys).

### Actions

- **Create a Redmine issue**: creates an issue as the user of the key, who is its
  author. Fields: **Project** (identifier, name or number, required),
  **Subject** (required), **Description** (optional; scene variables are
  welcome), **Priority** (name, empty: the default one), **Tracker** (name, empty:
  the first of the project) and **Assign to me**. Outputs: the issue number and
  its link.
- **Add a note to a Redmine issue**: adds a note to the issue given by its number
  (`125` or `#125`), as the user of the key. The number may come from a "Create a
  Redmine issue" earlier in the scene, or from the trigger. Outputs: the number
  and the subject of the issue.

A project, a priority or a tracker is given by its number or its name, case and
accents ignored; a project also by its identifier (`house`).

### Scene ideas

- **Water leak**: the leak sensor of the cellar reports a leak → **Create a
  Redmine issue** "Water leak in the cellar" in the `house` project, priority
  Urgent, assigned to me, description with the time; then a Gladys message with
  the link to the issue.
- **Morning briefing**: every weekday at 8:00, if **Issues due today** of the
  Redmine device is above 0, Gladys says how many issues are due today.
- **On call**: **New Redmine issue** filtered on the Immediate priority → a
  Telegram message with the subject, the author and the link; **Redmine issue
  overdue** → turn the office lamp red; **Redmine issue closed** → back to white.

## Troubleshooting

- **"no Redmine API at this address"**: check the address (with the `/redmine`
  folder if any) by opening `…/issues.json` in a browser: Redmine answers in JSON.
- **"the REST API is off"**: see step 1 in Redmine. With the API off, Redmine
  ignores the key and would show only the public projects: the integration
  checks it first.
- **"API key refused"**: the key was reset since (My account, Reset), or the user
  is locked.
- **"the Redmine user lacks a permission in this project"**: its role in the
  project may not add issues or notes.
- **"Projects not found"** (Test the connection): the user is not a member of the
  project, or the identifier is misspelt.
- **The counters stay at zero**: the user is a member of no project, or its role
  may not view the issues.

## Limits

- One Redmine per installation, 10 projects followed at most.
- The 1,000 newest open issues are detailed (overdue, due today, project
  devices); beyond, the "Open issues" and "Issues assigned to me" counters stay
  exact.
- A sub-project is not counted in its parent's device: follow it as a project.
- An issue created then closed between two readings fires "New Redmine issue"
  but not "closed".
- Custom fields, time entries and versions are not read.

This integration is not affiliated with Redmine or its authors.
