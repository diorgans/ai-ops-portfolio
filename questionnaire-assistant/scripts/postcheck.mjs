// The code check that runs after the model (part of the system, not of the scoring).
// It removes every citation whose quote is not on the cited page (same rule the scorer uses,
// including the 4-word minimum), then removes every claim left with no citation, and recomputes
// the status from what is left:
//   claims left, nothing listed as not covered  -> answered
//   claims left, something not covered          -> partial
//   no claims left                              -> abstained
// A removed claim becomes a not_covered entry, so the reviewer sees what could not be verified.
//
// v1 removed a whole claim if ANY of its quotes failed. That threw out 3 true claims whose extra
// quote was a short list item ("HTTP Request"), so v2 drops the bad quote and keeps the claim
// when at least one valid quote remains.

import { quoteExists } from './scoring.mjs';

export function postcheck(output, pages) {
  const kept = [];
  const removed = [];
  let droppedQuotes = 0;
  for (const claim of output.claims) {
    const citations = claim.citations.filter((c) => quoteExists(c, pages));
    droppedQuotes += claim.citations.length - citations.length;
    if (citations.length > 0) kept.push({ ...claim, citations });
    else removed.push(claim);
  }
  const notCovered = [...output.not_covered, ...removed.map((c) => `Could not verify against the documentation: ${c.text}`)];
  if (kept.length === 0 && notCovered.length === 0) notCovered.push('No verifiable answer in the documentation.');
  const status = kept.length === 0 ? 'abstained' : notCovered.length === 0 ? 'answered' : 'partial';
  return { status, claims: kept, not_covered: notCovered, removed_claims: removed, dropped_quotes: droppedQuotes };
}
