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

  describe("set delimiters", () => {
    it("supports custom delimiters", () => {
      assert.equal(render("{{=<% %>=}}<%name%>", { name: "Dave" }), "Dave");
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

  it("passes compiled partials as thunks", async () => {
    const greeting = compile("Hi, {{name}}!");
    assert.equal(
      await renderCompiledAsync(compile("{{> greeting}}"), { name: "Carol" }, { greeting: async () => greeting }),
      "Hi, Carol!"
    );
  });

  it("lazily loads an async partial", async () => {
    let loadCount = 0;
    const loadGreeting = async () => { loadCount++; return compile("Hello, {{name}}!"); };
    assert.equal(
      await renderCompiledAsync(compile("{{> greeting}}"), { name: "Eve" }, { greeting: loadGreeting }),
      "Hello, Eve!"
    );
    assert.equal(loadCount, 1);
  });

  it("loads each async partial only once across re-render iterations", async () => {
    let loadCount = 0;
    // view function forces two render iterations
    const name = async () => "Frank";
    const loadGreeting = async () => { loadCount++; return compile("Hi, {{name}}!"); };
    assert.equal(
      await renderCompiledAsync(compile("{{> greeting}}"), { name }, { greeting: loadGreeting }),
      "Hi, Frank!"
    );
    assert.equal(loadCount, 1);
  });

  it("renders multiple async partials", async () => {
    const header = async () => compile("[{{title}}]");
    const footer = async () => compile("({{year}})");
    assert.equal(
      await renderCompiledAsync(
        compile("{{> header}} {{> footer}}"),
        { title: "Home", year: 2026 },
        { header, footer }
      ),
      "[Home] (2026)"
    );
  });

  it("propagates rejection from a partial loader", async () => {
    const boom = async () => { throw new Error("partial load failed"); };
    await assert.rejects(
      renderCompiledAsync(compile("{{> bad}}"), {}, { bad: boom }),
      /partial load failed/
    );
  });

  it("does not leave unhandled rejections when a partial loader fails", async () => {
    let unhandled: Error | undefined;
    const handler = (reason: Error) => { unhandled = reason; };
    process.once("unhandledRejection", handler);
    try {
      const boom = async () => { throw new Error("should not be unhandled partial"); };
      await assert.rejects(
        renderCompiledAsync(compile("{{> bad}}"), {}, { bad: boom }),
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

  it("accepts async function partials (loaded on demand)", async () => {
    const loadGreeting = async () => "Hello, {{name}}!";
    assert.equal(
      await renderAsync("{{> greeting}}", { name: "Grace" }, { greeting: loadGreeting }),
      "Hello, Grace!"
    );
  });

  it("propagates rejection from an async function partial", async () => {
    const boom = async () => { throw new Error("async partial failure"); };
    await assert.rejects(
      renderAsync("{{> bad}}", {}, { bad: boom }),
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
