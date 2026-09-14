import type { Rule } from "./types";

interface Pair {
  open: string;
  close: string;
  aliases?: string[];
  markdown?: string;
  opaque?: boolean;
  quote?: boolean;
}
interface Opening { pair: Pair; from: number; to: number }
interface Enclosure extends Opening { closeFrom: number; closeTo: number }

const PAIRS: Pair[] = [
  { open: "[[", close: "]]", aliases: ["]"], opaque: true },
  { open: "(", close: ")" }, { open: "[", close: "]" },
  { open: "{", close: "}" }, { open: "<", close: ">" },
  ...["“”", "‘’", '""', "''", "「」", "『』", "【】", "（）", "《》"].map(
    ([open, close]) => ({ open, close, quote: true })
  ),
  { open: "***", close: "***", aliases: ["*", "**"], markdown: "formatting-" },
  { open: "___", close: "___", aliases: ["_", "__"], markdown: "formatting-" },
  { open: "**", close: "**", markdown: "formatting-strong" },
  { open: "__", close: "__", markdown: "formatting-strong" },
  { open: "*", close: "*", markdown: "formatting-em" },
  { open: "_", close: "_", markdown: "formatting-em" },
  { open: "==", close: "==", markdown: "formatting-highlight" },
  { open: "~~", close: "~~", markdown: "formatting-strikethrough" },
  { open: "$$", close: "$$", aliases: ["$"], markdown: "formatting-math", opaque: true },
  { open: "$", close: "$", markdown: "formatting-math", opaque: true },
];
const QUOTE_CLOSERS = new Set(PAIRS.filter(pair => pair.quote).map(pair => pair.close));
const CLOSERS = new Set([...PAIRS.flatMap(p => [p.close, ...(p.aliases ?? [])]), "`"]);

function isKnownCloser(lookup: string): boolean {
  return CLOSERS.has(lookup) || /^`+$/.test(lookup);
}
function isWordBefore(text: string, pos: number): boolean {
  return /[\p{L}\p{M}\p{N}]$/u.test(text.slice(Math.max(0, pos - 2), pos));
}
function isWordAfter(text: string, pos: number): boolean {
  return /^[\p{L}\p{M}\p{N}]/u.test(text.slice(pos + 1, pos + 3));
}
function isApostrophe(text: string, pos: number): boolean {
  return (text[pos] === "'" || text[pos] === "’") &&
    isWordBefore(text, pos) && isWordAfter(text, pos);
}
function escaped(text: string, pos: number): boolean {
  let backslashes = 0;
  for (let i = pos - 1; i >= 0 && text[i] === "\\"; i--) backslashes++;
  return backslashes % 2 !== 0;
}

function canClose(pair: Pair, syntax: string, text: string, pos: number): boolean {
  if (!pair.markdown || syntax.includes(pair.markdown)) return true;
  // Obsidian combines an adjacent emphasis/strong ending into one syntax token.
  // Keep each opening's width when closing e.g. **bold *italic***.
  return (pair.close === "*" || pair.close === "_") &&
    syntax.includes("formatting-strong") && syntax.split("_").includes("em") &&
    (text[pos - 1] === pair.close || text.startsWith(pair.close.repeat(3), pos));
}

/** Find paired delimiters on one line. Syntax names come from the host editor. */
function enclosures(text: string, syntaxAt: (pos: number) => string): Enclosure[] {
  const stack: Opening[] = [];
  const found: Enclosure[] = [];
  const close = (index: number, from: number) => {
    const entry = stack[index];
    found.push({ ...entry, closeFrom: from, closeTo: from + entry.pair.close.length });
    stack.length = index;
    return entry.pair.close.length;
  };
  for (let i = 0; i < text.length;) {
    const top = stack.at(-1);
    if (top?.pair.opaque) {
      // Backslash escaping does not apply inside Markdown code spans.
      const code = top.pair.open.startsWith("`");
      const run = code && text[i] === "`" ? /^`+/.exec(text.slice(i))?.[0] : undefined;
      if (text.startsWith(top.pair.close, i) &&
          (code ? run === top.pair.close : !escaped(text, i))) {
        i += close(stack.length - 1, i);
      } else {
        i += run?.length ?? 1;
      }
      continue;
    }
    if (text[i] === "\\") { i += 2; continue; }
    if (isApostrophe(text, i)) { i++; continue; }
    const syntax = syntaxAt(i);
    if (syntax.includes("comment")) { i++; continue; }

    // Only actual Markdown code delimiters start an opaque code span.
    if (text[i] === "`" && syntax.includes("formatting-code") && !syntax.includes("hmd-codeblock")) {
      const mark = /^`+/.exec(text.slice(i))![0];
      stack.push({pair:{open:mark,close:mark,aliases:["`"],opaque:true},from:i,to:i+mark.length});
      i += mark.length;
      continue;
    }
    if (top && text.startsWith(top.pair.close, i) &&
        canClose(top.pair, syntax, text, i)) {
      i += close(stack.length - 1, i);
      continue;
    }
    // Closing a quote also discards unmatched opening punctuation within it.
    let quoteIndex = -1;
    for (let j = QUOTE_CLOSERS.has(text[i]) ? stack.length - 1 : -1; j >= 0; j--) {
      if (stack[j].pair.quote && text.startsWith(stack[j].pair.close, i)) { quoteIndex = j; break; }
    }
    if (quoteIndex !== -1) { i += close(quoteIndex, i); continue; }
    if (syntax.includes("inline-code")) { i++; continue; }

    const pair = PAIRS.find(pair => text.startsWith(pair.open, i) &&
      (!pair.markdown || (!syntax.includes("hmd-codeblock") && syntax.includes(pair.markdown))));
    if (pair) {
      // An apostrophe after a word, without an opening quote, is a possessive.
      if (pair.quote && ((pair.open === "'" || pair.open === '"') && isWordBefore(text, i))) {
        i += pair.open.length;
        continue;
      }
      const opaque = pair.quote && syntax.includes("hmd-codeblock");
      stack.push({pair:opaque ? {...pair,opaque:true} : pair,from:i,to:i+pair.open.length});
      i += pair.open.length;
    } else {
      i++;
    }
  }
  return found;
}

/** Return an absolute offset within the line, without changing editor state. */
export function findTabTarget(
  text: string,
  cursor: number,
  rules: readonly Rule[],
  environment: string,
  syntaxAt: (pos: number) => string,
): number | null {
  const pairs = enclosures(text, syntaxAt)
    .filter(pair => pair.to <= cursor && cursor < pair.closeTo)
    .sort((a, b) => b.from - a.from);
  for (const pair of pairs) {
    const contexts = [environment, syntaxAt(pair.from), syntaxAt(pair.closeFrom)];
    if (pair.to < pair.closeFrom) contexts.push(syntaxAt(pair.to));
    for (const rule of rules) {
      if (rule.literal || !contexts.some(token => token.includes(rule.tokenMatcher))) continue;
      if (!rule.lookups.some(lookup => lookup === pair.pair.close || pair.pair.aliases?.includes(lookup))) continue;
      const target = rule.jumpAfter ? pair.closeTo : pair.closeFrom;
      // A before-target rule keeps the cursor here; do not escape an outer pair.
      return target > cursor ? target : null;
    }
  }

  // Arbitrary custom strings retain literal navigation. Known closers require
  // a surrounding pair unless the user explicitly selects literal matching.
  for (const rule of rules) {
    if (!environment.includes(rule.tokenMatcher)) continue;
    let target = Infinity;
    for (const lookup of rule.lookups) {
      if (!lookup || (!rule.literal && isKnownCloser(lookup))) continue;
      const index = text.indexOf(lookup, cursor);
      if (index === -1) continue;
      const candidate = index + (rule.jumpAfter ? lookup.length : 0);
      if (candidate > cursor) target = Math.min(target, candidate);
    }
    if (target !== Infinity) return target;
  }
  return null;
}
