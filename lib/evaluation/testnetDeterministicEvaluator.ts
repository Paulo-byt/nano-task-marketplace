import type {
  EvaluationInput,
  EvaluationOutcome,
  EvaluationProvider,
  EvaluationResult,
} from "@/lib/evaluation/evaluationProvider";

/**
 * Phase M5, Arc Testnet path: an EvaluationProvider that makes no network
 * call at all -- no Anthropic, no other paid provider. Dispatches purely on
 * templateId, which template-specific rule (if any) applies is a fixed,
 * reviewed-in-advance mapping, never inferred from the submission itself.
 *
 * IMPORTANT, read before extending this file: the four label-classification
 * templates below (A2, A5, S4, R5) do NOT verify that the worker's chosen
 * label is *correct*. Verified directly against scripts/m3-payload-data.ts's
 * own file-level doc comment before writing this: every payload item is
 * "only the variable material a worker sees -- no reward/difficulty/
 * category/template metadata" -- there is no ground-truth expected label
 * stored anywhere for any payload item. What these four templates CAN
 * safely, deterministically check is FORMAT COMPLIANCE: did the worker
 * commit to exactly one of the task's own defined labels, with some
 * accompanying justification, as opposed to an empty, off-topic, or
 * multiply-hedged answer. A well-formed submission still becomes "pass"
 * here and can still reach ACCEPTED -- but "pass" means "this looks like a
 * genuine, on-format attempt," not "this is the right answer." Pretending
 * otherwise would be exactly the fabricated quality scoring this phase was
 * told not to build. The remaining seven templates (open-ended writing and
 * research) always route to "review" -- deterministic rules cannot safely
 * judge them at all, and this file does not pretend otherwise.
 */

const TEMPLATE_IDS = {
  W1: "91192558-9348-4d69-ba64-0125cff86401",
  R1: "97eb80c4-25f7-4ce8-aa20-76e698de3aae",
  R3: "dc23a626-7fc1-4ae8-b2bd-d32ce740cb54",
  W3: "ce24ba24-756a-4465-9fee-b0287fc9524f",
  W4: "d712eb09-654d-412b-81ce-0d4dec7f3ee2",
  R5: "a1558b46-a814-4a9b-add3-7fab1e61651c",
  A2: "ffb005a9-6497-4711-a036-daaa140e5935",
  A5: "f65c25dc-1f43-48a9-b6eb-e5c6ed16cffe",
  A4: "f5097692-4927-4f3e-90cb-1ff3fefc8299",
  S1: "6c4d0c6e-3d9d-472a-9923-b431e7adade8",
  S4: "42f90df8-21ad-43a1-9154-8931a7234b03",
} as const;

// Below this many characters of leftover text (after removing the matched
// label word itself), a "justification" is treated as not really present --
// deliberately small and conservative: this is a presence check, not a
// quality bar. Ambiguous, short-but-real justifications are meant to land
// in "review", not "fail".
const MIN_JUSTIFICATION_LENGTH = 10;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Shared by every label-classification template (A2/A5/S4/R5): checks that
 * the submission contains exactly one of the task's own valid labels, plus
 * some non-trivial text beyond the label itself. Never claims the chosen
 * label is the correct one -- see this file's own top-of-file comment.
 */
function evaluateSingleLabelClassification(
  content: string,
  validLabels: readonly string[]
): EvaluationResult {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { outcome: "fail", reason: "Submission is empty." };
  }

  const lower = trimmed.toLowerCase();
  const matched = validLabels.filter((label) =>
    new RegExp(`\\b${escapeRegex(label.toLowerCase())}\\b`).test(lower)
  );

  if (matched.length === 0) {
    return {
      outcome: "fail",
      reason: `Submission does not contain any of the expected labels (${validLabels.join(", ")}).`,
    };
  }

  if (matched.length > 1) {
    return {
      outcome: "review",
      reason: `Submission mentions multiple possible labels (${matched.join(
        ", "
      )}); cannot safely determine a single classification automatically.`,
    };
  }

  const withoutLabel = lower
    .replace(new RegExp(`\\b${escapeRegex(matched[0].toLowerCase())}\\b`), "")
    .trim();

  if (withoutLabel.length < MIN_JUSTIFICATION_LENGTH) {
    return {
      outcome: "review",
      reason: `A single label ("${matched[0]}") was identified, but no substantive justification accompanies it.`,
    };
  }

  return {
    outcome: "pass",
    reason:
      `Submission clearly selects "${matched[0]}" with an accompanying justification. ` +
      "Format-validated only -- this does not verify the label is factually correct, " +
      "since no ground-truth answer is stored for this payload item.",
  };
}

const OPEN_ENDED_REASON =
  "This template requires open-ended semantic judgment (writing or research " +
  "quality) that deterministic testnet evaluation cannot safely assess. " +
  "Routed to review by design, not due to an error.";

function alwaysReview(): EvaluationResult {
  return { outcome: "review", reason: OPEN_ENDED_REASON };
}

const A2_LABELS = ["positive", "neutral", "negative"] as const;
const A5_LABELS = [
  "billing issue",
  "technical bug",
  "how-to question",
  "complaint",
  "feature request",
] as const;
const S4_LABELS = ["constructive", "hostile", "confused", "excited", "neutral"] as const;
const R5_LABELS = ["defi", "nft/gaming", "infrastructure", "dao tooling", "identity"] as const;

type EvaluatorFn = (input: EvaluationInput) => EvaluationResult;

const TEMPLATE_EVALUATORS: Record<string, EvaluatorFn> = {
  [TEMPLATE_IDS.A2]: (input) =>
    evaluateSingleLabelClassification(input.submissionContent, A2_LABELS),
  [TEMPLATE_IDS.A5]: (input) =>
    evaluateSingleLabelClassification(input.submissionContent, A5_LABELS),
  [TEMPLATE_IDS.S4]: (input) =>
    evaluateSingleLabelClassification(input.submissionContent, S4_LABELS),
  [TEMPLATE_IDS.R5]: (input) =>
    evaluateSingleLabelClassification(input.submissionContent, R5_LABELS),
  // Open-ended templates: explicit entries (rather than relying purely on
  // the fallback below) so the mapping stays a complete, reviewable list of
  // all 11 templates, matching this file's own top-of-file claim.
  [TEMPLATE_IDS.W1]: alwaysReview,
  [TEMPLATE_IDS.W3]: alwaysReview,
  [TEMPLATE_IDS.W4]: alwaysReview,
  [TEMPLATE_IDS.R1]: alwaysReview,
  [TEMPLATE_IDS.R3]: alwaysReview,
  [TEMPLATE_IDS.A4]: alwaysReview,
  [TEMPLATE_IDS.S1]: alwaysReview,
};

export class TestnetDeterministicEvaluator implements EvaluationProvider {
  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const evaluator = TEMPLATE_EVALUATORS[input.templateId];

    if (!evaluator) {
      // An unrecognized templateId (e.g. a future template added after
      // this file) is exactly the "cannot safely determine" case -- never
      // silently pass or fail something this evaluator has no rule for.
      return {
        outcome: "review",
        reason: "No testnet evaluation rule exists yet for this template.",
      };
    }

    let result: EvaluationResult;
    try {
      result = evaluator(input);
    } catch {
      // Defense in depth: a rule throwing (malformed input, unexpected
      // shape) must never be mistaken for a pass or a fail.
      return {
        outcome: "review",
        reason: "Automated evaluation could not process this submission.",
      };
    }

    const outcome: EvaluationOutcome = result.outcome;
    return { outcome, reason: result.reason };
  }
}
