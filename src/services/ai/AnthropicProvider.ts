import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { AIProvider, ListingDraft, listingDraftSchema } from './AIProvider';

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

export class AnthropicProvider implements AIProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string = env.ANTHROPIC_API_KEY ?? '', model: string = env.AI_MODEL) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async extractListingDraft(rawText: string): Promise<ListingDraft> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: rawText }],
    });

    const block = response.content.find((c) => c.type === 'text');
    if (!block || block.type !== 'text') {
      throw new Error('AI provider returned no text content');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(block.text);
    } catch {
      throw new Error('AI provider returned invalid JSON');
    }

    // Deterministic re-validation of the AI's own output shape — the model's
    // claim of "I followed the schema" is never trusted on its own.
    return listingDraftSchema.parse(parsedJson);
  }
}
