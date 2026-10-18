# Demo video script (about 3 minutes)

Record the screen at 1080p. Before you start: open a terminal in the project folder, and have
`labelling/citations.html` and `README.md` (rendered on GitHub) open in browser tabs. Run
`node scripts/fetch-kb.mjs` first if the `kb/pages` folder is empty.

---

**Scene 1. The problem (0:00–0:25)**
*Show:* the README headline table on GitHub.
*Say:* "Companies answer security and product questionnaires all the time. An AI can draft the
answers from your docs, but the expensive failure isn't a clumsy answer, it's a confident one the
docs don't back up. So I measured when the system should say 'I don't know'."

**Scene 2. The test set (0:25–0:55)**
*Show:* open `questions/questions.json`, scroll to `H03`.
*Say:* "Sixty questions about n8n, checked against 21 documentation pages. A third of them, the
docs can't fully answer. For some, I found the true answer on n8n pages *outside* the knowledge
base, so if the model answers from memory, it shows up as a failure. I reviewed every label by hand."

**Scene 3. The baselines (0:55–1:20)**
*Show:* in the terminal, type `node scripts/baselines.mjs` and press Enter.
*Say:* "First the dumb baselines. Always answering overclaims every time. A keyword match refuses
too much: it wrongly refuses almost two-thirds of the questions it could answer. Turning the
threshold just trades one error for the other."

**Scene 4. The surprise (1:20–2:00)**
*Show:* the README section "What we found", then `H03` in both answers. In the terminal:
`node -e "const r=require('./results/raw/claude-forced-answer-r2.json');console.log(r.outputs.H03.claims.map(c=>c.text).join('\n\n'))"`
*Say:* "Claude was surprisingly good, as long as its answer format had a place to say 'the docs
don't cover this'. I took that slot away and asked Yes/No questions. Now it guesses. Here it
reasons that error workflow runs probably count toward the quota. They don't. And every quote it
cites is real, so an automatic citation check passes it."

**Scene 5. The human check (2:00–2:30)**
*Show:* the `citations.html` tab. Press `1`, then `2`, to show the controls.
*Say:* "So I built a blind review page. A person judges whether each quote actually supports its
claim, without knowing which system wrote it. Without the slot, only 36% of claims were fully
supported. With the final design, 68%, and the human caught every confirmed wrong guess but one."

**Scene 6. The design (2:30–3:00)**
*Show:* `docs/architecture.md`, the diagram at the top.
*Say:* "The final system: the docs in the prompt, a structured answer with a not-covered list, a
short code check that drops any quote that isn't on the page, and a person approving every answer.
The lesson matches my last two projects: use the model for judgment, use code for bookkeeping,
and measure the failure that actually costs money. Total API spend for the whole project was $3.40."
