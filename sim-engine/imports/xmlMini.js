/**
 * @file Zero-dependency XML reading utilities shared by the network importers.
 *
 * Strategy: use the browser's built-in `DOMParser` whenever available and fall
 * back to a compact, spec-approximate tree parser (`miniParse`) so the importers
 * also work in Node/WebWorker contexts without DOM. Both representations are
 * accessed through the adapter helpers below (`tagOf`, `attr`, `getChild`, …),
 * keeping importer code representation-agnostic.
 *
 * Supported by the mini parser: elements, attributes (single/double/unquoted),
 * self-closing tags, comments, CDATA sections, processing instructions, DOCTYPE
 * and the five standard entities plus numeric character references.
 *
 * @example
 * import { parseXMLDocument, getRootTag, getChild, getChildren, attr, numAttr } from './imports/xmlMini.js';
 * const root = parseXMLDocument('<net><edge id="E1"/></net>');
 * getRootTag(root);                    // 'net'
 * attr(getChild(root, 'edge'), 'id');  // 'E1'
 */

// ------------------------------------------------------------ mini parser --

/** @typedef {{tag:string, attributes:Record<string,string>, children:Array<XMLNode>, text:string}} XMLNode */

/**
 * Decode XML entities in attribute values / text content.
 * @param {string} s @returns {string}
 */
function decodeEntities(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (m, body) => {
    switch (body) {
      case 'lt': return '<';
      case 'gt': return '>';
      case 'amp': return '&';
      case 'quot': return '"';
      case 'apos': return "'";
      default: {
        const code = body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
    }
  });
}

/**
 * Minimal recursive-descent XML tree builder (DOMParser fallback).
 *
 * @param {string} src Raw XML string.
 * @returns {{root:XMLNode}} Pseudo-document whose `root` is the outermost element.
 * @throws {Error} On malformed markup (unterminated tags, mismatched close tags).
 * @private
 */
export function miniParse(src) {
  const sentinel = /** @type {XMLNode} */ ({ tag: '#document', attributes: {}, children: [], text: '' });
  const stack = [sentinel];
  let pos = 0;
  const len = src.length;

  const appendText = (chunk) => {
    if (!chunk) return;
    const top = stack[stack.length - 1];
    if (top.tag !== '#document') top.text += chunk;
  };

  while (pos < len) {
    const lt = src.indexOf('<', pos);
    if (lt < 0) { appendText(decodeEntities(src.slice(pos))); break; }
    appendText(decodeEntities(src.slice(pos, lt)));

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) throw new Error('xmlMini: unterminated comment');
      pos = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end < 0) throw new Error('xmlMini: unterminated CDATA section');
      appendText(src.slice(lt + 9, end)); // raw, not entity-decoded
      pos = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end < 0) throw new Error('xmlMini: unterminated processing instruction');
      pos = end + 2;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE or other declaration — skip past matching '>' (naive but fine here).
      const end = src.indexOf('>', lt);
      if (end < 0) throw new Error('xmlMini: unterminated <! declaration');
      pos = end + 1;
    } else if (src.startsWith('</', lt)) {
      const gt = src.indexOf('>', lt + 2);
      if (gt < 0) throw new Error(`xmlMini: unterminated close tag at offset ${lt}`);
      const name = src.slice(lt + 2, gt).trim();
      const top = stack.pop();
      if (!top || top.tag !== name) {
        throw new Error(`xmlMini: mismatched close tag </${name}> at offset ${lt} (open: "${top?.tag}")`);
      }
      pos = gt + 1;
    } else {
      // Opening tag: scan to '>' respecting quoted attribute values.
      let i = lt + 1;
      let quote = null;
      while (i < len) {
        const ch = src[i];
        if (quote) { if (ch === quote) quote = null; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
        i++;
      }
      if (i >= len) throw new Error(`xmlMini: unterminated start tag at offset ${lt}`);
      const selfClosing = src[i - 1] === '/';
      const innerEnd = selfClosing ? i - 1 : i;
      const header = src.slice(lt + 1, innerEnd);

      const nameMatch = /^[\w.:][-.\w:]*|\S/.exec(header.trim());
      if (!nameMatch) throw new Error(`xmlMini: missing tag name at offset ${lt}`);
      const tag = nameMatch[0];

      const node = /** @type {XMLNode} */ ({ tag, attributes: {}, children: [], text: '' });
      const attrsPart = header.slice(header.indexOf(tag) + tag.length);
      const attrRe = /([^\s=/]+)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
      let m;
      while ((m = attrRe.exec(attrsPart)) !== null) {
        node.attributes[m[1]] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
      }

      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      pos = i + 1;
    }
  }

  if (stack.length > 1) {
    throw new Error(`xmlMini: unclosed element <${stack[stack.length - 1].tag}>`);
  }
  const root = sentinel.children.find((c) => typeof c.tag === 'string' && c.tag !== '#document');
  if (!root) throw new Error('xmlMini: no root element found');
  return { root };
}

// -------------------------------------------------------------- adapters --

function isDom(el) {
  return typeof el === 'object' && el !== null && el.nodeType === 1;
}

/**
 * Parse an XML document string into an element tree.
 *
 * Uses `DOMParser` when available; otherwise falls back to {@link miniParse}.
 *
 * @param {string} xmlString Raw XML text.
 * @returns {Element|XMLNode} Document root **element**.
 * @throws {Error} When the document cannot be parsed or has no root element.
 */
export function parseXMLDocument(xmlString) {
  if (typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    throw new TypeError('parseXMLDocument: xmlString must be a non-empty string');
  }

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
    const err = doc.getElementsByTagName('parsererror')[0];
    if (err) throw new Error(`parseXMLDocument: invalid XML — ${err.textContent?.slice(0, 200)}`);
    if (!doc.documentElement) throw new Error('parseXMLDocument: document has no root element');
    return doc.documentElement;
  }

  return miniParse(xmlString).root;
}

/** Tag name of an element (case preserved — XML is case-sensitive). @param {Element|XMLNode} el @returns {string} */
export function tagOf(el) {
  if (isDom(el)) return /** @type {Element} */(el).tagName;
  return /** @type {XMLNode} */(el)?.tag ?? '';
}

/**
 * Attribute value lookup (returns `undefined` when absent).
 * @param {Element|XMLNode} el @param {string} name @returns {string|undefined}
 */
export function attr(el, name) {
  if (!el) return undefined;
  if (isDom(el)) {
    const v = /** @type {Element} */(el).getAttribute(name);
    return v === null ? undefined : v;
  }
  return /** @type {XMLNode} */(el).attributes?.[name];
}

/** All attributes as a plain object. @param {Element|XMLNode} el @returns {Record<string,string>} */
export function attrs(el) {
  const out = {};
  if (!el) return out;
  if (isDom(el)) {
    for (const a of Array.from(/** @type {Element} */(el).attributes)) out[a.name] = a.value;
  } else {
    Object.assign(out, /** @type {XMLNode} */(el).attributes ?? {});
  }
  return out;
}

/** Direct child elements. @param {Element|XMLNode} el @returns {Array<Element|XMLNode>} */
export function childElements(el) {
  if (!el) return [];
  if (isDom(el)) return Array.from(/** @type {Element} */(el).children);
  return /** @type {XMLNode} */(el).children ?? [];
}

/**
 * Direct children with an exact tag name.
 * @param {Element|XMLNode} el @param {string} tag @returns {Array<Element|XMLNode>}
 */
export function getChildren(el, tag) {
  return childElements(el).filter((c) => tagOf(c) === tag);
}

/**
 * First direct child with an exact tag name (or `null`).
 * @param {Element|XMLNode} el @param {string} tag @returns {Element|XMLNode|null}
 */
export function getChild(el, tag) {
  return getChildren(el, tag)[0] ?? null;
}

/**
 * Deep (recursive) search for all descendants with a tag name.
 * @param {Element|XMLNode} el @param {string} tag @returns {Array<Element|XMLNode>}
 */
export function findAllDeep(el, tag) {
  const out = [];
  const walk = (node) => {
    for (const c of childElements(node)) {
      if (tagOf(c) === tag) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

/** Concatenated text content of an element. @param {Element|XMLNode|null} el @returns {string} */
export function textContent(el) {
  if (!el) return '';
  if (isDom(el)) return /** @type {Element} */(el).textContent ?? '';
  return /** @type {XMLNode} */(el).text ?? '';
}

/**
 * Numeric attribute with fallback.
 * @param {Element|XMLNode|null} el @param {string} name @param {number} [fallback=NaN]
 * @returns {number}
 */
export function numAttr(el, name, fallback = NaN) {
  const raw = attr(el, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Root tag helper — convenient for validating document type. @param {Element|XMLNode} root @returns {string} */
export function getRootTag(root) {
  return tagOf(root);
}
