/* Ainext provider backend compatibility shim
 * OpenAI/GPT requests are now routed by ainext-supabase.js to the Supabase Edge Function,
 * which then uses the server-side OPENROUTER_API_KEY secret. This file intentionally does not
 * intercept callAI, so chat history persistence remains enabled.
 */
(() => {
  'use strict';
  window.AinextProviderBackend = {
    version: '2026.09.08.2',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    backend: true
  };
})();
