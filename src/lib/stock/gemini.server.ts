export type GeminiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_INVALID_KEY"
  | "AI_PROVIDER_RATE"
  | "AI_MODEL"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE";

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; error: GeminiErrorCode };

export type GeminiHistoryItem = { role: "user" | "model"; text: string };

/** Server-only Gemini REST call. The API key is never sent to the browser. */
export async function callGemini(input: {
  system: string;
  prompt: string;
  history?: GeminiHistoryItem[];
  image?: { mimeType: string; data: string };
  maxOutputTokens?: number;
  responseMimeType?: "text/plain" | "application/json";
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";
  if (!apiKey) return { ok: false, error: "AI_NOT_CONFIGURED" };
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) return { ok: false, error: "AI_MODEL" };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
  if (input.image) parts.push({ inlineData: input.image });
  const history = (input.history ?? []).slice(-8).map((item) => ({
    role: item.role,
    parts: [{ text: item.text.slice(0, 1200) }],
  }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [...history, { role: "user", parts }],
        generationConfig: {
          maxOutputTokens: input.maxOutputTokens ?? 2048,
          responseMimeType: input.responseMimeType ?? "text/plain",
        },
      }),
    });
    if (!response.ok) {
      // Log only the status; never log the key, request body, or provider response body.
      console.error("Gemini request failed", response.status);
      if (response.status === 401 || response.status === 403) return { ok: false, error: "AI_INVALID_KEY" };
      if (response.status === 429) return { ok: false, error: "AI_PROVIDER_RATE" };
      if (response.status === 404) return { ok: false, error: "AI_MODEL" };
      return { ok: false, error: "AI_UNAVAILABLE" };
    }
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    return text ? { ok: true, text } : { ok: false, error: "AI_UNAVAILABLE" };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("Gemini request error", timedOut ? "timeout" : error instanceof Error ? error.name : "unknown");
    return { ok: false, error: timedOut ? "AI_TIMEOUT" : "AI_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
  }
}
