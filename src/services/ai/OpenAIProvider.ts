import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { AIProvider, ListingDraft, listingDraftSchema } from './AIProvider';

// OpenAI's Chat Completions HTTP API — one endpoint, no SDK needed (same
// approach as the Brevo email service).
// https://platform.openai.com/docs/api-reference/chat/create
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `You extract structured real-estate listing data from a Nigerian agent's free-text description.

Rules (do not break these):
- Only extract facts that are explicitly stated or unambiguously implied in the text.
- Never invent, guess, or estimate a value that is not present in the text (no "typical" prices, sizes, or amenities).
- If a field is not mentioned, its value MUST be null (or an empty array for amenities) — do not omit the field.
- "description" must always be filled: reproduce the agent's text, lightly cleaned up, but do not add facts to it.
- Respond with ONLY a single JSON object matching this exact shape, no prose, no markdown fences:

{
  "title": string | null,
  "description": string,
  "listingType": "rent" | "sale" | "shortlet" | null,
  "propertyType": "apartment" | "duplex" | "bungalow" | "terrace" | "detached_house" | "semi_detached_house" | "land" | "commercial" | "other" | null,
  "price": { "amount": number | null, "currency": string | null, "period": "yearly" | "monthly" | "one_time" | "nightly" | null },
  "location": { "country": string | null, "state": string | null, "city": string | null, "district": string | null, "address": string | null },
  "specifications": { "bedrooms": number | null, "bathrooms": number | null, "sizeSqm": number | null, "amenities": string[] }
}`;

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

export class OpenAIProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string = env.OPENAI_API_KEY ?? '', model: string = env.OPENAI_MODEL) {
    if (!apiKey) {
      // ApiError (not a plain Error) so this specific, safe-to-show message
      // survives the global error handler — same reasoning and same
      // pattern as upload.service.ts's Cloudinary check.
      throw new ApiError(500, 'AI-assisted listing extraction is not configured on the server yet');
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  async extractListingDraft(rawText: string): Promise<ListingDraft> {
    let res: Response;
    try {
      res = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          // JSON mode: the model is constrained to emit a single valid JSON
          // object (the system prompt spells out the shape). Deliberately no
          // temperature / token-limit params — newer model families reject
          // them, and the output is re-validated below regardless.
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: rawText },
          ],
        }),
      });
    } catch (err) {
      console.error('OpenAI request failed (network):', err);
      throw new ApiError(502, 'The AI assistant is temporarily unavailable. Please try again, or fill the form in yourself.');
    }

    if (!res.ok) {
      // The details (bad key, no credit, rate limit, wrong model name…) are
      // for the server logs only — never echoed to the client.
      const detail = await res.text().catch(() => '');
      console.error(`OpenAI request failed (${res.status}): ${detail}`);
      throw new ApiError(502, 'The AI assistant is temporarily unavailable. Please try again, or fill the form in yourself.');
    }

    const body = (await res.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI provider returned no text content');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      throw new Error('AI provider returned invalid JSON');
    }

    // Deterministic re-validation of the AI's own output shape — the model's
    // claim of "I followed the schema" is never trusted on its own.
    return listingDraftSchema.parse(parsedJson);
  }
}
