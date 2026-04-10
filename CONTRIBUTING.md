# Developer Guide — abdk-mustache-js

A fast, compiled Mustache template engine for JavaScript / TypeScript by
[ABDK Consulting](https://www.abdk.consulting/).

---

## Repository layout

```
abdk-mustache-js/
├── src/
│   ├── index.ts              ← library source (single file)
│   └── test/
│       └── index.test.ts     ← test suite (Node.js built-in test runner)
├── dist/                     ← compiled output (git-ignored, npm-published)
│   ├── index.js
│   ├── index.d.ts
│   └── *.map
├── .github/
│   └── workflows/
│       └── ci.yml            ← GitHub Actions CI (build + test on every push/PR)
├── .gitignore
├── .npmignore                ← excludes test artifacts from the npm tarball
├── package.json
├── tsconfig.json
├── LICENSE                   ← MIT
├── CONTRIBUTING.md           ← this file (developer docs)
└── README.md                 ← public docs shown on npmjs.com
```

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18 LTS |
| npm | 9 |

Install dependencies:

```bash
npm install
```

---

## Building

```bash
npm run build          # compile TypeScript → dist/
npm run build:watch    # watch mode
npm run clean          # remove dist/
```

TypeScript is configured via `tsconfig.json`:

- **`rootDir`** — `src/`
- **`outDir`** — `dist/`
- **`declaration`** — `true` → `.d.ts` files emitted
- **`declarationMap`** — `true` → source maps for `.d.ts`
- **`sourceMap`** — `true` → `.js.map` for debugging

---

## Testing

```bash
npm test
```

Compiles the project, then runs the test suite with the Node.js built-in test
runner (`node:test`) — no additional test-framework dependency.

The test suite lives in `src/test/index.test.ts` and covers:

| Area | What is tested |
|------|---------------|
| `compile` — variables | Interpolation, HTML escaping, missing / null / zero / boolean values, dotted paths, `.` context |
| `compile` — unescaped | `{{{…}}}` and `{{& …}}` |
| `compile` — sections | Truthy / falsy, array iteration, nulls in arrays, nested sections |
| `compile` — inverted sections | Falsy values, empty arrays |
| `compile` — comments | Output suppression |
| `compile` — partials | Named, missing, dynamic (`{{> *name}}`) |
| `compile` — blocks & parents | Default content, overrides, variable visibility, multi-block |
| `compile` — set delimiters | Custom delimiter syntax |
| `compile` — function values | No-arg function shorthand |
| `compile` — error handling | Unmatched / mismatched / unclosed tags |
| `renderCompiled` | Basic rendering, default escape, custom escape, partials |
| `render` | Template string API, lazy partial compilation |
| `renderCompiledAsync` | Async view values, multiple values, section context, partials as thunks, caching, error propagation, no unhandled rejections |
| `renderAsync` | Async values, string partials, async function partials, error propagation |
| `renderCompiledAsync` error handling | Rejection propagation for values and partials; unhandled-rejection safety |

---

## Linting / type checking

```bash
npm run lint    # runs tsc --noEmit to catch type errors without emitting files
```

---

## Architecture

The library works in two phases:

### 1. Compile (`compile`)

The template string is scanned left-to-right with a regex that matches
`{{ … }}` tags. Each tag type emits a fragment of JavaScript source code into
a string variable (`code`). At the end, `new Function(...)` turns that string
into a real function.

Key design choices:

- A **context stack** (`v: any[]`) replaces a linked-list Context object.
  `v.unshift(item)` / `v.shift()` push / pop as sections are entered/left.
- Variable resolution (`o(name)`) walks the stack with
  `v.find(x => x != null && typeof x === "object" && name in x)`, which is
  safe for primitive and null entries.
- Values are normalised through `f(x)` (calls zero-arg functions), `s(x)`
  (coerces to string, `null` → `""`), and `S(x)` (same + HTML escape).
- **Template inheritance** is implemented entirely at compile time: a
  `{{< parent}}` tag opens an inline object literal `{ block: () => { … }, … }`
  that is passed as the `blocks` argument to the parent compiled function.

### 2. Render

Synchronous render: call the compiled function with `[view]`, a partials map,
an empty blocks map, and an escape function.

Async render (`renderCompiledAsync`): wraps view values and partial loaders
in a retry loop. On each iteration, encountered async functions are started
and stored in a pending map. `Promise.all` on all pending promises is awaited
before the next iteration. The loop exits when a render pass finds no pending
work.

---

## Publishing to npm

> Only project maintainers with npm publish rights should perform this step.

1. Bump `version` in `package.json` following [SemVer](https://semver.org/).
2. Update `CHANGELOG.md` with the new version and release notes.
3. Run `npm publish --dry-run` to review the tarball contents.
4. Run `npm publish` (requires `npm login` or a configured `NPM_TOKEN`).

The `prepublishOnly` hook runs `build` + `test` automatically, so broken code
cannot be published.

The published tarball (controlled by the `files` field in `package.json`)
contains:

```
dist/index.js
dist/index.js.map
dist/index.d.ts
dist/index.d.ts.map
src/index.ts
LICENSE
README.md
```

Test artifacts (`dist/test/`) are excluded via `.npmignore`.

---

## Contributing

Pull requests are welcome! Please:

1. Fork the repository and create a feature branch.
2. Add or update tests for any changed behaviour.
3. Ensure `npm test` and `npm run lint` pass.
4. Open a pull request with a clear description of the change.

For significant changes, open an issue first to discuss the approach.
