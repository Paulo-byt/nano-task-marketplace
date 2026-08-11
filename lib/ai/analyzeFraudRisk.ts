import Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/ai/client";
import type { FraudRiskLevel, FraudSignals } from "@/services/fraud/fraudSignalsService";

export class FraudAnalysisError extends Error {}

export interface FraudAssessmentResult {
  riskLevel: FraudRiskLevel;
  explanation: string;
}

const ALLOWED_RISK_LEVELS = ["low", "medium", "high"] as const;

const MAX_EXPLANATION_LENGTH = 1000;

// Explanation must stay advisory. This is a defense-in-depth check on top
// of the system prompt's instruction, mirroring the never-trust-one-layer
// ethic already established for evaluateSubmission.ts's isValidEvaluation
// -- an instruction alone is a request, not a guarantee, and mislabeling a
// worker as fraudulent is a real fairness harm serious enough to warrant a
// second, enforced check rather than relying on the prompt alone.
const BANNED_TERMS = [
  "fraud",
  "fraudulent",
  "guilty",
  "cheat",
  "cheating",
  "cheater",
  "scam",
  "scamming",
  "criminal",
  "thief",
  "stealing",
  "steals",
];

// No wallet addresses and no raw submission content are ever included here
// -- only pre-computed, pre-thresholded facts about this applicant's
// behavior. Signal 5 (duplicate content) passes a match count, never the
// duplicated text itself. Claude synthesizes signals that are already
// known to be flagged or not; it does not discover patterns from raw data.
const SYSTEM_PROMPT = `You are producing an advisory fraud-risk assessment for a creator reviewing a worker's submission on Nano Task Marketplace, a platform where people complete small tasks for small USDC rewards.

You will be given a small set of deterministic signals that have already been computed and pre-thresholded by the application. You are not detecting patterns yourself -- you are synthesizing signals that are already known to be triggered or not triggered. Do not invent, assume, or infer any additional signals beyond what you are given.

Critical rules:
- Every signal here can have a legitimate, innocent explanation (a fast worker, a coincidence, a shared personal template, a new but genuine user). Treat triggered signals as suspicious indicators worth a closer look, never as proof of wrongdoing.
- Self-application (the applicant is also this task's own creator) is the one unambiguous signal. If it is triggered, that alone is a reasonable basis for a "high" risk level.
- For every other signal, a single triggered signal alone should usually NOT produce a "high" risk level. Reserve "high" for self-application, or for a combination of multiple simultaneously triggered signals that reinforce each other.
- NEVER state or imply that the worker is fraudulent, guilty, cheating, scamming, or a criminal. Do not use accusatory language of any kind, and do not render a verdict on the person.
- Use hedged, advisory language such as "low risk", "some suspicious activity was detected", "several signals warrant additional review", or "high risk indicators are present." Describe what was observed, not a conclusion about the person.
- The creator remains fully responsible for deciding whether to approve, reject, evaluate, or pay this worker. Your assessment is advisory input only, not a decision, and nothing about it blocks or automates any action.

Call the assess_fraud_risk tool with:
- riskLevel: exactly one of low, medium, high.
- explanation: a concise, specific, advisory explanation (under ${MAX_EXPLANATION_LENGTH} characters) of which signals contributed and why, addressed to the task creator, using the hedged language described above.`;

const ASSESS_FRAUD_RISK_TOOL: Anthropic.Tool = {
  name: "assess_fraud_risk",
  description: "Submit the advisory fraud-risk assessment for a worker's submission.",
  input_schema: {
    type: "object",
    properties: {
      riskLevel: { type: "string", enum: [...ALLOWED_RISK_LEVELS] },
      explanation: { type: "string" },
    },
    required: ["riskLevel", "explanation"],
  },
};

function describeTrigger(triggered: boolean): string {
  return triggered ? "TRIGGERED" : "not triggered";
}

function formatSignalsForPrompt(taskTitle: string, signals: FraudSignals): string {
  const approvalToSubmission =
    signals.rapidApprovalToSubmission.secondsElapsed === null
      ? "unknown (no approval timestamp on record)"
      : `${signals.rapidApprovalToSubmission.secondsElapsed.toFixed(1)}s`;

  return `Task: "${taskTitle}"

Deterministic signals computed by the application (thresholds are fixed, conservative starting heuristics for a brand-new product with no historical data yet -- not proof of fraud):

1. Self-application (applicant is also this task's creator): ${describeTrigger(signals.selfApplication.triggered)}
2. Time from approval to submission: ${approvalToSubmission} (flagged if under 60s): ${describeTrigger(signals.rapidApprovalToSubmission.triggered)}
3. Applications by this worker in the last hour: ${signals.applicationVelocity.countLastHour} (flagged if more than 10): ${describeTrigger(signals.applicationVelocity.triggered)}
4. Submissions by this worker in the last hour: ${signals.submissionVelocity.countLastHour} (flagged if more than 5): ${describeTrigger(signals.submissionVelocity.triggered)}
5. Exact duplicate submission content from this same worker: ${signals.duplicateSubmissionContent.matchCount} matching prior submission(s) found (flagged if any): ${describeTrigger(signals.duplicateSubmissionContent.triggered)}
6. This worker's prior submissions rated "does not meet requirements": ${signals.repeatedFailedEvaluations.failedCount} (flagged if 2 or more): ${describeTrigger(signals.repeatedFailedEvaluations.triggered)}
7. New account with high activity: account age ${signals.newAccountHighActivity.accountAgeHours.toFixed(1)}h, ${signals.newAccountHighActivity.lifetimeApplicationCount} lifetime application(s) (flagged if account under 24h old AND more than 5 applications): ${describeTrigger(signals.newAccountHighActivity.triggered)}

Synthesize these into an overall risk level and a brief, hedged explanation for the task creator.`;
}

function containsBannedTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_TERMS.some((term) => lower.includes(term));
}

/**
 * Defensive re-validation of Claude's tool-call output, the same
 * never-trust-one-layer ethic as evaluateSubmission.ts's isValidEvaluation
 * -- plus a content check the evaluation path doesn't need, since an
 * accusatory word here is a fairness harm the system prompt alone cannot
 * guarantee against.
 */
function isValidAssessment(value: unknown): value is FraudAssessmentResult {
  if (typeof value !== "object" || value === null) return false;
  const assessment = value as Record<string, unknown>;

  return (
    typeof assessment.riskLevel === "string" &&
    (ALLOWED_RISK_LEVELS as readonly string[]).includes(assessment.riskLevel) &&
    typeof assessment.explanation === "string" &&
    assessment.explanation.trim().length > 0 &&
    assessment.explanation.length <= MAX_EXPLANATION_LENGTH &&
    !containsBannedTerm(assessment.explanation)
  );
}

/**
 * Synthesizes pre-computed, pre-thresholded fraud signals into an advisory
 * risk level + explanation. Callers should skip this entirely when no
 * signal is triggered (see fraudSignalsService.anySignalTriggered) and
 * record a "low" assessment directly instead -- there is nothing for
 * Claude to usefully synthesize from an all-clear signal set, and skipping
 * the call avoids unnecessary API cost.
 */
export async function analyzeFraudRisk(
  taskTitle: string,
  signals: FraudSignals
): Promise<FraudAssessmentResult> {
  const userMessage = formatSignalsForPrompt(taskTitle, signals);

  let response;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [ASSESS_FRAUD_RISK_TOOL],
      tool_choice: { type: "tool", name: "assess_fraud_risk" },
    });
  } catch (err) {
    throw new FraudAnalysisError(
      `Failed to reach Claude: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new FraudAnalysisError("Claude did not return a tool call.");
  }

  const assessment = toolUse.input;
  if (!isValidAssessment(assessment)) {
    throw new FraudAnalysisError("Claude's response failed validation.");
  }

  return {
    riskLevel: assessment.riskLevel as FraudRiskLevel,
    explanation: assessment.explanation.trim(),
  };
}
