import type {
  EvaluationInput,
  EvaluationOutcome,
  EvaluationProvider,
  EvaluationResult,
} from "@/lib/evaluation/evaluationProvider";
import {
  resolveActiveTemplate,
  type ActiveTemplateKey,
  A2_GROUND_TRUTH,
  A5_GROUND_TRUTH,
  S4_GROUND_TRUTH,
  R5_GROUND_TRUTH,
  A4_GROUND_TRUTH,
} from "@/lib/evaluation/platformGroundTruth";

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
 *
 * TESTER RELEASE (Option A) ADDITION: the paragraph above still describes
 * this file's ORIGINAL behavior, still used unchanged for every template
 * NOT in ACTIVE_TEMPLATE_IDS (the 6 paused templates' own already-in-flight
 * applications, and any future/unknown template). For the 5 active-tier
 * templates (A2/A5/S4/R5/A4), evaluateActiveTierSubmission below REPLACES
 * the format-only check with a real ground-truth match against
 * lib/evaluation/platformGroundTruth.ts, and never returns "review" --
 * only "pass" or "fail". This is what makes REVIEW a genuinely reachable,
 * permanent dead end for a platform-owned task's submission (no creator
 * session ever exists to resolve it): the fix is to stop returning it for
 * tester-visible active templates, not to build a resolution path for it.
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
// quality bar.
const MIN_JUSTIFICATION_LENGTH = 10;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Shared by every label-classification template (A2/A5/S4/R5, legacy path
 * only): checks that the submission contains exactly one of the task's own
 * valid labels, plus some non-trivial text beyond the label itself. Never
 * claims the chosen label is the correct one -- see this file's own
 * top-of-file comment. UNCHANGED from the pre-tester-release version; the
 * active-tier path below has its own, stricter matcher.
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

// Legacy, format-only path -- used ONLY for templates outside
// ACTIVE_TEMPLATE_IDS (the 6 paused templates' own already-in-flight
// applications). Byte-for-byte the same behavior as before the tester
// release.
const TEMPLATE_EVALUATORS: Record<string, EvaluatorFn> = {
  [TEMPLATE_IDS.A2]: (input) =>
    evaluateSingleLabelClassification(input.submissionContent, A2_LABELS),
  [TEMPLATE_IDS.A5]: (input) =>
    evaluateSingleLabelClassification(input.submissionContent, A5_LABELS),
  [TEMPLATE_IDS.S4]: (input) =>
    evaluateSingleLabelClassification(input.submissionContent, S4_LABELS),
  [TEMPLATE_IDS.R5]: (input) =>
    evaluateSingleLabelClassification(input.submissionContent, R5_LABELS),
  [TEMPLATE_IDS.W1]: alwaysReview,
  [TEMPLATE_IDS.W3]: alwaysReview,
  [TEMPLATE_IDS.W4]: alwaysReview,
  [TEMPLATE_IDS.R1]: alwaysReview,
  [TEMPLATE_IDS.R3]: alwaysReview,
  [TEMPLATE_IDS.A4]: alwaysReview,
  [TEMPLATE_IDS.S1]: alwaysReview,
};

// ---------------------------------------------------------------------------
// Tester release (Option A): active-tier strict binary evaluator.
// Never returns "review" -- only "pass" or "fail". Applies to A2/A5/S4/R5/A4
// only, gated by ACTIVE_TEMPLATE_ID_SET in the dispatcher at the bottom of
// this file.
// ---------------------------------------------------------------------------

/** A submission this short cannot contain a real answer for any active
 * template -- used as an absolute floor, never as proof of correctness at
 * the top end (a submission passing this check still has to clear the
 * ground-truth match below). */
const MIN_SUBMISSION_LENGTH = 3;

const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+|any\s+)?(the\s+|prior\s+|previous\s+|above\s+)?instructions/i,
  /disregard\s+(the\s+)?(system|above|prior|previous)\b/i,
  /you\s+are\s+now\s+(a|an)\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\bsystem\s+prompt\b/i,
  /override\s+(your\s+)?(instructions|rules|guidelines)/i,
  /pretend\s+(you|to)\s+(are|be)\b/i,
  /\bjailbreak\b/i,
];

function containsPromptInjection(content: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}

/** Catches "aaaaaaaa", keyboard-mash, and similar zero-effort spam: a long
 * run of the same character, or an absolute floor on distinct characters
 * used. Deliberately an absolute floor, not a unique-chars/length RATIO --
 * a ratio decays with length for entirely ordinary prose too (English
 * reuses its ~26-letter alphabet constantly over a long sentence), which a
 * ratio-based check would misfire on; real gibberish/spam stays stuck at a
 * handful of distinct characters no matter how long it is, which an
 * absolute floor catches without that false-positive risk. */
function isLowEntropySpam(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 8) return false;

  if (/(.)\1{7,}/.test(trimmed)) return true;

  const nonSpace = trimmed.toLowerCase().replace(/\s/g, "");
  if (nonSpace.length < 20) return false;
  const uniqueChars = new Set(nonSpace).size;
  return uniqueChars < 8;
}

/** Catches a submission that is mostly a verbatim copy of the task's own
 * instructions/payload rather than an actual answer -- a normalized,
 * whitespace-collapsed 40+ character run copied straight from the prompt
 * is not something a genuine, independent answer would ordinarily contain
 * by coincidence. */
function isCopyOfPrompt(submission: string, referenceText: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const normSubmission = normalize(submission);
  const normReference = normalize(referenceText);

  const WINDOW = 40;
  if (normSubmission.length < WINDOW || normReference.length < WINDOW) return false;

  for (let i = 0; i + WINDOW <= normSubmission.length; i += 10) {
    const chunk = normSubmission.slice(i, i + WINDOW);
    if (normReference.includes(chunk)) return true;
  }
  return false;
}

/**
 * Universal safety gate for the active tier -- runs before any
 * template-specific ground-truth check. Any hit here is an immediate,
 * unambiguous FAIL; nothing about ground truth needs to be consulted once
 * one of these fires.
 */
function activeTierSafetyCheck(input: EvaluationInput): EvaluationResult | null {
  const trimmed = input.submissionContent.trim();

  if (trimmed.length < MIN_SUBMISSION_LENGTH) {
    return { outcome: "fail", reason: "Submission is empty or too short to evaluate." };
  }

  if (containsPromptInjection(trimmed)) {
    return {
      outcome: "fail",
      reason:
        "Submission was not evaluated on its merits: it contains text attempting to " +
        "redirect or override the evaluation process rather than answering the task.",
    };
  }

  if (isLowEntropySpam(trimmed)) {
    return { outcome: "fail", reason: "Submission does not contain a real answer." };
  }

  const referenceText = input.payloadContent
    ? `${input.taskDescription} ${input.payloadContent}`
    : input.taskDescription;
  if (isCopyOfPrompt(trimmed, referenceText)) {
    return {
      outcome: "fail",
      reason: "Submission largely repeats the task's own instructions rather than answering it.",
    };
  }

  return null;
}

interface LabelMatch {
  outcome: "fail" | "matched";
  reason?: string;
  label?: string;
}

/** Active-tier label extraction -- same core regex approach as the legacy
 * evaluateSingleLabelClassification, but "multiple labels" and "no
 * justification" resolve to FAIL here (never "review"), matching the
 * tester-release requirement that these templates never return review. */
function matchSingleLabel(content: string, validLabels: readonly string[]): LabelMatch {
  const trimmed = content.trim();
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
      outcome: "fail",
      reason: `Submission mentions multiple possible labels (${matched.join(
        ", "
      )}); a single unambiguous classification is required.`,
    };
  }

  const withoutLabel = lower
    .replace(new RegExp(`\\b${escapeRegex(matched[0].toLowerCase())}\\b`), "")
    .trim();

  if (withoutLabel.length < MIN_JUSTIFICATION_LENGTH) {
    return {
      outcome: "fail",
      reason: `A label ("${matched[0]}") was identified, but no substantive justification accompanies it.`,
    };
  }

  return { outcome: "matched", label: matched[0].toLowerCase() };
}

function evaluateClassificationActiveTier(
  input: EvaluationInput,
  validLabels: readonly string[],
  groundTruth: Record<string, { acceptedLabels: readonly string[] }>
): EvaluationResult {
  const match = matchSingleLabel(input.submissionContent, validLabels);
  if (match.outcome === "fail") {
    return { outcome: "fail", reason: match.reason! };
  }

  if (!input.payloadItemId || !(input.payloadItemId in groundTruth)) {
    // Fails closed, per the tester-release requirement that an
    // unreviewed/ambiguous payload can never PASS. In normal operation this
    // should not be reachable for a NEW task (taskTemplatesService only
    // assigns curated payload ids to active-tier templates) -- this is the
    // defense-in-depth backstop for any task instance generated before that
    // gate existed.
    return {
      outcome: "fail",
      reason:
        "This task's specific content has not been fully verified yet, so it cannot " +
        "be automatically approved. No reward for this attempt -- please try a " +
        "different task.",
    };
  }

  const accepted = groundTruth[input.payloadItemId].acceptedLabels;
  if (!accepted.includes(match.label!)) {
    return {
      outcome: "fail",
      reason:
        "Submission's label does not match the reviewed classification for this " +
        "specific item.",
    };
  }

  return {
    outcome: "pass",
    reason: `Submission correctly classifies this item as "${match.label}".`,
  };
}

const NO_ERROR_PATTERN =
  /\bno\s+(factual\s+)?(errors?|inaccurac(y|ies))\b(\s+\w+){0,3}\s*\b(found|identified|noted|present)\b|found\s+no\s+errors?/i;

function claimsNoError(content: string): boolean {
  return NO_ERROR_PATTERN.test(content.trim());
}

function evaluateA4ActiveTier(input: EvaluationInput): EvaluationResult {
  if (!input.payloadItemId || !(input.payloadItemId in A4_GROUND_TRUTH)) {
    return {
      outcome: "fail",
      reason:
        "This task's specific content has not been fully verified yet, so it cannot " +
        "be automatically approved. No reward for this attempt -- please try a " +
        "different task.",
    };
  }

  const trimmed = input.submissionContent.trim();
  const truth = A4_GROUND_TRUTH[input.payloadItemId];
  const claimsClean = claimsNoError(trimmed);

  if (truth.status === "clean") {
    if (claimsClean) {
      return {
        outcome: "pass",
        reason: "Correctly identified that this paragraph contains no factual errors.",
      };
    }
    return {
      outcome: "fail",
      reason: "This paragraph is factually accurate -- the claimed error was not present.",
    };
  }

  // truth.status === "flawed"
  if (claimsClean) {
    return {
      outcome: "fail",
      reason: "This paragraph contains a factual error that the submission did not identify.",
    };
  }

  const lower = trimmed.toLowerCase();
  const foundRealError = (truth.errorTerms ?? []).some((term) =>
    lower.includes(term.toLowerCase())
  );

  if (!foundRealError) {
    return {
      outcome: "fail",
      reason:
        "Submission claims an error but does not identify the specific inaccuracy actually " +
        "present in this paragraph.",
    };
  }

  return {
    outcome: "pass",
    reason: "Correctly identified the specific factual error in this paragraph.",
  };
}

// Dispatches on the RESOLVED key (a stable literal: "A2"/"A5"/.../"A4"),
// never on input.templateId directly -- this is what makes the evaluator
// itself immune to task_templates.id changing on a future reseed. Which
// real database id maps to which key is entirely resolveActiveTemplate's
// (and, underneath it, platformGroundTruth.ts's title-based registry's)
// job, not this function's.
function evaluateActiveTierSubmission(
  input: EvaluationInput,
  key: ActiveTemplateKey
): EvaluationResult {
  const safetyFailure = activeTierSafetyCheck(input);
  if (safetyFailure) return safetyFailure;

  switch (key) {
    case "A2":
      return evaluateClassificationActiveTier(input, A2_LABELS, A2_GROUND_TRUTH);
    case "A5":
      return evaluateClassificationActiveTier(input, A5_LABELS, A5_GROUND_TRUTH);
    case "S4":
      return evaluateClassificationActiveTier(input, S4_LABELS, S4_GROUND_TRUTH);
    case "R5":
      return evaluateClassificationActiveTier(input, R5_LABELS, R5_GROUND_TRUTH);
    case "A4":
      return evaluateA4ActiveTier(input);
  }
}

export class TestnetDeterministicEvaluator implements EvaluationProvider {
  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const resolution = await resolveActiveTemplate(input.templateId);

    if (resolution.status === "unresolvable") {
      // The active-template registry itself couldn't be trusted right now
      // (see platformGroundTruth.ts's own doc comment) -- fails closed to
      // FAIL, never "review", since this templateId might genuinely belong
      // to an active-tier template we just can't currently confirm.
      return {
        outcome: "fail",
        reason:
          "Automated evaluation is temporarily unable to verify this task's template " +
          "identity. Please try again shortly.",
      };
    }

    if (resolution.status === "resolved") {
      try {
        return evaluateActiveTierSubmission(input, resolution.key);
      } catch {
        // Defense in depth: a rule throwing must never be mistaken for a
        // pass, and per the tester-release requirement must not become
        // "review" either -- fails closed to FAIL.
        return {
          outcome: "fail",
          reason: "Automated evaluation could not process this submission.",
        };
      }
    }

    // resolution.status === "not_active" -- legacy path, byte-for-byte
    // unchanged from before this fix.
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
      return {
        outcome: "review",
        reason: "Automated evaluation could not process this submission.",
      };
    }

    const outcome: EvaluationOutcome = result.outcome;
    return { outcome, reason: result.reason };
  }
}
