# Repository Guidelines

## Project Overview

SeekMix is a CommonJS Node.js library for semantic caching with SQLite and `sqlite-vec`. Embedding providers live alongside the cache implementation in `index.js`; configuration is supplied through provider and `SeekMix` constructor options rather than a separate config module.

## Project Structure & Module Organization

- `index.js`: public exports, embedding providers, SQLite schema, and cache operations.
- `test/`: Node test-runner suites named `*.test.js`.
- `demo/`: runnable ESM examples for local, OpenAI, and OpenRouter providers. Treat generated `*.db` files as local runtime artifacts.
- `skills/seekmix/`: the published agent skill; `.agents/skills/sqlite-vec/` contains contributor reference material.
- `README.md`: public API, configuration, and usage documentation.

## Build, Test, and Development Commands

The package pins pnpm 11.9.0 but does not pin Node.js or define a build step.

```bash
corepack pnpm install                 # install root dependencies and native addons
pnpm test                            # run every test with node --test
node --test test/tags-in-out.test.js # run the fast deterministic tag suite
node demo/case3-local.js             # exercise the local Hugging Face provider
```

The local demo and multilingual suite may download a model and take substantially longer on first use. No lint or formatter command is configured.

## Coding Style & Naming Conventions

Match the existing JavaScript: four-space indentation, semicolons, single quotes, trailing commas in multiline literals, and CommonJS imports in library/test files. Use `PascalCase` for classes and providers, `camelCase` for methods and variables, and leading underscores for private implementation helpers. Keep public exports centralized in `module.exports`.

## Testing Guidelines

Use `node:test` with strict `assert`. Prefer `:memory:` databases and deterministic stub embedding providers for unit coverage; reserve real models or network providers for explicit integration tests. Add focused regression tests for cache lifecycle, vector matching, TTL, and tag-filter changes. No coverage threshold is configured.

## Commit & Pull Request Guidelines

Recent commits use short imperative summaries such as `Add in/out tag filtering support with tests and docs.` Keep each commit scoped and include version bumps only for release work. Pull requests should explain behavior changes, list commands run, link relevant issues, and update `README.md` when the public API changes. Do not commit API keys, `.env` files, generated databases, or model caches.
