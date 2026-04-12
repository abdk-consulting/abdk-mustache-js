# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.9] — unreleased

### Added

- **Parent tag indentation** — standalone `{{< parent}}` and `{{< *name}}`
  (dynamic parent) tags now support the same indentation behaviour as partial
  tags: the leading whitespace on the opening parent tag's line is prepended to
  every line of the rendered parent output via
  `String.replace(/^/gm, indentation)`.  Non-standalone (inline) parent tags
  are unaffected.

- **Spec-deviations section in README** — a new *Spec deviations* section
  documents the four intentional departures from the official Mustache spec
  (standalone detection rule, indentation semantics, block forwarding, and
  lambda handling), each with rationale and examples.

### Fixed

- **`inParent` not set for dynamic parents** — when a `{{< *name}}` dynamic
  parent tag was opened, the `inParent` flag was not set to `true`, so
  forbidden content (sections, variables, partial tags, nested parents) inside
  a dynamic parent body was not caught at compile time.  The flag is now set
  correctly, matching the behaviour of static parent tags.

### Changed

- **Comment tag uses a named capture group (`cmt`)** — the comment branch in
  `compileTagRegExp` now uses `!(?<cmt>[\s\S]*?)` instead of `![\s\S]*?`.
  The dispatch block explicitly tests `groups?.cmt` and falls through to the
  new `Invalid tag` error for anything that matched none of the named groups.
  No behavioural change for valid comment tags.

- **Variable regex excludes tag-sigil characters** — the variable pattern has
  been tightened from `\S+?` to `[^\s=#^/{&!>$<]\S*?`, preventing sigil
  characters from being parsed as variable names and allowing malformed tags
  to fall through to the new invalid-tag error handler.

- **Invalid tags now throw at compile time** — previously, a tag whose content
  matched none of the recognised patterns (empty tags `{{}}`, whitespace-only
  tags, sigil-only tags with no name such as `{{#}}` or `{{>}}`, and
  malformed set-delimiter tags) was silently dispatched to the comment handler
  and ignored.  Such tags now throw `Error("Invalid tag: …")` immediately at
  compile time.

---

## [1.0.8] — 2026-04-11

### Changed (refactoring, no behavioural change)

- **Tag-regexp refactored to use named capture groups** — `compileTagRegExp`
  now builds the pattern by concatenating named-group fragments for each tag
  type (`ld`/`rd` for set-delimiter, `sec`, `isec`, `esec`, `uvarb`, `uvara`,
  `dpt`, `pt`, `bl`, `dpn`, `pn`, `var`, and an unnamed comment branch) rather
  than composing a single monolithic pattern and running a secondary tag-content
  regex over every match.  Downstream code now reads capture groups by name
  (`groups?.sec`, `groups?.pt`, …) instead of by positional index.  No
  behavioural change.

- **Standalone-tag handling refactored into dedicated helpers** — the
  standalone-detection and template-advance logic that was previously inlined
  inside the main dispatch block has been extracted into four small, focused
  helpers:
  - `advance(left, right)` — emits the literal text between `index` and `left`,
    then moves `index` to `right`.
  - `inline()` — calls `advance` with the exact tag boundaries (no standalone
    treatment).
  - `checkStandalone()` — returns `null` when the tag is not standalone, or a
    `{ left, right, next }` bounds object when it is (where `next` is the
    position after the trailing newline, computed via a single regex rather than
    the previous character-by-character loop).
  - `standalone()` — advances over the full standalone line (leading whitespace
    through trailing newline) when standalone, falls back to `inline()`.
  - `indent()` — like `standalone()` but returns the leading-whitespace
    indentation string for use by partial tags, or `null` for non-standalone
    partials.

  Each tag type now calls the appropriate helper explicitly, making the
  intended standalone/inline contract of every tag type immediately visible at
  the call site.  No behavioural change.

---

## [1.0.7] — 2026-04-11

### Changed

- **Partial indentation — cleaner implementation, no synthesised newlines** —
  the indentation helper function has been replaced with
  `String.replace(/^/gm, indentation)` applied directly to the partial's
  rendered output.  The standalone tag line's own trailing newline is now taken
  from the template itself (by rewinding the template index) rather than being
  appended by the indentation logic.  Behavioural consequences:
  - A partial whose content has **no trailing newline** now ends with the
    template's `\n` (previously no trailing newline was added).
  - A **missing or empty partial** used in an indented standalone position now
    produces an indented empty line (`"  \n"`) instead of an empty string.
  - Fixed a subtle bug where the old split/join approach was prepending the
    indentation to the first character of the template content that followed
    the partial tag.

---

## [1.0.6] — 2026-04-11

### Changed

- **Partial indentation — trailing-newline behaviour** — the indentation
  function now appends `\n` to *every* indented segment (including the empty
  segment produced by a trailing newline in the partial), matching the rule
  "every line of the partial's output is indented".  As a consequence, a
  partial whose content ends with a newline will produce an indented empty line
  (`"  \n"`) at the end of its output.  Previously the segments were joined
  with `\n` (no final newline), so a trailing newline in the partial did not
  produce a trailing newline in the rendered output.

---

## [1.0.5] — 2026-04-11

### Added

- **Partial indentation** — a standalone partial tag whose line has leading
  whitespace now prepends that whitespace to every line of the included
  partial's output, per the Mustache spec.  Non-standalone (inline) partials
  are unaffected.  Applies to both static (`{{> name}}`) and dynamic
  (`{{> *name}}`) partial tags.

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

[1.0.9]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.9
[1.0.8]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.8
[1.0.7]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.7
[1.0.6]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.6
[1.0.5]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.5
[1.0.4]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.4
[1.0.2]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.2
[1.0.1]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.1
[1.0.0]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.0
