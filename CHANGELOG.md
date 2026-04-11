# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.4] — 2026-04-11

### Added

- **Standalone tag whitespace stripping** — section, inverted-section, comment,
  set-delimiter, partial, block, and parent tags that appear alone on a line
  (with only optional leading whitespace) now consume the entire line, including
  leading whitespace and trailing newline (`\n` or `\r\n`), per the Mustache
  spec.  Variable tags are never treated as standalone.
- **Permissive whitespace inside tags** — spaces are now permitted before and
  after any tag sigil and around the tag name: `{{ # section }}`,
  `{{> partial }}`, `{{ = [ ] = }}`, etc.  Applies uniformly to all tag types.
- **Function-based partial loader** — all four public functions
  (`render`, `renderCompiled`, `renderAsync`, `renderCompiledAsync`) now accept
  either a plain partial object *or* a single loader function
  `(name) => template | null` (async for the async variants) in place of the
  `partials` argument.  The loader is called at most once per partial name per
  render call.
- **Stricter parent-body validation** — inside a `{{< parent}}` body, sections,
  variables, partials, and nested parents now raise a compile-time error instead
  of being silently ignored.  Plain text and comments are still silently
  discarded; block overrides (`{{$ block}}`) and set-delimiter tags are
  processed normally.

---

## [1.0.3] — 2026-04-11

### Fixed

- `renderCompiledAsync` / `renderAsync`: `wrapView` was calling async view
  functions **eagerly** at wrap time and returning `null` directly to
  Mustache.js instead of returning a callable wrapper function.  As a result,
  every async function in the view was always rendered as an empty string,
  regardless of its resolved value, and every async function — including unused
  ones — was invoked unconditionally.  `wrapView` now returns a proper wrapper
  function registered in `wrappedValues`; the underlying async function is only
  called when Mustache.js actually invokes it during rendering.

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
