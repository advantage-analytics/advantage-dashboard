# Personal Ask page — brief seed

Captured verbatim from the feature-new invocation (the leading `/task-add` was
part of what was typed):

> /task-add Build the personal Ask page at /dashboard/ask, replacing the ComingSoonPage stub, Advantage Intelligence only. Design: artboard project/Ask.dc.html in https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV (read it with the Artifact tool). Out of scope: bring-your-own-model, provider sign-in, MCP connector, and the model menu — render the model control as a static "Advantage Intelligence" label. Composer with @-tagging of the viewer's matches and opponents; a new streaming route built on getLLMStream() (src/lib/llm/adapter.ts) that receives only computed statistics for the tagged matches, never video, and answers claim → evidence → so-what using only numbers it was given; the answer lists the matches it was computed from as record rows. Use errorResponse()/jsonResponse() for refusals. Do NOT add a question quota or any migration; leave the quota UI out and note it as a follow-up. Conversations are not persisted. Mock mode must work with no LLM key. Remove comingSoon for Ask in nav.ts, run npm run map.

## Why this is a pipeline run, not a queue task

The text above was written as a `/task-add` prompt for an unattended overnight
run, which is why it cuts the hard questions. The note that came with it,
captured verbatim from the follow-up message:

> Ask is the risky one: its limit, persistence and bring-your-own-model questions are undecided, so the brief cuts them. If you want those designed first, use `/feature-new` for Ask instead and run only Opponents and Statistics overnight.

> Shared files: all three branches touch `nav.ts` and `MAP.md`, so expect small merge conflicts when the second and third land.

> Design caveat: the canvas itself was never rendered and checked, so treat the frames as layout intent, not pixel truth.

Reading of that (the scaffolder's inference — edit if wrong): choosing
`/feature-new` means the question limit, conversation persistence and
bring-your-own-model are **open questions for the brief and design stages**,
not settled cuts. The "out of scope", "no quota or migration" and "not
persisted" lines in the seed are the overnight fallback, not decisions.

Run `/feature-next personal-ask-page` to refine this seed into the stage 01 brief.
