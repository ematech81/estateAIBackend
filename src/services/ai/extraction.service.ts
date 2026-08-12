import { AIProvider, ListingDraft } from './AIProvider';
import { AnthropicProvider } from './AnthropicProvider';

let provider: AIProvider | undefined;

/**
 * Lazily constructs the configured AIProvider on first use, so the app can
 * boot (and non-AI tests can run) without ANTHROPIC_API_KEY set. Swapping
 * providers later means changing this one function, nothing that calls it.
 */
function getProvider(): AIProvider {
  if (!provider) {
    provider = new AnthropicProvider();
  }
  return provider;
}

/** Test-only hook to inject a mock/fake AIProvider instead of hitting a real API. */
export function setAIProvider(mock: AIProvider): void {
  provider = mock;
}

export async function extractListingDraft(rawText: string): Promise<ListingDraft> {
  return getProvider().extractListingDraft(rawText);
}
