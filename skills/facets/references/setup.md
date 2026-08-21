# Install optional rubrics

Only on user request; bundled rules suffice.

From the Facets `SKILL.md`, run:

```bash
FACETS_AGENT=codex VERBOSE=1 bash ../../plugins/facets/bin/install-prereqs.sh
```

The shared installer is locked and idempotent; it continues after failures and reports counts. Missing `npx`, network, or skills is nonfatal.
