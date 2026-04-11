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
- **Standalone tag whitespace stripping** — section, comment, partial,
  set-delimiter, and inheritance tags on their own line consume that whole line
  (leading whitespace + trailing newline), per spec
- **Template inheritance** — `{{< parent}}` / `{{$ block}}` for layout
  composition (extends the base Mustache spec)
- **Permissive tag whitespace** — spaces are allowed before and after any tag
  sigil: `{{ # name }}`, `{{> partial }}`, `{{ = [ ] = }}`, etc.
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

#### What is allowed inside a parent body (`{{< parent}} … {{/parent}}`)

The spec says everything except block overrides should be silently ignored
inside a parent. This implementation is deliberately stricter on errors but
also more useful:

| Content | Behaviour |
|---------|-----------|
| Plain text | Silently ignored |
| Comments `{{! … }}` | Silently ignored |
| Block overrides `{{$ block }} … {{/block}}` | Processed normally — overrides the named block in the parent template |
| Set-delimiter tags `{{= … =}}` | **Processed** — delimiter change takes effect for the rest of the parent body, allowing different delimiters for different block overrides |
| Sections `{{#}}` / `{{^}}` | **Compile-time error** — hiding structural tags would conceal bugs |
| Variables `{{name}}` / `{{{name}}}` / `{{& name}}` | **Compile-time error** |
| Partials `{{> …}}` / `{{> *…}}` | **Compile-time error** |
| Nested parents `{{< …}}` | **Compile-time error** |

Example — changing delimiters mid-parent to override two blocks with
different delimiter styles:

```ts
const parent = compile("{{$a}}A{{/a}} {{$b}}B{{/b}}");
const child  = compile("{{< parent}}{{=[ ]=}}[$a]X[/a][={{ }}=]{{$b}}Y{{/b}}{{/parent}}");
renderCompiled(child, {}, { parent }); // "X Y"
```

### Standalone tags

Tags that appear alone on a line (with only optional leading whitespace) are
treated as **standalone**: the entire line, including the leading whitespace
and the trailing newline (`\n` or `\r\n`), is removed from the output. This
applies to section, inverted-section, comment, set-delimiter, partial, block,
and parent tags. Variable tags are never standalone.

```
Template:
  | before
  {{#show}}
  | inside
  {{/show}}
  | after

Output (show = true):
  | before
  | inside
  | after
```

When a standalone partial tag has leading whitespace, that whitespace is
prepended to **every line** of the included partial's output, per the Mustache
spec:

```
Template:
  | before
  {{> item}}
  | after

Partial ("item"):
line1
line2

Output:
  | before
  line1
  line2
  | after
```

A partial that ends without a trailing newline has its last fragment indented
but no newline is added. Non-standalone (inline) partials — where the tag
shares a line with other content — are inserted as-is with no indentation.

### Whitespace inside tags

Spaces are permitted before and after any tag sigil, and around any tag name.
All three positions are equivalent:

```
{{ name }}        — spaces around name
{{# section }}    — space after sigil
{{ # section }}   — space before and after sigil
{{> * dynamic }}  — spaces around * in dynamic partial
{{ = [ ] = }}     — spaces around = in set-delimiter
```

This applies uniformly to all tag types: variables, sections, inverted
sections, comments, partials, dynamic partials, blocks, parents, and
set-delimiter tags.

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

Async partials (loaded on demand via a loader function):

```ts
import { renderAsync } from "abdk-mustache-js";

const html = await renderAsync(
  "{{> header}}{{body}}",
  { body: "Content" },
  // loader function — called once per partial name, result cached
  async (name) => fetchTemplate(name)
);
```

Or pass a plain object of pre-compiled string partials:

```ts
const html = await renderAsync(
  "{{> header}}{{body}}",
  { body: "Content" },
  { header: "<h1>ABDK</h1>" }
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
| `partials` | `{ [name: string]: CompiledTemplate }` \| `(name: string) => CompiledTemplate \| null` | `{}` |
| `escape` | `(s: string) => string` | built-in HTML escape |

### `render(template, view, partials?, escape?): string`

Compiles and renders in one call. Accepts string partials (compiled lazily on
first use per `render` call).

| Parameter | Type | Default |
|-----------|------|---------|
| `template` | `string` | — |
| `view` | `any` | — |
| `partials` | `{ [name: string]: string }` \| `(name: string) => string \| null` | `{}` |
| `escape` | `(s: string) => string` | built-in HTML escape |

### `renderCompiledAsync(template, view, partials?, escape?): Promise<string>`

Renders a pre-compiled template; asynchronous view property functions are
resolved automatically (re-rendering until all promises settle). When a loader
function is supplied, it is called at most once per partial name per
`renderCompiledAsync` call.

| Parameter | Type | Default |
|-----------|------|---------||
| `template` | `CompiledTemplate` | — |
| `view` | `any` | — |
| `partials` | `{ [name: string]: CompiledTemplate }` \| `(name: string) => Promise<CompiledTemplate \| null>` | `{}` |
| `escape` | `(s: string) => string` | built-in HTML escape |

### `renderAsync(template, view, partials?, escape?): Promise<string>`

Convenience wrapper around `renderCompiledAsync` that accepts a template
string and string partials or an async loader function.

| Parameter | Type | Default |
|-----------|------|---------||
| `template` | `string` | — |
| `view` | `any` | — |
| `partials` | `{ [name: string]: string }` \| `(name: string) => Promise<string \| null>` | `{}` |
| `escape` | `(s: string) => string` | built-in HTML escape |

### `CompiledTemplate` (type)

```ts
type CompiledTemplate = (
  view: any[],
  partials: { [name: string]: CompiledTemplate }
    | ((name: string) => CompiledTemplate | null),
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
| Standalone tag whitespace stripping | ✓ |
| Whitespace before/after any tag sigil | ✓ (extension) |
| Lambda sections (raw text + render callback) | ✗ (optional spec feature) |
| Partial indentation (standalone partial prepends indent) | ✓ |

---

## License

[MIT](LICENSE) © ABDK Consulting
