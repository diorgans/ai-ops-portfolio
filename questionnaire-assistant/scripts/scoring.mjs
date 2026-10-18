// The scoring definition (docs/scoring-definition.md) as code.
// Every rule in that document that code can decide lives here; scoring.test.mjs checks each one.
// Rules that need a human (does a quote support a claim, is an answer point correct) come in
// as labels; this file only does the counting.

export const STATUSES = ['answered', 'partial', 'abstained'];
export const GOLD_LABELS = ['answer', 'partial', 'abstain'];
export const MIN_QUOTE_WORDS = 4;

// ---------- Gold labels (section 3) ----------

// points: [{ supported: true|false, ... }]  ->  'answer' | 'abstain' | 'partial'
export function goldLabel(points) {
  if (!Array.isArray(points) || points.length === 0) throw new Error('a question needs at least one point');
  const supported = points.filter((p) => p.supported === true).length;
  if (supported === points.length) return 'answer';
  if (supported === 0) return 'abstain';
  return 'partial';
}

// ---------- Output rules (section 4) ----------

// Returns a list of rule violations. An empty list means the output is valid.
// Uncited claims are NOT a violation here: they are counted by citation metrics instead,
// so the decision (status) is still scored.
export function validateOutput(output, pageIds) {
  const errors = [];
  if (output === null || typeof output !== 'object') return ['output is not an object'];
  const { status, claims, not_covered: notCovered } = output;
  if (!STATUSES.includes(status)) errors.push(`unknown status: ${JSON.stringify(status)}`);
  if (!Array.isArray(claims)) errors.push('claims is not a list');
  if (!Array.isArray(notCovered)) errors.push('not_covered is not a list');
  if (errors.length) return errors;

  if (status === 'abstained' && claims.length > 0) errors.push('abstained but has claims');
  if (status === 'abstained' && notCovered.length === 0) errors.push('abstained but not_covered is empty');
  if (status === 'answered' && claims.length === 0) errors.push('answered but has no claims');
  if (status === 'answered' && notCovered.length > 0) errors.push('answered but not_covered is not empty');
  if (status === 'partial' && (claims.length === 0 || notCovered.length === 0)) {
    errors.push('partial needs both claims and not_covered');
  }

  claims.forEach((claim, i) => {
    if (typeof claim?.text !== 'string' || claim.text.trim() === '') errors.push(`claim ${i} has no text`);
    if (!Array.isArray(claim?.citations)) errors.push(`claim ${i} citations is not a list`);
    else claim.citations.forEach((c, j) => {
      if (!pageIds.includes(c?.page)) errors.push(`claim ${i} citation ${j} cites unknown page ${JSON.stringify(c?.page)}`);
      if (typeof c?.quote !== 'string') errors.push(`claim ${i} citation ${j} has no quote`);
    });
  });
  return errors;
}

// The decision the scorer uses: the output's own status, or 'invalid' if it broke the rules.
export function decisionOf(output, pageIds) {
  return validateOutput(output, pageIds).length === 0 ? output.status : 'invalid';
}

// ---------- Quote checking (section 5) ----------

// Removes whitespace and Markdown formatting differences only. Case and wording are untouched.
export function normalize(text) {
  return text
    .replace(/\{%[^%]*%\}/g, ' ')                  // GitBook tags such as {% hint %}
    .replace(/<a\b[^>]*>\s*<\/a>/g, ' ')           // empty heading anchors
    .replace(/<\/?[a-z][^>]*>/gi, ' ')             // other HTML tags
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')     // [link text](url) -> link text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')            // heading markers
    .replace(/^\s*(?:[*+-]|\d+\.)\s+/gm, '')       // list bullets and numbers
    .replace(/^\s*>\s?/gm, '')                     // blockquote markers
    .replace(/[*`]/g, '')                          // bold markers and code ticks (deleted, not spaced)
    .replace(/\|/g, ' ')                           // table pipes
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(text) {
  const n = normalize(text);
  return n === '' ? 0 : n.split(' ').length;
}

// pages: { [pageId]: fullPageText }
export function quoteExists(citation, pages) {
  const page = pages[citation.page];
  if (typeof page !== 'string' || typeof citation.quote !== 'string') return false;
  if (wordCount(citation.quote) < MIN_QUOTE_WORDS) return false;
  return normalize(page).includes(normalize(citation.quote));
}

// A claim's quotes exist only if it has at least one citation and every one of them exists.
export function claimQuotesExist(claim, pages) {
  return claim.citations.length > 0 && claim.citations.every((c) => quoteExists(c, pages));
}

// ---------- Decision metrics (section 5) ----------

// rows: [{ gold: 'answer'|'partial'|'abstain', subtype?: 'off_topic'|'near_miss', decision }]
export function decisionMetrics(rows) {
  const columns = [...STATUSES, 'invalid'];
  const matrix = Object.fromEntries(GOLD_LABELS.map((g) => [g, Object.fromEntries(columns.map((c) => [c, 0]))]));
  for (const r of rows) {
    if (!matrix[r.gold] || !(r.decision in matrix[r.gold])) throw new Error(`bad row: ${JSON.stringify(r)}`);
    matrix[r.gold][r.decision] += 1;
  }

  const rate = (hits, total) => ({ hits, total, rate: total === 0 ? null : hits / total });
  const count = (pred) => rows.filter(pred).length;

  const notFullySupported = (r) => r.gold === 'abstain' || r.gold === 'partial';
  const abstainRows = (subtype) => (r) => r.gold === 'abstain' && (subtype === undefined || r.subtype === subtype);

  return {
    matrix,
    overclaim: rate(count((r) => notFullySupported(r) && r.decision === 'answered'), count(notFullySupported)),
    abstentionRecall: rate(count((r) => abstainRows()(r) && r.decision === 'abstained'), count(abstainRows())),
    abstentionRecallOffTopic: rate(
      count((r) => abstainRows('off_topic')(r) && r.decision === 'abstained'), count(abstainRows('off_topic'))),
    abstentionRecallNearMiss: rate(
      count((r) => abstainRows('near_miss')(r) && r.decision === 'abstained'), count(abstainRows('near_miss'))),
    falseRefusal: rate(count((r) => r.gold === 'answer' && r.decision === 'abstained'), count((r) => r.gold === 'answer')),
    hedge: rate(count((r) => r.gold === 'answer' && r.decision === 'partial'), count((r) => r.gold === 'answer')),
    invalid: rate(count((r) => r.decision === 'invalid'), rows.length),
  };
}

// ---------- Citation metrics (section 5) ----------

// claims: [{ quotesExist: bool, cited: bool, humanSupports?: bool }]
// humanSupports is only needed when quotesExist is true.
export function citationMetrics(claims) {
  const valid = claims.filter((c) => {
    if (!c.quotesExist) return false;
    if (typeof c.humanSupports !== 'boolean') throw new Error('claim with existing quotes is missing its human support label');
    return c.humanSupports;
  }).length;
  const total = claims.length;
  return {
    citationValidity: { hits: valid, total, rate: total === 0 ? null : valid / total },
    quotesExist: claims.filter((c) => c.quotesExist).length,
    uncited: claims.filter((c) => !c.cited).length,
    totalClaims: total,
  };
}

// ---------- Answer accuracy (section 5) ----------

// marks: ['covered' | 'missing' | 'wrong', ...], one per supported gold point
export function answerAccuracy(marks) {
  for (const m of marks) if (!['covered', 'missing', 'wrong'].includes(m)) throw new Error(`bad mark: ${m}`);
  const covered = marks.filter((m) => m === 'covered').length;
  return {
    accuracy: { hits: covered, total: marks.length, rate: marks.length === 0 ? null : covered / marks.length },
    wrong: marks.filter((m) => m === 'wrong').length,
  };
}
