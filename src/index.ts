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
  let regExp = "";
  regExp += escapeRegExp(leftDelimiter);
  regExp += "\\s*";
  regExp += "(?:";
  regExp += "=\\s*(?<ld>[^=\\s]+)\\s+(?<rd>[^=\\s]+)\\s*="; // Delimiters
  regExp += "|";
  regExp += "#\\s*(?<sec>\\S+?)"; // Section
  regExp += "|";
  regExp += "\\^\\s*(?<isec>\\S+?)"; // Inverted Section
  regExp += "|";
  regExp += "/\\s*(?<esec>\\S+?)"; // End Section
  regExp += "|";
  regExp += "\\{\\s*(?<uvarb>\\S+?)\\s*\\}"; // Unescaped variable with {}
  regExp += "|";
  regExp += "&\\s*(?<uvara>\\S+?)"; // Unescaped variable with &
  regExp += "|";
  regExp += "![\\s\\S]*?"; // Comment
  regExp += "|";
  regExp += ">\\s*\\*\\s*(?<dpt>\\S+?)"; // Dynamic Partial
  regExp += "|";
  regExp += ">\\s*(?<pt>\\S+?)"; // Partial
  regExp += "|";
  regExp += "\\$\\s*(?<bl>\\S+?)"; // Block
  regExp += "|";
  regExp += "<\\s*\\*\\s*(?<dpn>\\S+?)"; // Dynamic Parent
  regExp += "|";
  regExp += "<\\s*(?<pn>\\S+?)"; // Parent
  regExp += "|";
  regExp += "(?<var>\\S+?)"; // Variable
  regExp += ")";
  regExp += "\\s*?";
  regExp += escapeRegExp(rightDelimiter);
  return new RegExp(regExp, "g");
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
    const groups = match.groups;
    let left = match.index;
    let right = tagRegExp.lastIndex;
    let isStandalone = false;
    if (!groups?.uvarb && !groups?.uvara && !groups?.var) {
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
    if (groups?.ld && groups?.rd) { // Set delimiters
      tagRegExp = compileTagRegExp(groups.ld, groups.rd);
    } else if (groups?.sec) { // Section
      if (inParent) throw new Error("Sections cannot be nested inside parents");
      resolve(groups.sec);
      code += `x=a(x);`;
      code += `for(const i of x){v.unshift(i);`;
      stack.push([groups.sec, () => code += `v.shift();}`]);
    } else if (groups?.isec) { // Inverted section
      if (inParent) throw new Error("Sections cannot be nested inside parents");
      resolve(groups.isec);
      code += `if(!a(x).length){`;
      stack.push([groups.isec, () => code += `}`]);
    } else if (groups?.esec) { // End section
      const [startTag, endCode] = stack.pop()
        || throwError(Error("Unmatched end tag: " + groups.esec));
      if (startTag !== groups.esec)
        throw new Error(`Unmatched end tag: ${startTag} -> ${groups.esec}`);
      endCode();
    } else if (groups?.uvarb) { // Unescaped variable with {{{}}}
      if (inParent)
        throw new Error("Variables cannot be nested inside parents");
      resolve(groups.uvarb);
      code += `r+=s(x);`;
    } else if (groups?.uvara) { // Unescaped variable with {{& }}
      if (inParent)
        throw new Error("Variables cannot be nested inside parents");
      resolve(groups.uvara);
      code += `r+=s(x);`;
    } else if (groups?.dpt) { // Dynamic partial
      if (inParent)
        throw new Error("Partials cannot be nested inside parents");
      resolve(groups.dpt);
      code += `x=P(x);`;
      if (isStandalone) {
        if (left < match.index) {
          const indentation = template.slice(left, match.index);
          code += `r+=(x?x(v,p,{},e):"").replace(/^/gm,${quoteString(indentation)});`;
        } else code += `r+=x?x(v,p,{},e):"";`;
        while (template[index - 1].match(/[\n\r]/)) index--;
      } else code += `r+=x?x(v,p,{},e):"";`;
    } else if (groups?.pt) { // Partial
      if (inParent) throw new Error("Partials cannot be nested inside parents");
      code += `x=P(${quoteString(groups.pt)});`;
      if (isStandalone) {
        if (left < match.index) {
          const indentation = template.slice(left, match.index);
          code += `r+=(x?x(v,p,{},e):"").replace(/^/gm,${quoteString(indentation)});`;
        } else code += `r+=x?x(v,p,{},e):"";`;
        while (template[index - 1].match(/[\n\r]/)) index--;
      } else code += `r+=x?x(v,p,{},e):"";`;
    } else if (groups?.bl) { // Block
      if (inParent) {
        if (isIdentifier(groups.bl))
          code += `${groups.bl}`;
        else code += `${quoteString(groups.bl)}`;
        code += `:()=>{let r="";`;
        inParent = false;
        stack.push([groups.bl, () => {
          code += `return r;},`;
          inParent = true;
        }]);
      } else {
        if (isIdentifier(groups.bl))
          code += `x=b.${groups.bl};`;
        else code += `x=b[${quoteString(groups.bl)}];`;
        code += `if(x)r+=x();else{`;
        stack.push([groups.bl, () => code += `}`]);
      }
    } else if (groups?.dpn) { // Dynamic Parent
      if (inParent) throw new Error("Parents cannot be nested inside parents");
      resolve(groups.dpn);
      code += `x=P(x);`;
      code += `if(x)r+=x(v,p,{`;
      stack.push([groups.dpn, () => code += `},e);`]);
    } else if (groups?.pn) { // Parent
      if (inParent) throw new Error("Parents cannot be nested inside parents");
      code += `x=P(${quoteString(groups.pn)});`;
      code += `if(x)r+=x(v,p,{`;
      inParent = true;
      stack.push([groups.pn, () => {
        code += `},e);`;
        inParent = false;
      }]);
    } else if (groups?.var) { // Variable
      if (inParent)
        throw new Error("Variables cannot be nested inside parents");
      resolve(groups.var);
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
