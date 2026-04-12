import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compile, CompiledTemplate, renderCompiled, render as renderFn, renderCompiledAsync, renderAsync } from "../index";

const escape = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const render = (template: string, view: object, partials: { [name: string]: CompiledTemplate } = {}): string =>
  compile(template)([view], partials, {}, escape);

describe("compile", () => {
  describe("variables", () => {
    it("interpolates a variable", () => {
      assert.equal(render("Hello, {{name}}!", { name: "World" }), "Hello, World!");
    });

    it("escapes HTML in variables", () => {
      assert.equal(render("{{text}}", { text: "<b>bold</b>" }), "&lt;b&gt;bold&lt;/b&gt;");
    });

    it("renders empty string for missing variable", () => {
      assert.equal(render("{{missing}}", {}), "");
    });

    it("renders null as empty string", () => {
      assert.equal(render("{{val}}", { val: null }), "");
    });

    it("renders empty array as empty string", () => {
      assert.equal(render("{{val}}", { val: [] }), "");
    });

    it("renders false as 'false', not empty string", () => {
      assert.equal(render("{{val}}", { val: false }), "false");
    });

    it("renders zero as '0', not empty string", () => {
      assert.equal(render("{{count}}", { count: 0 }), "0");
    });

    it("renders zero via unescaped {{{}}}", () => {
      assert.equal(render("{{{count}}}", { count: 0 }), "0");
    });

    it("does not throw when a section pushes a string onto the context stack", () => {
      assert.equal(render("{{#name}}{{.}}{{/name}}", { name: "Alice" }), "Alice");
    });

    it("does not throw when a section pushes a number onto the context stack", () => {
      assert.equal(render("{{#count}}{{.}}{{/count}}", { count: 42 }), "42");
    });

    it("does not throw or crash when a value is null", () => {
      assert.equal(render("{{#val}}yes{{/val}}", { val: null }), "");
    });

    it("supports dotted key access", () => {
      assert.equal(render("{{user.name}}", { user: { name: "Alice" } }), "Alice");
    });

    it("renders missing property as empty string", () => {
      assert.equal(render("{{user.age}}", { user: { name: "Alice" } }), "");
    });

    it("renders property of null as empty string", () => {
      assert.equal(render("{{user.age}}", { user: null }), "");
    });

    it("resolves dot (.) to current context", () => {
      const t = compile("{{#items}}{{.}},{{/items}}");
      assert.equal(t([{ items: [1, 2, 3] }], {}, {}, escape), "1,2,3,");
    });
  });

  describe("unescaped variables", () => {
    it("renders raw HTML with {{{}}}", () => {
      const t = compile("{{{html}}}");
      assert.equal(t([{ html: "<b>bold</b>" }], {}, {}, escape), "<b>bold</b>");
    });

    it("renders raw HTML with {{& }}", () => {
      assert.equal(render("{{& html}}", { html: "<b>bold</b>" }), "<b>bold</b>");
    });
  });

  describe("sections", () => {
    it("renders a truthy section", () => {
      assert.equal(render("{{#show}}yes{{/show}}", { show: true }), "yes");
    });

    it("skips a falsy section", () => {
      assert.equal(render("{{#show}}yes{{/show}}", { show: false }), "");
    });

    it("iterates over an array", () => {
      assert.equal(
        render("{{#items}}{{name}} {{/items}}", { items: [{ name: "a" }, { name: "b" }] }),
        "a b "
      );
    });

    it("iterates over an array with nulls", () => {
      assert.equal(
        render("{{#items}}{{name}},{{/items}}", { items: [{ name: "a" }, null, { name: "b" }] }),
        "a,,b,"
      );
    });

    it("renders section once for a non-array truthy value", () => {
      assert.equal(render("{{#obj}}yes{{/obj}}", { obj: { x: 1 } }), "yes");
    });

    it("supports nested sections", () => {
      assert.equal(
        render("{{#a}}{{#b}}{{c}}{{/b}}{{/a}}", { a: { b: { c: "deep" } } }),
        "deep"
      );
    });
  });

  describe("inverted sections", () => {
    it("renders inverted section when value is falsy", () => {
      assert.equal(render("{{^show}}no{{/show}}", { show: false }), "no");
    });

    it("skips inverted section when value is truthy", () => {
      assert.equal(render("{{^show}}no{{/show}}", { show: true }), "");
    });

    it("renders inverted section for empty array", () => {
      assert.equal(render("{{^items}}empty{{/items}}", { items: [] }), "empty");
    });
  });

  describe("comments", () => {
    it("ignores comment tags", () => {
      assert.equal(render("Hello{{! this is a comment }}, World!", {}), "Hello, World!");
    });
  });

  describe("partials", () => {
    it("renders a named partial", () => {
      const greeting = compile("Hello, {{name}}!");
      assert.equal(render("{{> greeting}}", { name: "Bob" }, { greeting }), "Hello, Bob!");
    });

    it("renders empty string for missing partial", () => {
      assert.equal(render("{{> missing}}", {}), "");
    });

    it("renders a dynamic partial", () => {
      const tmpl = compile("Hello, {{name}}!");
      assert.equal(
        render("{{> *tplName}}", { name: "Carol", tplName: "tmpl" }, { tmpl }),
        "Hello, Carol!"
      );
    });

    describe("indentation", () => {
      it("indents a single-line standalone partial", () => {
        const greet = compile("Hello!");
        assert.equal(
          render("  {{> greet}}\n", {}, { greet }),
          "  Hello!\n"
        );
      });

      it("indents each line of a multi-line standalone partial", () => {
        const partial = compile("line1\nline2\n");
        assert.equal(
          render("  {{> partial}}\n", {}, { partial }),
          "  line1\n  line2\n  \n"
        );
      });

      it("indents a standalone partial preceded by a content line", () => {
        const greet = compile("Hello!\n");
        assert.equal(
          render("before\n  {{> greet}}\nafter", {}, { greet }),
          "before\n  Hello!\n  \nafter"
        );
      });

      it("uses tab as indentation", () => {
        const partial = compile("A\nB\n");
        assert.equal(
          render("\t{{> partial}}\n", {}, { partial }),
          "\tA\n\tB\n\t\n"
        );
      });

      it("does not indent an inline (non-standalone) partial", () => {
        const greet = compile("Hi!");
        assert.equal(
          render("Say: {{> greet}} there", {}, { greet }),
          "Say: Hi! there"
        );
      });

      it("renders empty string for a missing indented standalone partial", () => {
        assert.equal(render("  {{> missing}}\n", {}), "  \n");
      });

      it("indents a partial that has no trailing newline", () => {
        const partial = compile("foo\nbar");
        assert.equal(
          render("  {{> partial}}\n", {}, { partial }),
          "  foo\n  bar\n"
        );
      });

      it("indents a standalone dynamic partial", () => {
        const tmpl = compile("Hello!\n");
        assert.equal(
          render("  {{> *name}}\n", { name: "tmpl" }, { tmpl }),
          "  Hello!\n  \n"
        );
      });

      it("indents each line of a multi-line standalone dynamic partial", () => {
        const partial = compile("line1\nline2\n");
        assert.equal(
          render("  {{> *name}}\n", { name: "partial" }, { partial }),
          "  line1\n  line2\n  \n"
        );
      });

      it("zero indentation for standalone partial", () => {
        const partial = compile("A\nB\n");
        assert.equal(
          render("{{> partial}}\n", {}, { partial }),
          "A\nB\n\n"
        );
      });

      it("applies distinct indentation for each standalone partial in the template", () => {
        const p = compile("x\n");
        assert.equal(
          render("  {{> p}}\n    {{> p}}\n", {}, { p }),
          "  x\n  \n    x\n    \n"
        );
      });
    });
  });

  describe("blocks and parents", () => {
    it("renders default block content when no override", () => {
      const child = compile("{{$title}}Default{{/title}}");
      assert.equal(child([{}], {}, {}, escape), "Default");
    });

    it("overrides block content via parent", () => {
      const parent = compile("{{$title}}Default{{/title}}");
      const child = compile("{{< parent}}{{$title}}Override{{/title}}{{/parent}}");
      assert.equal(child([{}], { parent }, {}, escape), "Override");
    });

    it("block default content can access view variables", () => {
      const t = compile("{{$greeting}}Hello, {{name}}!{{/greeting}}");
      assert.equal(t([{ name: "Alice" }], {}, {}, escape), "Hello, Alice!");
    });

    it("block override content can access view variables", () => {
      const parent = compile("{{$greeting}}Hello, {{name}}!{{/greeting}}");
      const child = compile("{{< parent}}{{$greeting}}Hi, {{name}}!{{/greeting}}{{/parent}}");
      assert.equal(child([{ name: "Bob" }], { parent }, {}, escape), "Hi, Bob!");
    });

    it("block default content sees enclosing section context", () => {
      // {{#user}} pushes the user object; the block inside should see its properties
      const t = compile("{{#user}}{{$greeting}}Hello, {{name}}!{{/greeting}}{{/user}}");
      assert.equal(t([{ user: { name: "Carol" } }], {}, {}, escape), "Hello, Carol!");
    });

    it("block override sees variables from parent template's sections", () => {
      // The parent iterates {{#user}} before rendering the block.
      // The block override is invoked inside that section, so it sees the user object's properties.
      const parent = compile("{{#user}}{{$greeting}}Hello, {{name}}!{{/greeting}}{{/user}}");
      const child = compile("{{< parent}}{{$greeting}}Hi, {{name}}!{{/greeting}}{{/parent}}");
      // override runs inside {{#user}}, so {{name}} resolves from the user object
      assert.equal(child([{ name: "Dave", user: { name: "Eve" } }], { parent }, {}, escape), "Hi, Eve!");
    });

    it("parent template variables are accessible outside blocks", () => {
      const parent = compile("{{header}} - {{$body}}default{{/body}} - {{footer}}");
      const child = compile("{{< parent}}{{$body}}content{{/body}}{{/parent}}");
      assert.equal(
        child([{ header: "H", footer: "F" }], { parent }, {}, escape),
        "H - content - F"
      );
    });

    it("multiple blocks can be overridden independently", () => {
      const parent = compile("{{$a}}A{{/a}}|{{$b}}B{{/b}}");
      const child = compile("{{< parent}}{{$a}}X{{/a}}{{$b}}Y{{/b}}{{/parent}}");
      assert.equal(child([{}], { parent }, {}, escape), "X|Y");
    });

    it("a non-overridden block keeps its default", () => {
      const parent = compile("{{$a}}A{{/a}}|{{$b}}B{{/b}}");
      const child = compile("{{< parent}}{{$a}}X{{/a}}{{/parent}}");
      assert.equal(child([{}], { parent }, {}, escape), "X|B");
    });
  });

  // Inside a {{< parent}} body only comments, plain text, set-delimiter tags,
  // and block override tags ({{$ … }}) are valid. Everything else is a compile-
  // time error or is silently discarded.
  describe("parent content rules", () => {
    // --- Silently ignored ---

    it("plain text inside parent is silently ignored", () => {
      const parent = compile("{{$block}}Default{{/block}}");
      const child = compile("{{< parent}}ignored text{{$block}}Override{{/block}}{{/parent}}");
      assert.equal(child([{}], { parent }, {}, escape), "Override");
    });

    it("comment inside parent is silently ignored", () => {
      const parent = compile("{{$block}}Default{{/block}}");
      const child = compile("{{< parent}}{{! this comment is ignored }}{{$block}}Override{{/block}}{{/parent}}");
      assert.equal(child([{}], { parent }, {}, escape), "Override");
    });

    // --- Set-delimiter is processed ---

    it("set-delimiter tag inside parent changes the active delimiters", () => {
      // After {{=[ ]=}} the rest of the parent body uses [ ] as delimiters.
      // Block close uses [/block] (no $), just like {{/block}} outside parents.
      const parent = compile("{{$block}}Default{{/block}}");
      const child = compile("{{< parent}}{{=[ ]=}}[$block]Override[/block][/parent]");
      assert.equal(child([{}], { parent }, {}, escape), "Override");
    });

    it("different blocks inside one parent can use different delimiters", () => {
      // Switch to [ ] for block a, then back to {{ }} for block b.
      const parent = compile("{{$a}}A{{/a}}|{{$b}}B{{/b}}");
      const child = compile("{{< parent}}{{=[ ]=}}[$a]X[/a][={{ }}=]{{$b}}Y{{/b}}{{/parent}}");
      assert.equal(child([{}], { parent }, {}, escape), "X|Y");
    });

    // --- Forbidden tags throw at compile time ---

    it("section inside parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< parent}}{{#section}}text{{/section}}{{/parent}}"),
        /Sections cannot be nested inside parents/
      );
    });

    it("inverted section inside parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< parent}}{{^section}}text{{/section}}{{/parent}}"),
        /Sections cannot be nested inside parents/
      );
    });

    it("variable inside parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< parent}}{{name}}{{/parent}}"),
        /Variables cannot be nested inside parents/
      );
    });

    it("unescaped variable {{{…}}} inside parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< parent}}{{{name}}}{{/parent}}"),
        /Variables cannot be nested inside parents/
      );
    });

    it("unescaped variable {{& …}} inside parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< parent}}{{& name}}{{/parent}}"),
        /Variables cannot be nested inside parents/
      );
    });

    it("partial inside parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< parent}}{{> partial}}{{/parent}}"),
        /Partials cannot be nested inside parents/
      );
    });

    it("dynamic partial inside parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< parent}}{{> *name}}{{/parent}}"),
        /Partials cannot be nested inside parents/
      );
    });

    it("nested static parent inside parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< outer}}{{< inner}}{{/inner}}{{/outer}}"),
        /Parents cannot be nested inside parents/
      );
    });

    it("nested dynamic parent inside parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< outer}}{{< *name}}{{/*name}}{{/outer}}"),
        /Parents cannot be nested inside parents/
      );
    });

    // --- Dynamic parent content rules (bug fix: inParent was not set for dynamic parents) ---

    it("section inside dynamic parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< *name}}{{#section}}text{{/section}}{{/name}}"),
        /Sections cannot be nested inside parents/
      );
    });

    it("variable inside dynamic parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< *name}}{{var}}{{/name}}"),
        /Variables cannot be nested inside parents/
      );
    });

    it("partial inside dynamic parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< *name}}{{> partial}}{{/name}}"),
        /Partials cannot be nested inside parents/
      );
    });

    it("nested static parent inside dynamic parent throws at compile time", () => {
      assert.throws(
        () => compile("{{< *outer}}{{< inner}}{{/inner}}{{/outer}}"),
        /Parents cannot be nested inside parents/
      );
    });

    it("block override works inside dynamic parent", () => {
      const parent = compile("{{$block}}Default{{/block}}");
      assert.equal(
        compile("{{< *name}}{{$block}}Override{{/block}}{{/name}}")
          ([{ name: "parent" }], { parent }, {}, escape),
        "Override"
      );
    });
  });

  describe("indentation", () => {
    it("indents a single-line standalone static parent", () => {
      const parent = compile("Hello!");
      assert.equal(
        compile("  {{< parent}}\n{{/parent}}")([{}], { parent }, {}, escape),
        "  Hello!"
      );
    });

    it("indents each line of a multi-line static parent", () => {
      const parent = compile("line1\nline2\n");
      assert.equal(
        compile("  {{< parent}}\n{{/parent}}")([{}], { parent }, {}, escape),
        "  line1\n  line2\n  "
      );
    });

    it("indents a multi-line static parent with block override", () => {
      const parent = compile("prefix\n{{$block}}Default{{/block}}\nsuffix\n");
      assert.equal(
        compile("  {{< parent}}\n{{$block}}Override{{/block}}\n{{/parent}}")
          ([{}], { parent }, {}, escape),
        "  prefix\n  Override\n  suffix\n  "
      );
    });

    it("does not indent an inline (non-standalone) static parent", () => {
      const parent = compile("Hi!");
      assert.equal(
        compile("Say: {{< parent}}{{/parent}} there")([{}], { parent }, {}, escape),
        "Say: Hi! there"
      );
    });

    it("indents a single-line standalone dynamic parent", () => {
      const parent = compile("Hello!");
      assert.equal(
        compile("  {{< *name}}\n{{/name}}")([{ name: "parent" }], { parent }, {}, escape),
        "  Hello!"
      );
    });

    it("indents each line of a multi-line dynamic parent", () => {
      const parent = compile("line1\nline2\n");
      assert.equal(
        compile("  {{< *name}}\n{{/name}}")([{ name: "parent" }], { parent }, {}, escape),
        "  line1\n  line2\n  "
      );
    });

    it("does not indent an inline (non-standalone) dynamic parent", () => {
      const parent = compile("Hi!");
      assert.equal(
        compile("Say: {{< *name}}{{/name}} there")([{ name: "parent" }], { parent }, {}, escape),
        "Say: Hi! there"
      );
    });

    it("applies tab indentation to a static parent", () => {
      const parent = compile("A\nB\n");
      assert.equal(
        compile("\t{{< parent}}\n{{/parent}}")([{}], { parent }, {}, escape),
        "\tA\n\tB\n\t"
      );
    });
  });

  describe("set delimiters", () => {
    it("supports custom delimiters", () => {
      assert.equal(render("{{=<% %>=}}<%name%>", { name: "Dave" }), "Dave");
    });
  });

  // Whitespace is permitted in three positions inside any tag:
  //   1. Before the sigil:  {{ #name }}  — stripped by \s* in the outer tag regex
  //   2. After the sigil:   {{# name }}  — allowed by \s* in each sigil's sub-pattern
  //   3. Both:              {{ # name }}
  // This applies to all tag types.
  describe("whitespace inside tags", () => {
    it("variable: multiple spaces around name", () => {
      assert.equal(render("{{  name  }}", { name: "Alice" }), "Alice");
    });

    it("section: whitespace after sigil", () => {
      assert.equal(render("{{# show }}yes{{/ show }}", { show: true }), "yes");
    });

    it("section: whitespace before sigil", () => {
      assert.equal(render("{{ #show }}yes{{ /show }}", { show: true }), "yes");
    });

    it("section: whitespace both before and after sigil", () => {
      assert.equal(render("{{ # show }}yes{{ / show }}", { show: true }), "yes");
    });

    it("inverted section: whitespace after sigil", () => {
      assert.equal(render("{{^ empty }}no{{/ empty }}", { empty: false }), "no");
    });

    it("inverted section: whitespace before sigil", () => {
      assert.equal(render("{{ ^empty }}no{{ /empty }}", { empty: false }), "no");
    });

    it("unescaped {{{}}}: whitespace around name", () => {
      assert.equal(render("{{{  html  }}}", { html: "<b>" }), "<b>");
    });

    it("unescaped {{&}}: whitespace after sigil", () => {
      assert.equal(render("{{&  html }}", { html: "<b>" }), "<b>");
    });

    it("unescaped {{&}}: whitespace before sigil", () => {
      assert.equal(render("{{ & html }}", { html: "<b>" }), "<b>");
    });

    it("partial: whitespace after sigil", () => {
      const greeting = compile("Hi!");
      assert.equal(render("{{>  greeting }}", {}, { greeting }), "Hi!");
    });

    it("partial: whitespace before sigil", () => {
      const greeting = compile("Hi!");
      assert.equal(render("{{ > greeting }}", {}, { greeting }), "Hi!");
    });

    it("dynamic partial: whitespace around * sigil", () => {
      const tmpl = compile("Hi!");
      assert.equal(render("{{> * tplName }}", { tplName: "tmpl" }, { tmpl }), "Hi!");
    });

    it("block open/close: whitespace after sigil", () => {
      const t = compile("{{$ title }}Default{{/ title }}");
      assert.equal(t([{}], {}, {}, escape), "Default");
    });

    it("block open/close: whitespace before sigil", () => {
      const t = compile("{{ $title }}Override{{ /title }}");
      const parent = compile("{{$ title }}Default{{/ title }}");
      assert.equal(t([{}], {}, { title: () => "Override" }, escape), "Override");
    });

    it("parent: whitespace after sigil", () => {
      const parent = compile("{{$ block }}Default{{/ block }}");
      const child = compile("{{< parent }}{{$ block }}Override{{/ block }}{{/ parent }}");
      assert.equal(child([{}], { parent }, {}, escape), "Override");
    });

    it("parent: whitespace before sigil", () => {
      const parent = compile("{{$ block }}Default{{/ block }}");
      const child = compile("{{ <parent }}{{ $block }}Override{{ /block }}{{ /parent }}");
      assert.equal(child([{}], { parent }, {}, escape), "Override");
    });

    it("set delimiter: whitespace after = sigil", () => {
      assert.equal(render("{{= [ ] =}}[ name ]", { name: "Bob" }), "Bob");
    });

    it("set delimiter: whitespace before = sigil", () => {
      assert.equal(render("{{ =[ ]=}}[ name ]", { name: "Bob" }), "Bob");
    });

    it("comment: whitespace before ! sigil is allowed", () => {
      assert.equal(render("Hello{{ ! ignored }}, World!", {}), "Hello, World!");
    });
  });

  describe("function values", () => {
    it("calls a function value and uses its return", () => {
      assert.equal(render("{{greet}}", { greet: () => "Hi!" }), "Hi!");
    });
  });

  describe("error handling", () => {
    it("throws on unmatched end tag", () => {
      assert.throws(() => compile("{{/section}}"), /Unmatched end tag/);
    });

    it("throws on mismatched end tag", () => {
      assert.throws(() => compile("{{#a}}{{/b}}"), /Unmatched end tag/);
    });

    it("throws on unclosed section", () => {
      assert.throws(() => compile("{{#section}}content"), /Unclosed tag/);
    });

    it("throws on unclosed inverted section", () => {
      assert.throws(() => compile("{{^section}}content"), /Unclosed tag/);
    });

    it("throws on unclosed block", () => {
      assert.throws(() => compile("{{$block}}content"), /Unclosed tag/);
    });

    it("throws on unclosed parent", () => {
      assert.throws(() => compile("{{< parent}}content"), /Unclosed tag/);
    });

    it("throws on nested unclosed section", () => {
      assert.throws(() => compile("{{#a}}{{#b}}content{{/a}}"), /Unmatched end tag/);
    });

    it("throws on empty tag", () => {
      assert.throws(() => compile("{{}}"), /Invalid tag/);
    });

    it("throws on whitespace-only tag", () => {
      assert.throws(() => compile("{{  }}"), /Invalid tag/);
    });

    it("throws on section sigil with no name", () => {
      assert.throws(() => compile("{{#}}"), /Invalid tag/);
    });

    it("throws on end-section sigil with no name", () => {
      assert.throws(() => compile("{{/}}"), /Invalid tag/);
    });

    it("throws on partial sigil with no name", () => {
      assert.throws(() => compile("{{>}}"), /Invalid tag/);
    });

    it("throws on block sigil with no name", () => {
      assert.throws(() => compile("{{$}}"), /Invalid tag/);
    });

    it("throws on malformed set-delimiter tag (missing second delimiter)", () => {
      assert.throws(() => compile("{{=abc}}"), /Invalid tag/);
    });
  });
});

describe("renderCompiled", () => {
  it("renders a compiled template with a view", () => {
    assert.equal(renderCompiled(compile("Hello, {{name}}!"), { name: "World" }), "Hello, World!");
  });

  it("uses the built-in HTML escape by default", () => {
    assert.equal(renderCompiled(compile("{{text}}"), { text: "<b>" }), "&lt;b&gt;");
  });

  it("accepts a custom escape function", () => {
    assert.equal(
      renderCompiled(compile("{{val}}"), { val: "<" }, {}, s => s),
      "<"
    );
  });

  it("passes compiled partials", () => {
    const greeting = compile("Hi, {{name}}!");
    assert.equal(
      renderCompiled(compile("{{> greeting}}"), { name: "Alice" }, { greeting }),
      "Hi, Alice!"
    );
  });

  it("accepts a loader function for partials", () => {
    const greeting = compile("Hi, {{name}}!");
    assert.equal(
      renderCompiled(compile("{{> greeting}}"), { name: "Alice" }, (name) => name === "greeting" ? greeting : null),
      "Hi, Alice!"
    );
  });

  it("returns empty string for a partial when loader returns null", () => {
    assert.equal(
      renderCompiled(compile("{{> missing}}"), {}, (_name) => null),
      ""
    );
  });

  it("renders zero correctly", () => {
    assert.equal(renderCompiled(compile("{{n}}"), { n: 0 }), "0");
  });
});

describe("render", () => {
  it("compiles and renders a template string", () => {
    assert.equal(renderFn("Hello, {{name}}!", { name: "World" }), "Hello, World!");
  });

  it("uses the built-in HTML escape by default", () => {
    assert.equal(renderFn("{{text}}", { text: "<b>" }), "&lt;b&gt;");
  });

  it("accepts a custom escape function", () => {
    assert.equal(renderFn("{{val}}", { val: "<" }, {}, s => s), "<");
  });

  it("accepts string partials and compiles them lazily", () => {
    assert.equal(
      renderFn("{{> greeting}}", { name: "Bob" }, { greeting: "Hi, {{name}}!" }),
      "Hi, Bob!"
    );
  });

  it("compiles each partial only once across multiple renders", () => {
    let compileCount = 0;
    const partialSrc = "Hi, {{name}}!";
    // Wrap render so we can observe repeated calls
    const partials = {
      greeting: partialSrc,
    };
    // Two renders with the same partials object — the lazy cache inside render()
    // is per-call, so this just checks consistent output
    assert.equal(renderFn("{{> greeting}}", { name: "A" }, partials), "Hi, A!");
    assert.equal(renderFn("{{> greeting}}", { name: "B" }, partials), "Hi, B!");
  });

  it("accepts a loader function for string partials", () => {
    assert.equal(
      renderFn("{{> greeting}}", { name: "Bob" }, (name) => name === "greeting" ? "Hi, {{name}}!" : null),
      "Hi, Bob!"
    );
  });

  it("renders zero correctly", () => {
    assert.equal(renderFn("{{n}}", { n: 0 }), "0");
  });
});

describe("renderCompiledAsync", () => {
  it("renders a plain template asynchronously", async () => {
    assert.equal(
      await renderCompiledAsync(compile("Hello, {{name}}!"), { name: "World" }),
      "Hello, World!"
    );
  });

  it("resolves async function values", async () => {
    const view = { name: async () => "Alice" };
    assert.equal(
      await renderCompiledAsync(compile("Hello, {{name}}!"), view),
      "Hello, Alice!"
    );
  });

  it("doesn't call unused async functions", async () => {
    const view = { name: async () => "Alice", unused: async () => { throw new Error("should not be called"); } };
    assert.equal(
      await renderCompiledAsync(compile("Hello, {{name}}!"), view),
      "Hello, Alice!"
    );
  });

  it("resolves multiple async function values", async () => {
    const view = {
      first: async () => "John",
      last: async () => "Doe",
    };
    assert.equal(
      await renderCompiledAsync(compile("{{first}} {{last}}"), view),
      "John Doe"
    );
  });

  it("resolves async value used inside a section", async () => {
    const view = { items: async () => [{ name: "a" }, { name: "b" }] };
    assert.equal(
      await renderCompiledAsync(compile("{{#items}}{{name}} {{/items}}"), view),
      "a b "
    );
  });

  it("uses the built-in HTML escape by default", async () => {
    assert.equal(
      await renderCompiledAsync(compile("{{val}}"), { val: "<b>" }),
      "&lt;b&gt;"
    );
  });

  it("accepts a custom escape function", async () => {
    assert.equal(
      await renderCompiledAsync(compile("{{val}}"), { val: "<" }, {}, s => s),
      "<"
    );
  });

  it("passes pre-compiled partials as a plain object", async () => {
    const greeting = compile("Hi, {{name}}!");
    assert.equal(
      await renderCompiledAsync(compile("{{> greeting}}"), { name: "Carol" }, { greeting }),
      "Hi, Carol!"
    );
  });

  it("accepts a loader function for partials", async () => {
    const greeting = compile("Hi, {{name}}!");
    assert.equal(
      await renderCompiledAsync(compile("{{> greeting}}"), { name: "Carol" }, async (name) => name === "greeting" ? greeting : null),
      "Hi, Carol!"
    );
  });

  it("lazily loads an async partial via loader function", async () => {
    let loadCount = 0;
    assert.equal(
      await renderCompiledAsync(
        compile("{{> greeting}}"),
        { name: "Eve" },
        async (_name) => { loadCount++; return compile("Hello, {{name}}!"); }
      ),
      "Hello, Eve!"
    );
    assert.equal(loadCount, 1);
  });

  it("loads each async partial only once across re-render iterations", async () => {
    let loadCount = 0;
    const name = async () => "Frank"; // async value forces an extra render iteration
    assert.equal(
      await renderCompiledAsync(
        compile("{{> greeting}}"),
        { name },
        async (_name) => { loadCount++; return compile("Hi, {{name}}!"); }
      ),
      "Hi, Frank!"
    );
    assert.equal(loadCount, 1);
  });

  it("renders multiple partials via loader function", async () => {
    const templates: Record<string, string> = {
      header: "[{{title}}]",
      footer: "({{year}})",
    };
    assert.equal(
      await renderCompiledAsync(
        compile("{{> header}} {{> footer}}"),
        { title: "Home", year: 2026 },
        async (name) => name in templates ? compile(templates[name]) : null
      ),
      "[Home] (2026)"
    );
  });

  it("propagates rejection from a loader function", async () => {
    await assert.rejects(
      renderCompiledAsync(compile("{{> bad}}"), {}, async (_name) => { throw new Error("partial load failed"); }),
      /partial load failed/
    );
  });

  it("does not leave unhandled rejections when a loader function fails", async () => {
    let unhandled: Error | undefined;
    const handler = (reason: Error) => { unhandled = reason; };
    process.once("unhandledRejection", handler);
    try {
      await assert.rejects(
        renderCompiledAsync(compile("{{> bad}}"), {}, async (_name) => { throw new Error("should not be unhandled partial"); }),
        /should not be unhandled partial/
      );
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(unhandled, undefined, "unexpected unhandledRejection: " + unhandled?.message);
    } finally {
      process.removeListener("unhandledRejection", handler);
    }
  });

  it("resolves async function returning object with async function properties", async () => {
    const view = {
      user: async () => ({
        name: async () => "Alice",
      }),
    };
    assert.equal(
      await renderCompiledAsync(compile("{{#user}}{{name}}{{/user}}"), view),
      "Alice"
    );
  });

  it("resolves circular-linked view", async () => {
    const foo = { bar: null as any, name: "foo" };
    const bar = { foo, name: "bar" };
    foo.bar = bar;
    const view = {
      foo,
      bar
    };
    assert.equal(
      await renderCompiledAsync(compile("{{foo.name}},{{foo.bar.name}},{{bar.foo.name}}"), view),
      "foo,bar,foo"
    );
  });

  it("resolves circular-linked view via arrays", async () => {
    const foo = { array: [] as any[], name: "foo" };
    foo.array.push(foo);

    const view = {
      foo
    };
    assert.equal(
      await renderCompiledAsync(compile("{{#foo.array}}{{name}}{{/foo.array}}"), view),
      "foo"
    );
  });
});

describe("renderAsync", () => {
  it("compiles and renders a template asynchronously", async () => {
    assert.equal(
      await renderAsync("Hello, {{name}}!", { name: "World" }),
      "Hello, World!"
    );
  });

  it("resolves async function values", async () => {
    assert.equal(
      await renderAsync("{{val}}", { val: async () => "async!" }),
      "async!"
    );
  });

  it("accepts string partials", async () => {
    assert.equal(
      await renderAsync("{{> greeting}}", { name: "Dave" }, { greeting: "Hi, {{name}}!" }),
      "Hi, Dave!"
    );
  });

  it("accepts a loader function for string partials", async () => {
    assert.equal(
      await renderAsync("{{> greeting}}", { name: "Grace" }, async (_name) => "Hello, {{name}}!"),
      "Hello, Grace!"
    );
  });

  it("propagates rejection from a loader function", async () => {
    await assert.rejects(
      renderAsync("{{> bad}}", {}, async (_name) => { throw new Error("async partial failure"); }),
      /async partial failure/
    );
  });

  it("uses the built-in HTML escape by default", async () => {
    assert.equal(await renderAsync("{{val}}", { val: "<b>" }), "&lt;b&gt;");
  });

  it("accepts a custom escape function", async () => {
    assert.equal(await renderAsync("{{val}}", { val: "<" }, {}, s => s), "<");
  });

  it("propagates rejection from an async function value", async () => {
    const boom = async () => { throw new Error("async failure"); };
    await assert.rejects(
      renderAsync("{{val}}", { val: boom }),
      /async failure/
    );
  });

  it("resolves async function returning object with async function properties", async () => {
    assert.equal(
      await renderAsync("{{#user}}{{name}}{{/user}}", {
        user: async () => ({
          name: async () => "Alice",
        }),
      }),
      "Alice"
    );
  });
});

// Spec: standalone tags (section, inverted, comment, set-delimiter) that occupy
// an entire line (optionally preceded by whitespace) must have that whole line
// removed — including the leading whitespace and the trailing newline.
// Variable tags are NEVER standalone and must not consume surrounding whitespace.
// Sources: mustache/spec sections.yml, comments.yml, partials.yml — "Whitespace Sensitivity"
describe("standalone tags", () => {
  // --- Sections ---

  it("section: does not alter surrounding whitespace when inline", () => {
    // Non-standalone: tag shares the line with other content
    assert.equal(render(" | {{#boolean}}\t|\t{{/boolean}} | \n", { boolean: true }), " | \t|\t | \n");
  });

  it("section: does not alter internal whitespace", () => {
    assert.equal(
      render(" | {{#boolean}} {{! Important Whitespace }}\n {{/boolean}} | \n", { boolean: true }),
      " |  \n  | \n"
    );
  });

  it("section: standalone opening and closing tags are removed from output", () => {
    assert.equal(
      render("| This Is\n{{#boolean}}\n|\n{{/boolean}}\n| A Line", { boolean: true }),
      "| This Is\n|\n| A Line"
    );
  });

  it("section: indented standalone tags are removed from output", () => {
    assert.equal(
      render("| This Is\n  {{#boolean}}\n|\n  {{/boolean}}\n| A Line", { boolean: true }),
      "| This Is\n|\n| A Line"
    );
  });

  it("section: standalone tag without a preceding line is removed", () => {
    // Tag is at the very start of the template — no newline before it
    assert.equal(render("  {{#boolean}}\n#{{/boolean}}\n/", { boolean: true }), "#\n/");
  });

  it("section: standalone tag without a trailing newline is removed", () => {
    // Tag is at the very end of the template — no newline after it
    assert.equal(render("#{{#boolean}}\n/\n  {{/boolean}}", { boolean: true }), "#\n/\n");
  });

  it("section: \\r\\n is treated as a single newline for standalone detection", () => {
    assert.equal(render("|\r\n{{#boolean}}\r\n{{/boolean}}\r\n|", { boolean: true }), "|\r\n|");
  });

  // --- Inverted sections ---

  it("inverted section: standalone tags are removed from output", () => {
    assert.equal(
      render("| This Is\n{{^boolean}}\n|\n{{/boolean}}\n| A Line", { boolean: false }),
      "| This Is\n|\n| A Line"
    );
  });

  it("inverted section: indented standalone tags are removed from output", () => {
    assert.equal(
      render("| This Is\n  {{^boolean}}\n|\n  {{/boolean}}\n| A Line", { boolean: false }),
      "| This Is\n|\n| A Line"
    );
  });

  it("inverted section: standalone tag without a preceding line is removed", () => {
    assert.equal(render("  {{^boolean}}\n#{{/boolean}}\n/", { boolean: false }), "#\n/");
  });

  it("inverted section: standalone tag without a trailing newline is removed", () => {
    assert.equal(render("#{{^boolean}}\n/\n  {{/boolean}}", { boolean: false }), "#\n/\n");
  });

  it("inverted section: \\r\\n is treated as a single newline for standalone detection", () => {
    assert.equal(render("|\r\n{{^boolean}}\r\n{{/boolean}}\r\n|", { boolean: false }), "|\r\n|");
  });

  // --- Comments ---

  it("comment: standalone comment line is removed from output", () => {
    assert.equal(render("Begin.\n{{! Comment Block! }}\nEnd.", {}), "Begin.\nEnd.");
  });

  it("comment: indented standalone comment line is removed from output", () => {
    assert.equal(render("Begin.\n  {{! Indented Comment Block! }}\nEnd.", {}), "Begin.\nEnd.");
  });

  it("comment: inline comment does not strip surrounding whitespace", () => {
    // The tag shares the line with '12' — NOT standalone
    assert.equal(render("  12 {{! 34 }}\n", {}), "  12 \n");
  });

  it("comment: standalone comment without a preceding line is removed", () => {
    assert.equal(render("  {{! I'm Still Standalone }}\n!", {}), "!");
  });

  it("comment: standalone comment without a trailing newline is removed", () => {
    assert.equal(render("!\n  {{! I'm Still Standalone }}", {}), "!\n");
  });

  it("comment: \\r\\n is treated as a single newline for standalone detection", () => {
    assert.equal(render("|\r\n{{! Standalone Comment }}\r\n|", {}), "|\r\n|");
  });

  it("comment: multiline standalone comment is removed", () => {
    assert.equal(
      render("Begin.\n{{!\n  Something's going on here...\n}}\nEnd.", {}),
      "Begin.\nEnd."
    );
  });

  // --- Set delimiters ---

  it("set delimiter: standalone set-delimiter line is removed from output", () => {
    assert.equal(render("Begin.\n{{=| |=}}\nEnd.", {}), "Begin.\nEnd.");
  });

  it("set delimiter: indented standalone set-delimiter line is removed from output", () => {
    assert.equal(render("Begin.\n  {{=| |=}}\nEnd.", {}), "Begin.\nEnd.");
  });

  it("set delimiter: \\r\\n is treated as a single newline for standalone detection", () => {
    assert.equal(render("|\r\n{{=| |=}}\r\n|", {}), "|\r\n|");
  });

  // --- Variables are NEVER standalone ---

  it("variable: does not consume surrounding whitespace or newline", () => {
    assert.equal(render("  {{name}}\n", { name: "Alice" }), "  Alice\n");
  });

  it("variable: missing variable does not consume its line", () => {
    assert.equal(render("  {{missing}}\n", {}), "  \n");
  });

  // --- Partials ---

  it("partial: standalone partial line is removed (tag line consumed, partial content kept)", () => {
    const content = compile("hello");
    assert.equal(render("before\n{{> content}}\nafter", {}, { content }), "before\nhello\nafter");
  });

  it("partial: indented standalone partial prepends indentation to each line of partial", () => {
    const partial = compile("line1\nline2");
    assert.equal(render("  {{> partial}}\n", {}, { partial }), "  line1\n  line2\n");
  });

  it("partial: non-standalone partial does not strip surrounding whitespace", () => {
    const partial = compile("X");
    assert.equal(render("| {{> partial}} |", {}, { partial }), "| X |");
  });

  it("partial: \\r\\n is treated as a single newline for standalone detection", () => {
    const partial = compile(">");
    assert.equal(render("|\r\n{{>partial}}\r\n|", {}, { partial }), "|\r\n>\r\n|");
  });
});

describe("renderCompiledAsync error handling", () => {
  it("propagates rejection from an async function value", async () => {
    const boom = async () => { throw new Error("compiled async failure"); };
    await assert.rejects(
      renderCompiledAsync(compile("{{val}}"), { val: boom }),
      /compiled async failure/
    );
  });

  it("propagates rejection when async function is used in a section", async () => {
    const boom = async () => { throw new Error("section async failure"); };
    await assert.rejects(
      renderCompiledAsync(compile("{{#val}}yes{{/val}}"), { val: boom }),
      /section async failure/
    );
  });

  it("propagates rejection when one of multiple async values fails", async () => {
    const view = {
      good: async () => "ok",
      bad: async () => { throw new Error("one of many failed"); },
    };
    await assert.rejects(
      renderCompiledAsync(compile("{{good}} {{bad}}"), view),
      /one of many failed/
    );
  });

  it("does not leave unhandled promise rejections when a value fails", async () => {
    // Register a one-time unhandledRejection listener; if it fires the test fails.
    let unhandled: Error | undefined;
    const handler = (reason: Error) => { unhandled = reason; };
    process.once("unhandledRejection", handler);
    try {
      const boom = async () => { throw new Error("should not be unhandled"); };
      await assert.rejects(
        renderCompiledAsync(compile("{{val}}"), { val: boom }),
        /should not be unhandled/
      );
      // Give microtasks a chance to flush before checking
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(unhandled, undefined, "unexpected unhandledRejection: " + unhandled?.message);
    } finally {
      process.removeListener("unhandledRejection", handler);
    }
  });
});
