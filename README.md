# abdk-mustache-js

[![npm version](https://img.shields.io/npm/v/abdk-mustache-js.svg)](https://www.npmjs.com/package/abdk-mustache-js)
[![CI](https://github.com/abdk-consulting/abdk-mustache-js/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/abdk-consulting/abdk-mustache-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A fast, spec-compliant [Mustache](https://mustache.github.io/) template engine
for JavaScript / TypeScript that **compiles templates into native JavaScript
functions** for high-throughput rendering.

---

## Features

- **Compiled templates** — each template is compiled once to a plain JS
  function; subsequent renders are pure function calls with no parsing overhead
- **Full Mustache syntax** — variables, sections, inverted sections, comments,
  partials, dynamic partials, and set-delimiter tags
- **Template inheritance** — `{{< parent}}` / `{{$ block}}` for layout
  composition (extends the base Mustache spec)
- **Async rendering** — `renderAsync` / `renderCompiledAsync` resolve async
  and Promise-returning view values automatically, with lazy async partial
  loading
- **TypeScript-first** — full type declarations included, zero runtime
  dependencies
- **No extra dependencies** — only the Node.js built-in `node:test` runner is
  used for tests

---

## Installation

```bash
npm install abdk-mustache-js
```

---

## Usage

### Quick start

```ts
import { render } from "abdk-mustache-js";

const html = render("Hello, {{name}}!", { name: "World" });
// → "Hello, World!"
```

### Pre-compile a template

Compile once, render many times:

```ts
import { compile, renderCompiled } from "abdk-mustache-js";

const tmpl = compile("Hello, {{name}}!");

console.log(renderCompiled(tmpl, { name: "Alice" })); // Hello, Alice!
console.log(renderCompiled(tmpl, { name: "Bob" }));   // Hello, Bob!
```

### Sections

```ts
render("{{#show}}visible{{/show}}", { show: true });   // "visible"
render("{{#show}}visible{{/show}}", { show: false });  // ""
render("{{^empty}}fallback{{/empty}}", { empty: [] }); // "fallback"
```

Arrays are iterated automatically:

```ts
render(
  "{{#items}}- {{name}}\n{{/items}}",
  { items: [{ name: "One" }, { name: "Two" }] }
);
// "- One\n- Two\n"
```

### Partials

```ts
import { render } from "abdk-mustache-js";

const output = render(
  "{{> header}}Content{{> footer}}",
  { title: "Home", year: 2026 },
  {
    header: "<h1>{{title}}</h1>\n",
    footer: "<footer>{{year}}</footer>",
  }
);
```

### Template inheritance (blocks & parents)

```ts
import { compile, renderCompiled } from "abdk-mustache-js";

const layout = compile(`
<html>
  <head><title>{{$title}}Default Title{{/title}}</title></head>
  <body>{{$body}}{{/body}}</body>
</html>
`);

const page = compile(`
{{< layout}}
  {{$title}}My Page{{/title}}
  {{$body}}<p>Hello, {{name}}!</p>{{/body}}
{{/layout}}
`);

renderCompiled(page, { name: "Alice" }, { layout });
```

### Unescaped output

Use triple mustaches `{{{…}}}` or `{{& …}}` to skip HTML escaping:

```ts
render("{{{html}}}", { html: "<b>bold</b>" }); // "<b>bold</b>"
```

### Custom escape function

```ts
render("{{val}}", { val: "x" }, {}, s => s); // disable escaping entirely
```

### Async rendering

`renderAsync` and `renderCompiledAsync` resolve any view property that is an
async / Promise-returning function. Partials can also be loaded asynchronously.

```ts
import { renderAsync } from "abdk-mustache-js";

const html = await renderAsync(
  "Hello, {{name}}! You have {{count}} messages.",
  {
    name: async () => fetchUserName(),
    count: async () => fetchMessageCount(),
  }
);
```

Async partials (loaded on demand):

```ts
import { renderAsync } from "abdk-mustache-js";

const html = await renderAsync(
  "{{> header}}{{body}}",
  { body: "Content" },
  {
    // string partial — compiled eagerly
    header: "<h1>ABDK</h1>",
    // async partial — compiled lazily, result cached for subsequent iterations
    nav: async () => fetchNavTemplate(),
  }
);
```

---

## API

### `compile(template: string): CompiledTemplate`

Parses the template string and returns a compiled function. Throws a
descriptive `Error` if the template is syntactically invalid (unmatched tags,
unclosed sections, etc.).

### `renderCompiled(template, view, partials?, escape?): string`

Renders a pre-compiled template synchronously.

| Parameter | Type | Default |
|-----------|------|---------|
| `template` | `CompiledTemplate` | — |
| `view` | `any` | — |
| `partials` | `{ [name: string]: CompiledTemplate }` | `{}` |
| `escape` | `(s: string) => string` | built-in HTML escape |

### `render(template, view, partials?, escape?): string`

Compiles and renders in one call. Accepts string partials (compiled lazily on
first use per `render` call).

| Parameter | Type | Default |
|-----------|------|---------|
| `template` | `string` | — |
| `view` | `any` | — |
| `partials` | `{ [name: string]: string }` | `{}` |
| `escape` | `(s: string) => string` | built-in HTML escape |

### `renderCompiledAsync(template, view, partials?, escape?): Promise<string>`

Renders a pre-compiled template; asynchronous view property functions are
resolved automatically (re-rendering until all promises settle). Partial
loaders are called at most once per `renderCompiledAsync` call.

| Parameter | Type | Default |
|-----------|------|---------|
| `template` | `CompiledTemplate` | — |
| `view` | `any` | — |
| `partials` | `{ [name: string]: () => Promise<CompiledTemplate> }` | `{}` |
| `escape` | `(s: string) => string` | built-in HTML escape |

### `renderAsync(template, view, partials?, escape?): Promise<string>`

Convenience wrapper around `renderCompiledAsync` that accepts a template
string and string / async-function partials.

| Parameter | Type | Default |
|-----------|------|---------|
| `template` | `string` | — |
| `view` | `any` | — |
| `partials` | `{ [name: string]: string \| (() => Promise<string>) }` | `{}` |
| `escape` | `(s: string) => string` | built-in HTML escape |

### `CompiledTemplate` (type)

```ts
type CompiledTemplate = (
  view: any[],
  partials: { [name: string]: CompiledTemplate },
  blocks: { [name: string]: () => string },
  escape: (string: string) => string
) => string;
```

---

## Mustache compatibility

| Feature | Supported |
|---------|-----------|
| Variables `{{name}}` | ✓ |
| Unescaped `{{{name}}}` / `{{& name}}` | ✓ |
| Sections `{{#name}}…{{/name}}` | ✓ |
| Inverted sections `{{^name}}…{{/name}}` | ✓ |
| Comments `{{! … }}` | ✓ |
| Partials `{{> name}}` | ✓ |
| Dynamic partials `{{> *name}}` | ✓ |
| Set delimiters `{{= <% %> =}}` | ✓ |
| Template inheritance `{{< parent}}` / `{{$ block}}` | ✓ (extension) |
| Lambda sections (raw text + render callback) | ✗ (optional spec feature) |
| Standalone tag whitespace stripping | ✗ |
| Partial indentation | ✗ |

---

## License

[MIT](LICENSE) © ABDK Consulting
