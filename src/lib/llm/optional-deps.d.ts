/**
 * Ambient declarations for optional LLM provider packages.
 * These are peer dependencies — install one before using:
 *   npm install @anthropic-ai/sdk    (for LLM_PROVIDER=anthropic)
 *   npm install openai               (for LLM_PROVIDER=openai)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "@anthropic-ai/sdk" {
  const Anthropic: any;
  export default Anthropic;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "openai" {
  const OpenAI: any;
  export default OpenAI;
}
