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
prepended to **every line** of the included partial's output using
`String.replace(/^/gm, indentation)`.  The standalone tag line's own trailing
newline is then taken from the **template itself** — no newline characters are
introduced that were not already present in the template or the partial.

```
Template:
  | before
  {{> item}}
  | after

Partial ("item"):  "line1\nline2"

Output:
  | before
  line1
  line2
  | after
```

Because `/^/gm` matches the position after every embedded newline (including
the one that terminates a **trailing newline** in the partial), a partial whose
content ends with `\n` produces an **indented empty line** before the
template's own newline:

| Partial content | Output of `"  {{> p}}\n"` |
|---|---|
| `"foo"` (no trailing `\n`) | `"  foo\n"` |
| `"foo\n"` (trailing `\n`) | `"  foo\n  \n"` |
| `"foo\nbar"` | `"  foo\n  bar\n"` |
| `"foo\nbar\n"` | `"  foo\n  bar\n  \n"` |
| `""` (empty / missing) | `"  \n"` |

Non-standalone (inline) partials — where the tag shares a line with other
content — are inserted as-is with no indentation.

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

## Spec deviations

This implementation intentionally differs from the
[official Mustache spec](https://github.com/mustache/spec) in four areas.
Each deviation is described below together with the rationale.

### 1. Standalone tag detection

**Spec behaviour:** The spec test suite includes cases where two tags appear on
a single line and both are still treated as standalone, but no clear general
rule is given for when a multi-tag line qualifies.

**This implementation:** A tag is standalone **if and only if it is the sole
printable element on its line** — i.e. it has only optional horizontal
whitespace to its left (up to the start of the template or a preceding newline)
and only optional horizontal whitespace to its right (up to the next newline
or end of template).  If any other non-whitespace character appears on the
same line, the tag is non-standalone, regardless of what the neighbouring
content is.

This rule is simple, predictable, and matches what the Mustache *documentation*
says.  The same criterion is applied uniformly to every tag type; individual
tag types may then handle the standalone status in their own way (e.g.
variables are always non-standalone and never consume their line).

To force a tag to be treated as non-standalone, place an empty comment next
to it — no space is required inside the comment tag, `{{!}}` is sufficient:

```
{{#section}}{{!}}
content
{{/section}}
```

### 2. Indentation

**Spec behaviour:** A standalone partial tag's leading whitespace is prepended
to every line of the partial's output.  However, the spec does not require the
template's own line terminator to be preserved when the partial is empty or
missing, producing counter-intuitive results such as:

```
One
{{>two}}
Three
```

rendering as `"One\nTwoThree"` when `two` is `"Two"` (no trailing newline).

**This implementation:** The template's newline after a standalone partial tag
always appears in the output, independent of the partial's content.  For a
standalone partial the tag's line is consumed up to (but not including) the
line terminator, and the terminator remains part of the surrounding template
text.  This means:

- A partial with no trailing newline still ends up on its own line because the
  template's newline follows it.
- A partial with a trailing newline produces an **additional indented empty
  line** before the template's own newline (the `/^/gm` replacement inserts
  the indentation prefix after every embedded newline, including the last one).
- A nullish / missing partial results in an indented empty line (just
  the indentation prefix + the template's newline), not a completely blank
  line.

| Partial content | Template `"  {{> p}}\n"` renders as |
|---|---|
| `"foo"` | `"  foo\n"` |
| `"foo\n"` | `"  foo\n  \n"` |
| `""` / missing | `"  \n"` |

The same behaviour applies to standalone parent tags (`{{< parent}}`).  For
parent tags the indentation is taken from the **opening** `{{< parent}}` tag's
position on its line; the position of the closing `{{/parent}}` tag has no
effect on indentation.

### 3. Block forwarding

**Spec behaviour:** The spec implicitly expects block overrides to be
forwarded automatically through an entire parent chain.  For example:

```
template:      {{<parent}}{{$a}}c{{/a}}{{/parent}}
parent:        {{<older}}{{$a}}p{{/a}}{{/older}}
older:         {{<grandParent}}{{$a}}o{{/a}}{{/grandParent}}
grandParent:   {{$a}}g{{/a}}
```

The spec says the output should be `"c"`, meaning the override `"c"` from the
top-level template is forwarded all the way through `parent` and `older` down
to `grandParent`, overriding `"p"` and `"o"` along the way.

**This implementation:** Blocks are **not** forwarded automatically.  Each
`{{< parent}}` call passes only the blocks explicitly overridden in its own
body.  When `parent` calls `older` and provides `{{$a}}p{{/a}}`, it passes
`"p"` — there is no mechanism by which `"c"` from an outer caller can
silently bypass `parent`'s own override.

This matches a straightforward reading of the syntax: `{{< parent}}` with
`{{$a}}p{{/a}}` inside it means "*call `parent`, passing `"p"` as block `a`*".
The outer caller's value of `a` has already been consumed to produce `"p"`.

To explicitly forward an outer block inward, use a nested block substitution
inside the override body:

```
parent:   {{<older}}{{$a}}{{$a}}p{{/a}}{{/a}}{{/older}}
```

Here the outer `{{$a}}…{{/a}}` is the block being *passed* to `older`, and
the inner `{{$a}}p{{/a}}` is a block *substitution* with default `"p"` —
so if the caller supplied a value for `a`, it replaces `"p"`.

### 4. Lambdas

**Spec behaviour:** Lambda sections pass the raw (un-rendered) template
source of the section body to the lambda function, along with a `render`
callback so the lambda can choose whether and how to re-render it.  This
requires the template source to be available at render time, which is
fundamentally incompatible with ahead-of-time compilation.

**This implementation:** Function values in the view are treated as
**zero-argument lazy getters** — they are called with no arguments and their
return value is used as the resolved property value.  This covers the most
common lambda use-case (computed / deferred properties) without sacrificing
the compiled-template performance model.  The spec's lambda section feature
(raw text + `render` callback) is not supported; this is an optional spec
feature and is noted as such in the compatibility table above.

---

## License

[MIT](LICENSE) © ABDK Consulting
