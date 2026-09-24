# Shared site UI

`src/` is the single source of truth for the identical UI component set used by
`apps/dora-launch-blueprint-site` and `apps/mcp-bot-hub-patent-site`.
`site-files/` owns their identical mobile hook, class-name helper, and build
configuration.

Each site generates its local `components/ui/` directory before development,
build, start, or lint. Generated copies are ignored by Git; edit only this
package.

From the repository root, regenerate both sites with:

```bash
npm run site-ui:sync
```
