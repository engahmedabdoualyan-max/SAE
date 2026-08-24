/**
 * @file Academic citation generator for the SAE AutoSim Hub platform.
 *
 * Produces ready-to-paste citations of a simulation scenario in the five most
 * common academic styles (APA 7th, IEEE, BibTeX, Harvard, Chicago) plus a
 * synthetic DOI for report headers. Scenario name/version/author are used when
 * available; otherwise platform defaults apply.
 *
 * @example
 * import { generateAll, generateDOI } from './sim-engine/citations/generator.js';
 * const cites = generateAll({ name: 'Nasr City Corridor', version: '2.1' }, network);
 * console.log(cites.apa, generateDOI());
 */

const APP_NAME = 'SAE AutoSim Hub';
const APP_URL = 'https://sae.fimtosoft.com';
const DEFAULT_VERSION = '1.0';
const DEFAULT_YEAR = String(new Date().getFullYear());
const DEFAULT_AUTHOR = 'SAE AutoSim Hub';

const MONTHS = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

/**
 * Resolve scenario metadata with platform fallbacks.
 * @param {Object} [scenario] Scenario-like object.
 * @param {Object} [network] Optional network (used to enrich the title).
 * @returns {{title:string, version:string, year:string, author:string,
 *            url:string, accessed:string, accessedISO:string, key:string}}
 */
function resolveMeta(scenario = {}, network = null) {
  const s = scenario && typeof scenario === 'object' ? scenario : {};
  const now = new Date();

  const networkPart =
    network && typeof network === 'object' && network.name
      ? `${String(network.name)} Traffic Simulation`
      : null;
  const baseTitle = s.title ?? s.name ?? s.scenarioName ?? networkPart;

  const title = String(baseTitle ?? '').trim() || 'Traffic Simulation Platform';
  const version = String(s.version ?? s.engineVersion ?? DEFAULT_VERSION);
  const year = String(s.year ?? now.getFullYear());
  const author = Array.isArray(s.authors) && s.authors.length
    ? s.authors.join(', ')
    : String(s.author ?? s.creator ?? DEFAULT_AUTHOR);

  const accessed = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const accessedISO = now.toISOString().slice(0, 10);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'scenario';

  return {
    title,
    version,
    year,
    author,
    url: String(s.url ?? APP_URL),
    accessed,
    accessedISO,
    key: `saeautosim${now.getFullYear()}${slug}`,
  };
}

/**
 * Escape double quotes for quoted strings (IEEE / Chicago).
 * @param {string} s Raw text.
 * @returns {string}
 */
function q(s) {
  return String(s).replace(/"/g, '\\"');
}

/**
 * Wrap BibTeX field values containing special characters in braces.
 * @param {string} s Raw value.
 * @returns {string}
 */
function bib(s) {
  return `{${String(s).replace(/([{}])/g, '\\$1')}}`;
}

/**
 * Generate an APA 7th edition citation.
 *
 * Format: Author. (Year). *Title* (Version x.y) [Computer software]. URL
 *
 * @param {Object} [scenario] Scenario metadata.
 * @param {Object} [network] Network context.
 * @returns {string} APA citation string.
 *
 * @example generateAPA({ name: 'Ring Road AM Peak' }); // "SAE AutoSim Hub. (2026). ..."
 */
export function generateAPA(scenario = {}, network = null) {
  const m = resolveMeta(scenario, network);
  return `${m.author}. (${m.year}). *${m.title}* (Version ${m.version}) [Computer software]. ${m.url}`;
}

/**
 * Generate an IEEE style citation.
 *
 * Format: Author, "Title," Year. [Online]. Available: URL
 *
 * @param {Object} [scenario] Scenario metadata.
 * @param {Object} [network] Network context.
 * @returns {string} IEEE citation string.
 */
export function generateIEEE(scenario = {}, network = null) {
  const m = resolveMeta(scenario, network);
  return `${m.author}, "${q(m.title)}," ${m.year}. [Online]. Available: ${m.url}`;
}

/**
 * Generate a BibTeX `@misc` entry.
 *
 * @param {Object} [scenario] Scenario metadata.
 * @returns {string} BibTeX entry (multi-line).
 *
 * @example generateBibTeX({ name: 'CBD Microsimulation' });
 */
export function generateBibTeX(scenario = {}) {
  const m = resolveMeta(scenario, null);
  return [
    `@misc{${m.key},`,
    `  title        = ${bib(m.title)},`,
    `  author       = ${bib(m.author)},`,
    `  year         = ${m.year},`,
    `  url          = ${bib(m.url)},`,
    `  note         = ${bib(`Version ${m.version}. Accessed: ${m.accessed}`)},`,
    `}`,
  ].join('\n');
}

/**
 * Generate a Harvard style citation including the viewed date.
 *
 * Format: Author (Year) *Title* (Version x.y). Available at: URL
 * (Accessed: D Month YYYY).
 *
 * @param {Object} [scenario] Scenario metadata.
 * @param {Object} [network] Network context.
 * @returns {string} Harvard citation string.
 */
export function generateHarvard(scenario = {}, network = null) {
  const m = resolveMeta(scenario, network);
  return `${m.author} (${m.year}) *${m.title}* (Version ${m.version}). Available at: ${m.url} (Accessed: ${m.accessed}).`;
}

/**
 * Generate a Chicago style citation (bibliography form).
 *
 * Format: Author. "Title." Computer software. Year. URL.
 *
 * @param {Object} [scenario] Scenario metadata.
 * @param {Object} [network] Network context.
 * @returns {string} Chicago citation string.
 */
export function generateChicago(scenario = {}, network = null) {
  const m = resolveMeta(scenario, network);
  return `${m.author}. "${q(m.title)}." Computer software. ${m.year}. ${m.url}.`;
}

/**
 * Generate all citation styles at once.
 *
 * @param {Object} [scenario] Scenario metadata.
 * @param {Object} [network] Network context.
 * @returns {{apa:string, ieee:string, bibtex:string, harvard:string, chicago:string}}
 *
 * @example
 * const c = generateAll(scenario, net);
 * navigator.clipboard.writeText(`${c.apa}\n\n${c.ieee}`);
 */
export function generateAll(scenario = {}, network = null) {
  return {
    apa: generateAPA(scenario, network),
    ieee: generateIEEE(scenario, network),
    bibtex: generateBibTeX(scenario),
    harvard: generateHarvard(scenario, network),
    chicago: generateChicago(scenario, network),
  };
}

/**
 * Generate a synthetic (fake but well-formed-looking) DOI for report headers.
 * Shape: `10.5281/sae-autosim.<year>.<4 random chars>`
 *
 * @param {number|string} [year=new Date().getFullYear()] Year segment.
 * @returns {string} Fake DOI string.
 *
 * @example generateDOI(); // "10.5281/sae-autosim.2026.k3f9"
 */
export function generateDOI(year = new Date().getFullYear()) {
  let rand;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    rand = buf[0];
  } else {
    rand = Math.floor(Math.random() * 0xffffffff);
  }
  const suffix = rand.toString(36).padStart(7, '0').slice(0, 4);
  return `10.5281/sae-autosim.${year}.${suffix}`;
}

export default { generateAPA, generateIEEE, generateBibTeX, generateHarvard, generateChicago, generateAll, generateDOI };
