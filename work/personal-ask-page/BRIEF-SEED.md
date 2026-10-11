# Personal Ask page — brief seed

Captured verbatim from the feature-new invocation (the leading `/task-add` was
part of what was typed):

> /task-add Build the personal Ask page at /dashboard/ask, replacing the ComingSoonPage stub, Advantage Intelligence only. Design: artboard project/Ask.dc.html in https://claude.ai/artifact/USGQxmojNd6K6rCvCCfxaV (read it with the Artifact tool). Out of scope: bring-your-own-model, provider sign-in, MCP connector, and the model menu — render the model control as a static "Advantage Intelligence" label. Composer with @-tagging of the viewer's matches and opponents; a new streaming route built on getLLMStream() (src/lib/llm/adapter.ts) that receives only computed statistics for the tagged matches, never video, and answers claim → evidence → so-what using only numbers it was given; the answer lists the matches it was computed from as record rows. Use errorResponse()/jsonResponse() for refusals. Do NOT add a question quota or any migration; leave the quota UI out and note it as a follow-up. Conversations are not persisted. Mock mode must work with no LLM key. Remove comingSoon for Ask in nav.ts, run npm run map.

Run `/feature-next personal-ask-page` to refine this seed into the stage 01 brief.
