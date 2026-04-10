# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/abdk-consulting/abdk-mustache-js/releases/tag/v1.0.0
