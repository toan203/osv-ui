# Contributing to osv-ui

Thanks for taking the time to contribute! This guide will help you get started.

## Quick setup

```bash
git clone https://github.com/toan203/osv-ui
cd osv-ui
npm install

# Run against your own project (Node.js 18+)
node bin/cli.js /path/to/any/npm-or-python-project
```

## Project structure

```
osv-ui/
├── bin/
│   └── cli.js          # Entry point — CLI args, service discovery, orchestration
├── src/
│   ├── parsers.js       # Manifest parsers — add new ecosystems here
│   ├── osv.js           # OSV.dev API client — batch query, response parsing
│   ├── scanner.js       # Orchestrates parsing + OSV query for one service
│   └── server.js        # Express server + dashboard HTML generation
├── docs/
│   └── screenshot.png   # Dashboard screenshot for README
├── README.md
├── CONTRIBUTING.md
├── LICENSE
└── package.json
```

## Adding a new ecosystem (e.g. Go, Rust, Java)

1. Open `src/parsers.js`
2. Add a `parseXxx(dir)` function that returns an array of `{ name, version, ecosystem, isDirect, dev, registry }`
3. Add the ecosystem string to the `ECOSYSTEM_MAP` in `src/osv.js` (check [OSV ecosystem list](https://osv.dev/ecosystems))
4. Call your parser inside `parseManifests(dir)` and push the result
5. Test it:
   ```bash
   node bin/cli.js ./path/to/a-go-project
   ```

## Code style

- ESM modules (`import`/`export`) — no CommonJS `require`
- No TypeScript (keep the barrier low for contributors)
- No build step — what you write is what runs
- Prefer readability over cleverness
- Add a comment if the "why" isn't obvious

## Opening a PR

1. Fork the repo and create a branch: `git checkout -b feat/go-support`
2. Make your changes
3. Test against a real project
4. Open a PR with a short description of what you changed and why
5. Reference any related issue: `Closes #123`

## Reporting bugs

Open a GitHub Issue with:
- Your OS and Node.js version
- The manifest file type you were scanning
- The command you ran
- What happened vs what you expected

If you can share a minimal `requirements.txt` or `package-lock.json` that reproduces the issue, that helps a lot.

## Questions?

Open a GitHub Discussion — not an Issue. Issues are for bugs and feature requests.
