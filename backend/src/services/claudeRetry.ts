// services/claudeRetry.ts
// Retry wrapper for Claude API calls with rate limit (429) handling

import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 10_000;

/**
 * Wraps client.messages.create() with automatic retry on 429 rate limit errors.
 * Retries up to 2 times with a 10-second delay between attempts.
 * On final failure, throws a user-friendly error.
 */
export async function createWithRetry(
  client: Anthropic,
  params: MessageCreateParamsNonStreaming,
): Promise<Message> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (error: any) {
      const isRateLimit = error?.status === 429;
      if (!isRateLimit || attempt === MAX_RETRIES) {
        if (isRateLimit) {
          console.error(`[claudeRetry] Rate limited after ${MAX_RETRIES + 1} attempts`);
          throw new RateLimitError("High demand right now. Please wait 60 seconds and try again.");
        }
        throw error;
      }
      console.warn(`[claudeRetry] Rate limited (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  // Unreachable, but satisfies TypeScript
  throw new Error("Unexpected retry loop exit");
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}
