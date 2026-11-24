# Packaging files for release (M5)

PLAN.md "M5" is the context. This task adds only files and settings; no plugin code changes.

## Do

1. **LICENSE:** copy `../zotquicksearch/LICENSE` (the full GNU AGPL v3 text) to `LICENSE` byte for byte. Don't retype or summarise it. Check with `cmp`.
2. **`.github/workflows/release.yml`:** copy `../zotquicksearch/.github/workflows/release.yml` unchanged. Tagged pushes (`v*`) build and publish the `.xpi` and `update.json` through `zotero-plugin-dev/workflows`.
3. **`.github/workflows/ci.yml`:** based on `../zotquicksearch/.github/workflows/ci.yml`, on pushes and PRs to `main`, with three jobs, each using `zotero-plugin-dev/workflows/setup-js@main`:
   - `lint`: `npm run lint:check`
   - `build`: `npm run build`, then upload `.scaffold/build` as an artifact (as the template does)
   - `unit`: `npm run test:unit`

   Leave out the template's `test` job (`npm run test`): it needs a Zotero binary.

4. **`addon/manifest.json`:** set `strict_min_version` to `"10.0"` and `strict_max_version` to `"10.*"`. The plugin uses Zotero 10 internals and has been tested only on 10.0.9. Change nothing else in the manifest.
5. **`.gitignore`:** make sure `.scaffold/`, `node_modules/`, `.env`, `.delegate-logs/` and `.commandcode/` are ignored. Add any that are missing; don't remove entries.

Don't create a README (the orchestrator writes it) and don't touch `src/`.

## Checks that must pass

- `npm run build`
- `npm run test:unit`
- `npm run lint:check` (run `npm run lint:fix` first if needed; workflow YAML is checked by Prettier)
