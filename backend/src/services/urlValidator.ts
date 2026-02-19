// services/urlValidator.ts
// URL validation for recipe imports: paywall detection + AI recipe page verification

import Anthropic from "@anthropic-ai/sdk";
import { createWithRetry } from "./claudeRetry";

const PAYWALL_DOMAINS = [
  "cooking.nytimes.com",
  "www.cooksillustrated.com",
  "www.americastestkitchen.com",
  "www.cookscountry.com",
];

/**
 * Check whether a URL belongs to a known paywalled recipe site.
 * Pure string check — zero AI cost.
 */
export function isPaywalledDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return PAYWALL_DOMAINS.includes(hostname);
  } catch {
    return false;
  }
}

/**
 * Check whether a string is a valid HTTP(S) URL.
 */
export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Extract a human-readable recipe name from a URL slug.
 * e.g. "/recipes/chicken-parmesan-1234" → "Chicken Parmesan"
 */
export function extractNameFromUrlSlug(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    // Take the last meaningful path segment
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const last = segments[segments.length - 1];
    // Strip trailing ID numbers (e.g. "chicken-parmesan-1234567")
    const cleaned = last.replace(/-\d+$/, "");
    if (!cleaned || cleaned.length < 3) return null;
    // Convert kebab-case to title case
    return cleaned
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  } catch {
    return null;
  }
}

export interface UrlValidationResult {
  status: "recipe" | "paywall" | "not_recipe";
  detected_recipe_name: string | null;
  source_name: string | null;
  alternative_url: string | null;
  reason: string | null;
}

/**
 * Use Claude with web_search to determine whether a URL points to an actual recipe page.
 * On any failure, defaults to status: "recipe" so existing behavior is preserved.
 */
export async function validateRecipeUrl(
  url: string,
  client: Anthropic,
): Promise<UrlValidationResult> {
  // Fast path: known paywall domains
  if (isPaywalledDomain(url)) {
    return {
      status: "paywall",
      detected_recipe_name: extractNameFromUrlSlug(url),
      source_name: null,
      alternative_url: null,
      reason: "This recipe is behind a paywall. Ingredients will be estimated by AI.",
    };
  }

  try {
    const message = await createWithRetry(client, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 3 } as any,
      ],
      system: `You are a URL classifier for a recipe app. Given a URL, determine whether it points to a specific recipe page.

Return ONLY a JSON object with this structure:
{
  "status": "recipe" | "not_recipe",
  "detected_recipe_name": "Recipe Name" or null,
  "source_name": "Website Name" or null,
  "alternative_url": "https://..." or null,
  "reason": "explanation" or null
}

Rules:
- "recipe": The URL is a specific recipe page with ingredients and instructions
- "not_recipe": The URL is a homepage, search results page, article listing, category page, blog post without a recipe, or any other non-recipe page
- If status is "not_recipe", set "reason" to a short user-friendly explanation (e.g. "This appears to be a homepage, not a specific recipe")
- If status is "not_recipe" and you can identify what recipe the user might be looking for, search for it and provide an "alternative_url" pointing to an actual recipe page
- detected_recipe_name: The name of the recipe if you can determine it
- source_name: The website name

Return ONLY valid JSON. No markdown fences, no explanation.`,
      messages: [
        { role: "user", content: `Classify this URL: ${url}` },
      ],
    });

    let lastText = "";
    for (const block of message.content) {
      if ((block as any).type === "text") {
        lastText = (block as any).text;
      }
    }

    if (!lastText) {
      console.warn("[urlValidator] No text response from Claude, defaulting to recipe");
      return defaultResult();
    }

    const cleaned = lastText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    const objStart = cleaned.indexOf("{");
    const objEnd = cleaned.lastIndexOf("}");
    if (objStart === -1 || objEnd === -1) {
      console.warn("[urlValidator] No JSON found in response, defaulting to recipe");
      return defaultResult();
    }

    const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));

    const status = parsed.status === "not_recipe" ? "not_recipe" : "recipe";

    return {
      status,
      detected_recipe_name: parsed.detected_recipe_name || null,
      source_name: parsed.source_name || null,
      alternative_url: parsed.alternative_url || null,
      reason: parsed.reason || null,
    };
  } catch (error: any) {
    console.error("[urlValidator] Validation failed, defaulting to recipe:", error.message);
    return defaultResult();
  }
}

function defaultResult(): UrlValidationResult {
  return {
    status: "recipe",
    detected_recipe_name: null,
    source_name: null,
    alternative_url: null,
    reason: null,
  };
}
