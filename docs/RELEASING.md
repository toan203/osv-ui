# Release process

The repository publishes `osv-ui` and `osv-ui-mcp` in dependency order.

1. Run **Prepare version update** with the desired core version.
2. Review and merge the generated release PR.
3. **Publish osv-ui** validates and publishes the core package.
4. After npm exposes that version, the same workflow pins `osv-ui-mcp` to the exact core version, updates its lockfile, validates it, and merges an MCP synchronization PR.
5. The core workflow publishes `osv-ui-mcp` directly after the synchronization commit. **Publish osv-ui-mcp** remains an independent retry path for package-only changes or npm failures.

If core publishing succeeds but PR creation is interrupted, rerun **Publish osv-ui**. It detects the already-published core version and resumes MCP synchronization without republishing. **Synchronize MCP version** is the manual recovery path for selecting an explicit published core/MCP version pair.

Both publish workflows support npm Trusted Publishing through GitHub OIDC. Configure each package on npmjs.com with its corresponding workflow filename and the `npm` GitHub environment. As a fallback, add a granular automation token with bypass-2FA permission as the `NPM_TOKEN` environment secret. Never commit npm tokens to the repository.

Required trusted-publisher workflow files:

- `publish-core.yml` for `osv-ui`
- `publish-mcp.yml` for `osv-ui-mcp`

The workflows use npm provenance and publish prerelease versions under the `next` dist-tag.
