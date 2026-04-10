# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.2] — 2026-04-11

### Fixed

- `renderCompiledAsync` / `renderAsync`: `wrapView` now tracks already-wrapped
  objects and arrays via a `wrappedValues` map, preventing infinite recursion
  when the view contains circular references.
- `renderCompiledAsync` / `renderAsync`: `pendingValues` and `wrappedValues`
  maps are now cleared after each render iteration, preventing stale cached
  function results from carrying over into subsequent passes.

---

## [1.0.1] — 2026-04-11

### Fixed

- `renderCompiledAsync` / `renderAsync`: async view functions that resolve to
  an object whose properties are themselves async functions were not resolved
  correctly — the inner functions were returned as raw `Promise` objects instead
  of being awaited. Resolved values are now recursively wrapped so nested async
  properties are discovered and awaited in subsequent render iterations.

---

## [1.0.0] — 2026-04-11

### Added

- `compile(template)` — compiles a Mustache template string to a native JS
  function
- `renderCompiled(template, view, partials?, escape?)` — renders a
  pre-compiled template synchronously
- `render(template, view, partials?, escape?)` — compiles and renders in one
  call; string partials compiled lazily
- `renderCompiledAsync(template, view, partials?, escape?)` — async render
  with automatic resolution of Promise-returning view functions and async
  partial loaders
- `renderAsync(template, view, partials?, escape?)` — async convenience
  wrapper accepting template strings and `string | (() => Promise<string>)`
  partials
- Full Mustache syntax: variables, escaped / unescaped, sections, inverted
  sections, comments, partials, dynamic partials, set-delimiter tags
- Template inheritance extension: `{{< parent}}` / `{{$ block}}`
- Built-in HTML escape function; custom escape function supported on all APIs
- Zero runtime dependencies
- TypeScript declarations included

[1.0.2]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.2
[1.0.1]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.1
[1.0.0]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.0
