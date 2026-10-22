# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration keeps and sends:

- the Redmine address and the API key live in the configuration of the
  integration, stored by Gladys; the key travels in the `X-Redmine-API-Key`
  header, never in an address, and is never written to the logs;
- `/data/redmine-state.json` holds the address of Redmine, the id of the Redmine
  user, the highest issue number seen and the numbers of the open, overdue and
  assigned issues (to fire each scene event once): no subject, no content, no
  key;
- the integration only talks to the Redmine address of the configuration (HTTP
  or HTTPS); it acts with the rights of that Redmine user, so give it a
  dedicated user with the smallest role that fits.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Redmine, and the other third-party services and devices.
