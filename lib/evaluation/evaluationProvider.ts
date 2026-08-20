/**
 * Phase M5 (platform-owned task submission evaluation): the provider
 * abstraction the testnet path is built against, so a future Anthropic-
 * backed provider can be substituted without changing the orchestration
 * that calls it.
 *
 *   EvaluationProvider
 *          |
 *          +-- TestnetDeterministicEvaluator (implemented, this phase)
 *          |
 *          +-- AnthropicEvaluator (future/mainnet -- NOT implemented here)
 *
 * lib/ai/evaluateSubmission.ts already exists, already works, and is left
 * completely untouched -- it is not wired to this interface yet, and
 * deliberately not adapted to it this phase (that adaptation is itself
 * "additional code" the current scope doesn't call for). The shapes here
 * are chosen so that adapting it later is a small, mechanical wrapper: its
 * three-value SubmissionVerdict maps directly onto EvaluationOutcome
 * (meets_requirements -> pass, does_not_meet_requirements -> fail,
 * partially_meets_requirements -> review), and its (taskTitle,
 * taskDescription, submissionContent) parameters are a subset of
 * EvaluationInput below.
 */

/**
 * "review" is not a fallback for errors alone -- it is the correct,
 * intended outcome whenever a provider cannot safely determine
 * acceptance/rejection at all, even in the total absence of any error.
 * Never collapse this into pass/fail as a default.
 */
export type EvaluationOutcome = "pass" | "fail" | "review";

export interface EvaluationInput {
  templateId: string;
  taskTitle: string;
  taskDescription: string;
  /** The claimed payload item's own content, if this is a payload-sourced
   * template -- null for a self-contained template. Split out the same way
   * TaskDetails.tsx already splits it for display (see
   * splitPayloadDescription), not re-derived independently here. */
  payloadContent: string | null;
  /** Tester release (Option A): the specific payload_items.id this task
   * instance was generated with, null for a self-contained template.
   * Lets a provider look up curated ground truth (lib/evaluation/
   * platformGroundTruth.ts) keyed by the real row id rather than guessing
   * from content alone. */
  payloadItemId: string | null;
  submissionContent: string;
}

export interface EvaluationResult {
  outcome: EvaluationOutcome;
  /** A plain-language reason, safe to store and safe to eventually surface
   * -- never containing raw prompt/model/implementation detail, consistent
   * with lib/ai/evaluateSubmission.ts's own feedback field. */
  reason: string;
}

export interface EvaluationProvider {
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}
