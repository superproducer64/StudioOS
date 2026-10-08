// Server-only: one small text-completion call, with a provider switch. The key is read from
// server environment variables and is never sent to the browser or included in an error.
import type { PromptInput } from "./drafting";

export type LlmConfig = { provider: "anthropic" | "openai"; apiKey: string; model: string };

/** Returns null when drafting is not set up. Throws a clear message for a half-finished setup. */
export function readLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig | null {
  const provider = (env.LLM_PROVIDER || "anthropic").toLowerCase();
  if (provider !== "anthropic" && provider !== "openai")
    throw new Error("LLM_PROVIDER must be anthropic or openai.");
  const apiKey = (provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY)?.trim();
  if (!apiKey) return null;
  const model = env.LLM_MODEL?.trim() || (provider === "anthropic" ? "claude-sonnet-5-5" : "");
  if (!model) throw new Error("Set LLM_MODEL when using the openai provider.");
  return { provider, apiKey, model };
}

type FetchFn = typeof fetch;

/** Sends the prompt and returns the model's text. */
export async function complete(
  config: LlmConfig,
  prompt: PromptInput,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const anthropic = config.provider === "anthropic";
  const res = await fetchFn(
    anthropic ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: anthropic
        ? { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" }
        : { "content-type": "application/json", authorization: "Bearer " + config.apiKey },
      body: JSON.stringify(
        anthropic
          ? {
              model: config.model,
              max_tokens: 2500,
              system: prompt.system,
              messages: [{ role: "user", content: prompt.user }],
            }
          : {
              model: config.model,
              max_tokens: 2500,
              messages: [
                { role: "system", content: prompt.system },
                { role: "user", content: prompt.user },
              ],
            },
      ),
    },
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("The AI provider rejected the API key.");
    if (res.status === 429) throw new Error("The AI provider is rate limiting or out of credit. Check billing.");
    throw new Error("The AI provider returned an error (" + res.status + ").");
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    choices?: { message?: { content?: string } }[];
  };
  const text = anthropic
    ? data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")
    : data.choices?.[0]?.message?.content;
  if (!text) throw new Error("The AI provider returned an empty reply.");
  return text;
}
