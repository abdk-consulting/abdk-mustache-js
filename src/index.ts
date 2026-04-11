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
  return new RegExp(`${escapedLeftDelimiter}\\s*(\\{[^}]*\\}\\s*|[^{\\s][\\s\\S]*?)${escapedRightDelimiter}`,
    "g");
}

export type CompiledTemplate = (
  view: any[],
  partials: { [name: string]: CompiledTemplate }
    | ((name: string) => CompiledTemplate | null),
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
  code += `const P=(n)=>typeof p==="function"?p(n):p[n];`
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
    const tag = match[1].trim();
    const tagMatch = tag.match(/^(?:=\s*([^=\s]+)\s+([^=\s]+)\s*=|#\s*(\S+)|\^\s*(\S+)|\/\s*(\S+)|\{\s*(\S+)\s*\}|&\s*(\S+)|![\s\S]*|>\s*\*\s*(\S+)|>\s*(\S+)|\$\s*(\S+)|<\s*\*\s*(\S+)|<\s*(\S+)|\s*(\S+))$/);
    if (!tagMatch) throw new Error(`Invalid tag: ${tag}`);
    let left = match.index;
    let right = tagRegExp.lastIndex;
    let isStandalone = false;
    if (!tagMatch[6] && !tagMatch[7] && !tagMatch[13]) { // Standalone tags
      isStandalone = true;
      while (left > 0) {
        const ch = template[left - 1];
        if (ch.match(/\S/)) {
          isStandalone = false;
          break;
        } else if (ch.match(/[\n\r]/)) break;
        else left--;
      }
      if (isStandalone) {
        while (right < template.length) {
          const ch = template[right];
          if (ch.match(/\S/)) {
            isStandalone = false;
            break;
          } else if (ch.match(/[\n\r]/)) {
            right++;
            if (right < template.length
              && template[right].match(/[\n\r]/)
              && template[right] !== ch) right++;
            break;
          } else right++;
        }
      }
      if (!isStandalone) {
        left = match.index;
        right = tagRegExp.lastIndex;
      }
    }
    if (!inParent && match.index > index)
      code += `r+=${quoteString(template.slice(index, left))};`;
    index = right;
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
      code += `x=P(x);`;
      if (isStandalone) {
        if (left < match.index) {
          const indentation = template.slice(left, match.index);
          code += `r+=(x?x(v,p,{},e):"").replace(/^/gm,${quoteString(indentation)});`;
        } else code += `r+=x?x(v,p,{},e):"";`;
        while (template[index - 1].match(/[\n\r]/)) index--;
      } else code += `r+=x?x(v,p,{},e):"";`;
    } else if (tagMatch[9]) { // Partial
      if (inParent) throw new Error("Partials cannot be nested inside parents");
      code += `x=P(${quoteString(tagMatch[9])});`;
      if (isStandalone) {
        if (left < match.index) {
          const indentation = template.slice(left, match.index);
          code += `r+=(x?x(v,p,{},e):"").replace(/^/gm,${quoteString(indentation)});`;
        } else code += `r+=x?x(v,p,{},e):"";`;
        while (template[index - 1].match(/[\n\r]/)) index--;
      } else code += `r+=x?x(v,p,{},e):"";`;
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
      code += `x=P(x);`;
      code += `if(x)r+=x(v,p,{`;
      stack.push([tagMatch[11], () => code += `},e);`]);
    } else if (tagMatch[12]) { // Parent
      if (inParent) throw new Error("Parents cannot be nested inside parents");
      code += `x=P(${quoteString(tagMatch[12])});`;
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
  partials: { [name: string]: CompiledTemplate }
    | ((name: string) => CompiledTemplate | null) = {},
  escape: (string: string) => string = escapeHTML
): string {
  return template([view], partials, {}, escape);
}

export function render(
  template: string,
  view: any,
  partials: { [name: string]: string }
    | ((name: string) => string | null) = {},
  escape: (string: string) => string = escapeHTML
): string {
  const compiledPartials: { [name: string]: CompiledTemplate } = {};
  return renderCompiled(
    compile(template),
    view,
    name => {
      const template = typeof partials === "function"
        ? partials(name)
        : partials[name] ?? null;
      return template === null ? null : compile(template);
    }, escape);
}

export async function renderCompiledAsync(
  template: CompiledTemplate,
  view: any,
  partials: { [name: string]: CompiledTemplate }
    | ((name: string) => Promise<CompiledTemplate | null>) = {},
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

  const wrappedPartials = new Map<string, CompiledTemplate | null>();
  const pendingPartials = new Map<string, Promise<CompiledTemplate | null>>();

  while (true) {
    const result = template(
      [wrapView(view)],
      (name) => {
        if (wrappedPartials.has(name)) return wrappedPartials.get(name)!;
        else if (pendingPartials.has(name)) return null;
        else {
          const promise = Promise.resolve(
            typeof partials === "function"
              ? partials(name)
              : partials[name] ?? null
          );
          pendingPartials.set(name, promise);
          promise.then(partial => {
            wrappedPartials.set(name, partial);
            pendingPartials.delete(name);
          }).catch(() => {
            // Rejection is handled by Promise.all in the render loop;
            // suppress the unhandled rejection on this detached chain.
          });
          return wrappedPartials.has(name)
            ? wrappedPartials.get(name)!
            : null;
        }
      },
      {}, escape);
    if (pendingValues.size === 0 && pendingPartials.size === 0) return result;
    await Promise.all([
      ...pendingValues.values(),
      ...pendingPartials.values()
    ]);
    wrappedValues.clear();
  }
}

export async function renderAsync(
  template: string,
  view: any,
  partials: { [name: string]: string }
    | ((name: string) => Promise<string | null>) = {},
  escape: (string: string) => string = escapeHTML
): Promise<string> {
  return renderCompiledAsync(
    compile(template),
    view,
    async (name) => {
      const template = typeof partials === "function"
        ? await partials(name)
        : partials[name];
      return template === null ? null : compile(template);
    }, escape);
}
