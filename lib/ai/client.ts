import Anthropic from "@anthropic-ai/sdk";

// Hard runtime guard: this module derives a client from a server-only
// secret and must never execute in a browser. Belt-and-suspenders alongside
// the fact that ANTHROPIC_API_KEY (no NEXT_PUBLIC_ prefix) is never inlined
// into a client bundle by Next.js in the first place, and alongside the
// codebase convention already established by lib/arc/executor.ts: this file
// is only ever imported from app/api/* Route Handlers, never from a
// component or hook.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/ai/client.ts must never run in a browser -- it derives the " +
      "server-only Anthropic client from ANTHROPIC_API_KEY."
  );
}

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  throw new Error(
    "ANTHROPIC_API_KEY is not set. Add it to .env.local (server-only, never committed)."
  );
}

export const anthropic = new Anthropic({ apiKey });

// Verified against docs.claude.com's models overview at implementation time
// (dateless, pinned-snapshot API ID -- see "Model IDs and versioning" in
// the Anthropic docs). Re-confirm there if this ever needs to change.
export const CLAUDE_MODEL = "claude-sonnet-5";
