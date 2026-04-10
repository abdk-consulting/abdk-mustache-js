function throwError(error: Error): never {
  throw error;
}

function quoteString(string: string): string {
  return JSON.stringify(string);
}

function isIdentifier(string: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(string);
}

function escapeRegExp(string: string): string {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function compileTagRegExp(leftDelimiter: string, rightDelimiter: string): RegExp {
  const escapedLeftDelimiter = escapeRegExp(leftDelimiter);
  const escapedRightDelimiter = escapeRegExp(rightDelimiter);
  return new RegExp(`${escapedLeftDelimiter}\\s*(\\{[^}]*\\}\\s*|[^{\\s].*?)${escapedRightDelimiter}`,
    "g");
}

export type CompiledTemplate = (
  view: any[],
  partials: { [name: string]: CompiledTemplate },
  blocks: { [name: string]: () => string },
  escape: (string: string) => string) => string;

export function compile(template: string): CompiledTemplate {
  let code = ``;

  const resolve = (path: string) => {
    if (path === '.') {
      code += `x=v[0];`;
    } else {
      const parts = path.split('.');
      code += `x=o(${quoteString(parts[0])});`;
      for (const part of parts) {
        if (isIdentifier(part))
          code += `x=x&&f(x.${part});`;
        else code += `x=x&&f(x[${quoteString(part)}]);`;
      }
    }
  };

  code += `const f=(x)=>typeof x==="function"?x():x;`;
  code += `const a=(x)=>Array.isArray(x)?x:x?[x]:[];`;
  code += `const s=(x)=>x==null?"":String(x);`;
  code += `const S=(x)=>x==null?"":e(x);`;
  code += `const o=(n)=>v.find(x=>x!=null&&typeof x==="object"&&n in x);`;
  code += `let x;`;
  code += `let r="";`;

  let tagRegExp = compileTagRegExp('{{', '}}');
  let index = 0;
  let stack: [string, () => void][] = [];
  let inParent = false;
  while (true) {
    tagRegExp.lastIndex = index;
    const match = tagRegExp.exec(template);
    if (!match) break;
    if (!inParent && match.index > index)
      code += `r+=${quoteString(template.slice(index, match.index))};`;
    index = tagRegExp.lastIndex;
    const tag = match[1].trim();
    const tagMatch = tag.match(/^(?:=\s*([^=\s]+)\s+([^=\s]+)\s*=|#\s*(\S+)|\^\s*(\S+)|\/\s*(\S+)|\{\s*(\S+)\s*\}|&\s*(\S+)|!.*|>\s*\*\s*(\S+)|>\s*(\S+)|\$\s*(\S+)|<\s*\*\s*(\S+)|<\s*(\S+)|\s*(\S+))$/);
    if (!tagMatch) throw new Error(`Invalid tag: ${tag}`);
    if (tagMatch[1] && tagMatch[2]) { // Set delimiters
      tagRegExp = compileTagRegExp(tagMatch[1], tagMatch[2]);
    } else if (tagMatch[3]) { // Section
      if (inParent) throw new Error("Sections cannot be nested inside parents");
      resolve(tagMatch[3]);
      code += `x=a(x);`;
      code += `for(const i of x){v.unshift(i);`;
      stack.push([tagMatch[3], () => code += `v.shift();}`]);
    } else if (tagMatch[4]) { // Inverted section
      if (inParent) throw new Error("Sections cannot be nested inside parents");
      resolve(tagMatch[4]);
      code += `if(!a(x).length){`;
      stack.push([tagMatch[4], () => code += `}`]);
    } else if (tagMatch[5]) { // End section
      const [startTag, endCode] = stack.pop()
        || throwError(Error("Unmatched end tag: " + tagMatch[5]));
      if (startTag !== tagMatch[5])
        throw new Error(`Unmatched end tag: ${startTag} -> ${tagMatch[5]}`);
      endCode();
    } else if (tagMatch[6]) { // Unescaped variable with {{{}}}
      if (inParent)
        throw new Error("Variables cannot be nested inside parents");
      resolve(tagMatch[6]);
      code += `r+=s(x);`;
    } else if (tagMatch[7]) { // Unescaped variable with {{& }}
      if (inParent)
        throw new Error("Variables cannot be nested inside parents");
      resolve(tagMatch[7]);
      code += `r+=s(x);`;
    } else if (tagMatch[8]) { // Dynamic partial
      if (inParent)
        throw new Error("Partials cannot be nested inside parents");
      resolve(tagMatch[8]);
      code += `x=p[x];`;
      code += `r+=x?x(v,p,{},e):"";`;
    } else if (tagMatch[9]) { // Partial
      if (inParent) throw new Error("Partials cannot be nested inside parents");
      if (isIdentifier(tagMatch[9]))
        code += `x=p.${tagMatch[9]};`;
      else code += `x=p[${quoteString(tagMatch[9])}];`;
      code += `r+=x?x(v,p,{},e):"";`;
    } else if (tagMatch[10]) { // Block
      if (inParent) {
        if (isIdentifier(tagMatch[10]))
          code += `${tagMatch[10]}`;
        else code += `${quoteString(tagMatch[10])}`;
        code += `:()=>{let r="";`;
        inParent = false;
        stack.push([tagMatch[10], () => {
          code += `return r;},`;
          inParent = true;
        }]);
      } else {
        if (isIdentifier(tagMatch[10]))
          code += `x=b.${tagMatch[10]};`;
        else code += `x=b[${quoteString(tagMatch[10])}];`;
        code += `if(x)r+=x();else{`;
        stack.push([tagMatch[10], () => code += `}`]);
      }
    } else if (tagMatch[11]) { // Dynamic Parent
      if (inParent) throw new Error("Parents cannot be nested inside parents");
      resolve(tagMatch[11]);
      code += `x=p[x];`;
      code += `if(x)r+=x(v,p,{`;
      stack.push([tagMatch[11], () => code += `},e);`]);
    } else if (tagMatch[12]) { // Parent
      if (inParent) throw new Error("Parents cannot be nested inside parents");
      if (isIdentifier(tagMatch[12]))
        code += `x=p.${tagMatch[12]};`;
      else code += `x=p[${quoteString(tagMatch[12])}];`;
      code += `if(x)r+=x(v,p,{`;
      inParent = true;
      stack.push([tagMatch[12], () => {
        code += `},e);`;
        inParent = false;
      }]);
    } else if (tagMatch[13]) { // Variable
      if (inParent)
        throw new Error("Variables cannot be nested inside parents");
      resolve(tagMatch[13]);
      code += `r+=S(x);`;
    } else {
      // Comment, do nothing
    }
  }
  if (stack.length > 0) {
    const [startTag] = stack.pop()!;
    throw new Error(`Unclosed tag: ${startTag}`);
  }
  code += `r+=${quoteString(template.slice(index))};`;
  code += `return r;`;
  try {
    return new Function("v", "p", "b", "e", code) as CompiledTemplate;
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      err.message += `\n${code}`;
    }
    throw err;
  }
}

function escapeHTML(string: string): string {
  return String(string).replace(/[&<>"']/g, ch => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: throw Error("Unexpected character: " + ch);
    }
  });
}

export function renderCompiled(
  template: CompiledTemplate,
  view: any,
  partials: { [name: string]: CompiledTemplate } = {},
  escape: (string: string) => string = escapeHTML
): string {
  return template([view], partials, {}, escape);
}

export function render(
  template: string,
  view: any,
  partials: { [name: string]: string } = {},
  escape: (string: string) => string = escapeHTML
): string {
  const compiledPartials: { [name: string]: CompiledTemplate } = {};
  return renderCompiled(
    compile(template),
    view,
    Object.fromEntries(Object.entries(partials).map(([name, template]) =>
      [name, (v, p, b, e) => {
        if (!(name in compiledPartials)) {
          compiledPartials[name] = compile(template);
        }
        return compiledPartials[name](v, p, b, e);
      }])), escape);
}

export async function renderCompiledAsync(
  template: CompiledTemplate,
  view: any,
  partials: { [name: string]: () => Promise<CompiledTemplate> } = {},
  escape: (string: string) => string = escapeHTML
): Promise<string> {
  const wrappedValues = new Map<any, any>();
  const values = new Map<Function, any>();
  const pendingValues = new Map<Function, Promise<any>>();

  const wrapView = (view: any): any => {
    if (wrappedValues.has(view)) return wrappedValues.get(view);
    else if (Array.isArray(view)) {
      const wrappedArray = [] as any[];
      wrappedValues.set(view, wrappedArray);
      for (const item of view) wrappedArray.push(wrapView(item));
      return wrappedArray;
    }
    else if (view && typeof view === "object") {
      const wrappedObject = {} as any;
      wrappedValues.set(view, wrappedObject);
      for (const key of Object.keys(view))
        wrappedObject[key] = wrapView(view[key]);
      return wrappedObject;
    } else if (typeof view === "function") {
      const wrappedFunction = () => {
        if (values.has(view)) return wrapView(values.get(view));
        else if (pendingValues.has(view)) return null;
        else {
          const promise = Promise.resolve(view());
          pendingValues.set(view, promise);
          promise.then(value => {
            values.set(view, value);
            pendingValues.delete(view);
          }).catch(() => {
            // Rejection is handled by Promise.all in the render loop;
            // suppress the unhandled rejection on this detached chain.
          });
          return values.has(view) ? wrapView(values.get(view)) : null;
        }
      };
      wrappedValues.set(view, wrappedFunction);
      return wrappedFunction;
    } else return view;
  };

  const wrappedPartials: { [name: string]: CompiledTemplate } = {};
  const pendingPartials: { [name: string]: Promise<CompiledTemplate> } = {};

  const wrapPartials = (partials: {
    [name: string]: () => Promise<CompiledTemplate>
  }) => {
    return Object.fromEntries(
      Object.entries(partials)
        .map(([name, partial]) => {
          if (name in wrappedPartials) return [name, wrappedPartials[name]];
          else if (name in pendingPartials) return null;
          else {
            const promise = Promise.resolve(partial());
            pendingPartials[name] = promise;
            promise.then(compiled => {
              wrappedPartials[name] = compiled;
              delete pendingPartials[name];
            }).catch(() => {
              // Rejection is handled by Promise.all in the render loop;
              // suppress the unhandled rejection on this detached chain.
            });
            return name in wrappedPartials
              ? [name, wrappedPartials[name]]
              : null;
          }
        })
        .filter((entry): entry is [string, CompiledTemplate] => entry !== null)
    );
  };

  while (true) {
    const result = template([wrapView(view)], wrapPartials(partials), {}, escape);
    if (pendingValues.size === 0 && Object.keys(pendingPartials).length === 0) return result;
    await Promise.all([
      ...pendingValues.values(),
      ...Object.values(pendingPartials)
    ]);
    pendingValues.clear();
    wrappedValues.clear();
  }
}

export async function renderAsync(
  template: string,
  view: any,
  partials: { [name: string]: string | (() => Promise<string>) } = {},
  escape: (string: string) => string = escapeHTML
): Promise<string> {
  return renderCompiledAsync(
    compile(template),
    view,
    Object.fromEntries(Object.entries(partials).map(([name, template]) =>
      [name, async () =>
        compile(typeof template === "function"
          ? await template()
          : template)
      ])), escape);
}
