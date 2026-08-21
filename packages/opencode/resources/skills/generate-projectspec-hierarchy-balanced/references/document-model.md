# Document model and gates

Physical hierarchy is Workspace -> optional subsystem -> Project -> module/build unit.
Descriptor/build ownership establishes candidates; one HomeGraph/build-evidence correction
pass freezes them. Every frozen physical unit has Architecture.

Module Business gate:

| Role | Detail | Business output |
|---|---|---|
| behavior-owner | standalone | module Business |
| supporting-behavior | standalone | module Business when independently useful |
| supporting-behavior | project-grouped | Project Business coverage |
| architecture-only | none | no module Business |

Project Business always owns complete grouped behavior. A distributed capability document is
rare and allowed only when no module or Project can own the journey without duplication.

Project Architecture contains one canonical metadata line with confirmed Project type, observed
architecture pattern, ordered primary technologies, and `Supersedes discovery: yes|no`. Use `yes`
only when completed document evidence explicitly corrects discovery; otherwise any conflict fails
the Project check. Project Business supplies the final concise Project summary.

Do not create old standalone UX flows, screen trees, wireframes, component inventories,
data-model, localization, development, deployment, API, or test-strategy documents.
