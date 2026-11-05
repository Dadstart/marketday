const MIN_FONT_PX = 12;
const MAX_FONT_PX = 48;
const HTML_FONT_SIZE = [0, 12, 14, 16, 18, 24, 32, 40];
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'svg', 'math', 'textarea']);
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'tr']);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export type TextMarks = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
};

export type DescriptionSegment = {
  text: string;
  marks: TextMarks;
  email?: string;
};

type Frame = { tag: 'b' | 'i' | 'u' | 'span'; fontSize?: number };

export function sanitizeDescription(input: string): string {
  const source = input.replace(/\r\n?/g, '\n').replace(/\0/g, '');
  const out: string[] = [];
  const stack: Frame[] = [];
  let skipUntil: string | null = null;
  let index = 0;

  while (index < source.length) {
    if (source[index] !== '<') {
      const next = source.indexOf('<', index);
      const end = next === -1 ? source.length : next;
      pushText(out, source.slice(index, end), skipUntil != null);
      index = end;
      continue;
    }

    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }

    if (source.startsWith('<!', index) || source.startsWith('<?', index)) {
      const end = source.indexOf('>', index + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    const end = source.indexOf('>', index + 1);
    if (end === -1) {
      pushText(out, source.slice(index), skipUntil != null);
      break;
    }

    const raw = source.slice(index + 1, end);
    index = end + 1;
    const parsed = parseTag(raw);
    if (!parsed) {
      pushText(out, `<${raw}>`, skipUntil != null);
      continue;
    }

    if (skipUntil) {
      if (parsed.closing && parsed.name === skipUntil) {
        skipUntil = null;
      }
      continue;
    }

    if (DROP_CONTENT.has(parsed.name)) {
      if (!parsed.closing && !parsed.selfClosing) {
        skipUntil = parsed.name;
      }
      continue;
    }

    if (parsed.name === 'br' && !parsed.closing) {
      out.push('\n');
      continue;
    }

    if (BLOCK.has(parsed.name)) {
      ensureBreak(out);
      continue;
    }

    const alias = tagAlias(parsed.name);
    if (!alias) {
      continue;
    }

    if (parsed.closing) {
      closeFrame(out, stack, alias);
      continue;
    }

    if (parsed.selfClosing) {
      continue;
    }

    if (alias === 'span') {
      const fontSize = readFontSize(raw);
      stack.push({ tag: 'span', fontSize: fontSize ?? undefined });
      if (fontSize) {
        out.push(`<span style="font-size: ${fontSize}px">`);
      }
      continue;
    }

    stack.push({ tag: alias });
    out.push(`<${alias}>`);
  }

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame?.tag === 'span' && !frame.fontSize) {
      continue;
    }
    if (frame) {
      out.push(`</${frame.tag}>`);
    }
  }

  return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function descriptionForEditor(stored: string): string {
  return decodeHtmlEntities(stored);
}

export function descriptionSegments(input: string): DescriptionSegment[] {
  return segmentsFromSanitized(sanitizeDescription(input));
}

function segmentsFromSanitized(html: string): DescriptionSegment[] {
  const marks: TextMarks[] = [{}];
  const chunks: { text: string; marks: TextMarks }[] = [];
  let index = 0;

  while (index < html.length) {
    if (html[index] !== '<') {
      const next = html.indexOf('<', index);
      const end = next === -1 ? html.length : next;
      const text = decodeHtmlEntities(html.slice(index, end));
      if (text) {
        chunks.push({ text, marks: { ...marks[marks.length - 1] } });
      }
      index = end;
      continue;
    }

    const end = html.indexOf('>', index + 1);
    if (end === -1) {
      break;
    }
    const tag = html.slice(index, end + 1);
    index = end + 1;
    const match = /^<(\/?)(b|i|u|span)\b([^>]*)>$/.exec(tag);
    if (!match) {
      continue;
    }
    if (match[1] === '/') {
      if (marks.length > 1) {
        marks.pop();
      }
      continue;
    }
    const nextMarks: TextMarks = { ...marks[marks.length - 1] };
    if (match[2] === 'b') {
      nextMarks.bold = true;
    } else if (match[2] === 'i') {
      nextMarks.italic = true;
    } else if (match[2] === 'u') {
      nextMarks.underline = true;
    } else {
      const size = /font-size:\s*(\d{1,2})px/i.exec(match[3] ?? '');
      const fontSize = Number(size?.[1]);
      if (fontSize >= MIN_FONT_PX && fontSize <= MAX_FONT_PX) {
        nextMarks.fontSize = fontSize;
      }
    }
    marks.push(nextMarks);
  }

  return chunks.flatMap((chunk) => splitEmails(chunk.text, chunk.marks));
}

function splitEmails(text: string, marks: TextMarks): DescriptionSegment[] {
  const parts: DescriptionSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(EMAIL.source, 'g'))) {
    const start = match.index ?? 0;
    const email = match[0];
    if (email.length > 254 || (start > 0 && /[A-Za-z0-9._%+\/-]/.test(text[start - 1] ?? ''))) {
      continue;
    }
    if (start > last) {
      parts.push({ text: text.slice(last, start), marks });
    }
    parts.push({ text: email, marks, email });
    last = start + email.length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), marks });
  }
  return parts;
}

function parseTag(raw: string): { name: string; closing: boolean; selfClosing: boolean } | null {
  const match = /^\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*?)(\/?)\s*$/.exec(raw);
  if (!match) {
    return null;
  }
  return {
    closing: match[1] === '/',
    name: match[2].toLowerCase(),
    selfClosing: match[4] === '/',
  };
}

function tagAlias(name: string): Frame['tag'] | null {
  if (name === 'b' || name === 'strong') {
    return 'b';
  }
  if (name === 'i' || name === 'em') {
    return 'i';
  }
  if (name === 'u') {
    return 'u';
  }
  if (name === 'span' || name === 'font') {
    return 'span';
  }
  return null;
}

function findLastFrame(stack: Frame[], tag: Frame['tag']): number {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]?.tag === tag) {
      return index;
    }
  }
  return -1;
}

function closeFrame(out: string[], stack: Frame[], tag: Frame['tag']) {
  const found = findLastFrame(stack, tag);
  if (found === -1) {
    return;
  }
  while (stack.length > found) {
    const frame = stack.pop();
    if (!frame || (frame.tag === 'span' && !frame.fontSize)) {
      continue;
    }
    out.push(`</${frame.tag}>`);
  }
}

function readFontSize(rawTag: string): number | null {
  const style = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(rawTag);
  const styleValue = style?.[1] ?? style?.[2] ?? '';
  if (styleValue && !/[&\\]|expression|url\s*\(/i.test(styleValue)) {
    const px = /(?:^|;)\s*font-size\s*:\s*(\d{1,2})\s*px\s*(?:;|$)/i.exec(styleValue);
    const fromStyle = clampFont(Number(px?.[1]));
    if (fromStyle) {
      return fromStyle;
    }
  }

  const font = /\bsize\s*=\s*(?:"(\d{1,2})"|'(\d{1,2})'|(\d{1,2})(?=[\s/>]|$))/i.exec(rawTag);
  const size = Number(font?.[1] ?? font?.[2] ?? font?.[3]);
  if (!font || !Number.isInteger(size)) {
    return null;
  }
  if (size >= MIN_FONT_PX && size <= MAX_FONT_PX) {
    return size;
  }
  if (size >= 1 && size <= 7) {
    return HTML_FONT_SIZE[size] ?? null;
  }
  return null;
}

function clampFont(size: number): number | null {
  if (!Number.isInteger(size) || size < MIN_FONT_PX || size > MAX_FONT_PX) {
    return null;
  }
  return size;
}

function ensureBreak(out: string[]) {
  if (out.length === 0 || out[out.length - 1]?.endsWith('\n')) {
    return;
  }
  out.push('\n');
}

function pushText(out: string[], chunk: string, skipped: boolean) {
  if (skipped || !chunk) {
    return;
  }
  out.push(escapeText(decodeHtmlEntities(chunk)));
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body: string) => {
    const token = body.toLowerCase();
    if (token === 'amp') {
      return '&';
    }
    if (token === 'lt') {
      return '<';
    }
    if (token === 'gt') {
      return '>';
    }
    if (token === 'quot') {
      return '"';
    }
    if (token === 'apos') {
      return "'";
    }
    const code = token.startsWith('#x') ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
      return entity;
    }
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code < 32) || (code >= 0xd800 && code <= 0xdfff)) {
      return '';
    }
    return String.fromCodePoint(code);
  });
}

const EMAIL_DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'svg', 'math', 'textarea', 'form']);
const EMAIL_TAGS = new Set(['b', 'i', 'u', 'p', 'div', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'a', 'span', 'img']);

type EmailFrame = { name: string; open: boolean };

export function sanitizeEmailHtml(input: string): string {
  const source = input.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim();
  if (!source) {
    return '';
  }
  if (!/<\/?[a-z]/i.test(source)) {
    return escapeText(source).replace(/\n/g, '<br>');
  }
  return walkEmailHtml(source);
}

export function emailPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, '\n[$1]\n')
      .replace(/<img\b[^>]*>/gi, '\n[image]\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-3]|li|ul|ol)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function walkEmailHtml(source: string): string {
  const out: string[] = [];
  const stack: EmailFrame[] = [];
  let skipUntil: string | null = null;
  let index = 0;

  while (index < source.length) {
    if (source[index] !== '<') {
      const next = source.indexOf('<', index);
      const end = next === -1 ? source.length : next;
      pushEmailText(out, source.slice(index, end), skipUntil != null);
      index = end;
      continue;
    }

    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }

    if (source.startsWith('<!', index) || source.startsWith('<?', index)) {
      const end = source.indexOf('>', index + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    const end = source.indexOf('>', index + 1);
    if (end === -1) {
      pushEmailText(out, source.slice(index), skipUntil != null);
      break;
    }

    const raw = source.slice(index + 1, end);
    index = end + 1;
    const parsed = parseTag(raw);
    if (!parsed) {
      pushEmailText(out, `<${raw}>`, skipUntil != null);
      continue;
    }

    if (skipUntil) {
      if (parsed.closing && parsed.name === skipUntil) {
        skipUntil = null;
      }
      continue;
    }

    if (EMAIL_DROP.has(parsed.name)) {
      if (!parsed.closing && !parsed.selfClosing) {
        skipUntil = parsed.name;
      }
      continue;
    }

    const name = emailTagName(parsed.name);
    if (!name) {
      continue;
    }

    if (name === 'br') {
      if (!parsed.closing) {
        out.push('<br>');
      }
      continue;
    }

    if (name === 'img') {
      const image = emailImageTag(raw);
      if (image) {
        out.push(image);
      }
      continue;
    }

    if (parsed.closing) {
      closeEmailFrame(out, stack, name);
      continue;
    }

    const open = emailOpenTag(name, raw);
    stack.push({ name, open: open != null });
    if (open) {
      out.push(open);
    }
    if (parsed.selfClosing) {
      closeEmailFrame(out, stack, name);
    }
  }

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame?.open) {
      out.push(`</${frame.name}>`);
    }
  }

  return out.join('').replace(/(?:<br>){3,}/g, '<br><br>').trim();
}

function emailTagName(name: string): string | null {
  if (name === 'strong') {
    return 'b';
  }
  if (name === 'em') {
    return 'i';
  }
  return EMAIL_TAGS.has(name) ? name : null;
}

function emailOpenTag(name: string, raw: string): string | null {
  if (name === 'a') {
    const href = safeEmailHref(raw);
    return href ? `<a href="${escapeText(href).replace(/"/g, '&quot;')}">` : null;
  }
  if (name === 'span') {
    const fontSize = readFontSize(raw);
    return fontSize ? `<span style="font-size: ${fontSize}px">` : null;
  }
  return `<${name}>`;
}

function emailImageTag(raw: string): string | null {
  const src = readAttr(raw, 'src');
  if (!src || /[\u0000-\u0020<>"']/.test(src)) {
    return null;
  }
  const alt = escapeText(readAttr(raw, 'alt') ?? '').replace(/"/g, '&quot;');
  const tag = (safeSrc: string) => `<img src="${safeSrc}" alt="${alt}" style="max-width:100%;height:auto">`;
  if (/^cid:[A-Za-z0-9._-]{1,64}$/.test(src)) {
    return tag(src);
  }
  if (/^https:\/\//i.test(src)) {
    return tag(escapeText(src).replace(/"/g, '&quot;'));
  }
  return null;
}

function readAttr(raw: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i').exec(raw);
  const value = decodeHtmlEntities((match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim());
  return value || null;
}

function safeEmailHref(rawTag: string): string | null {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(rawTag);
  const value = decodeHtmlEntities((match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim());
  if (!value || /[\u0000-\u0020<>"']/.test(value)) {
    return null;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (/^mailto:/i.test(value)) {
    const address = value.slice('mailto:'.length).split('?')[0] ?? '';
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(address)) {
      return null;
    }
    return `mailto:${address}`;
  }
  return null;
}

function closeEmailFrame(out: string[], stack: EmailFrame[], name: string) {
  let found = -1;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]?.name === name) {
      found = index;
      break;
    }
  }
  if (found === -1) {
    return;
  }
  while (stack.length > found) {
    const frame = stack.pop();
    if (frame?.open) {
      out.push(`</${frame.name}>`);
    }
  }
}

function pushEmailText(out: string[], chunk: string, skipped: boolean) {
  if (skipped || !chunk) {
    return;
  }
  const decoded = decodeHtmlEntities(chunk);
  if (!decoded.trim()) {
    if (/[ \t]/.test(decoded)) {
      out.push(' ');
    }
    return;
  }
  out.push(escapeText(decoded).replace(/\n/g, '<br>'));
}
