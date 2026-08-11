# Legal Review Checklist

**This document asks questions. It does not answer them.** Nothing here is legal advice, a legal conclusion, or a substitute for a qualified lawyer/compliance professional. Its only purpose is to hand a reviewer an accurate, grounded list of what needs to be resolved before [`/terms`](../app/terms/page.tsx), [`/privacy`](../app/privacy/page.tsx), and [`/payment-disclosure`](../app/payment-disclosure/page.tsx) could become real, final documents.

Each item below includes a short, factual note on what the application *actually does today* (verified directly against the current source, not assumed), so a reviewer has real context — not a description of an intended, aspirational, or different system. Where a note is absent, nothing specific to today's implementation changes the question.

---

## Regulatory & jurisdictional

### 1. Governing jurisdiction and applicable law
- Which jurisdiction's law should govern the platform's terms, and why?
- Has the operating entity (if any yet exists) been identified, and does that determine the answer?

### 2. Geographic availability
- Should the platform be available worldwide, as the product description ("anyone in the world with a wallet") currently implies, or restricted to specific countries?
- *Current implementation note:* nothing in the codebase restricts access by geography today.

### 3. KYC/AML obligations
- Does this platform's activity (facilitating USDC transfers between users) trigger any KYC or AML obligation in any jurisdiction it operates in?
- If so, at what transaction size or frequency, and who is responsible for implementing it?
- *Current implementation note:* no identity verification beyond a wallet address exists anywhere in the application.

### 4. Money-transmission / payment-service considerations
- Does facilitating a `transferFrom` between two wallets (see item 9) constitute money transmission, a payment service, or similar regulated activity in any relevant jurisdiction?
- Does the answer differ between the raw-key executor path and the Circle-managed executor path?

### 5. Sanctions screening
- Is sanctions screening (e.g., OFAC or equivalent) required for either task creators, workers, or both, before this could run with real funds?
- *Current implementation note:* no sanctions or denylist screening of any kind exists today.

### 6. Consumer protection
- Do consumer-protection obligations apply given the platform's global, wallet-only, non-KYC'd user base?
- Does the answer change based on reward size ($0.01–$5.00 per task) or aggregate exposure?

### 7. Age restrictions
- What minimum age, if any, should be required to use the platform, and how would it realistically be enforced given there is no identity verification?
- *Current implementation note:* no age gate or age-related question exists anywhere today.

### 8. Prohibited jurisdictions / users
- Should any jurisdictions or user categories be explicitly excluded (e.g., sanctioned countries, restricted persons)?
- *Current implementation note:* no such exclusion mechanism exists today.

---

## Payments, custody & the underlying assets

### 9. Wallet custody / non-custody characterization
- Does the description in [`/payment-disclosure`](../app/payment-disclosure/page.tsx) — that the platform is non-custodial because the "executor" only submits an already-authorized `transferFrom` and funds move directly creator → worker — hold up as a legal characterization, not just a technical one?
- Does that characterization change between the two payout-signing paths: a platform-held raw private key (`lib/arc/executor.ts`) versus a Circle-managed wallet (`lib/circle/executorWallet.ts`)?
- *Current implementation note:* both paths are functionally non-custodial in the same way — the difference is only who/what holds the signing key, verified directly in `lib/arc/payoutRelay.ts`.

### 10. USDC / stablecoin considerations
- Are there stablecoin-specific regulatory considerations (in any relevant jurisdiction) that apply once this handles real USDC rather than testnet USDC?
- *Current implementation note:* every transaction today is on Arc **Testnet**; no mainnet code path exists anywhere in the codebase.

### 11. The existing post-approval decline limitation
- Once a creator approves a worker's application, the application's status can never return to "rejected" — confirmed directly in `app/api/tasks/[taskId]/applicants/[applicationId]/reject/route.ts`, whose own guard only allows rejection while status is still `"applied"`. There is no in-app mechanism to decline, reverse, or contest an approval after the fact, short of the creator simply never releasing payout.
- Is this an acceptable product behavior to ship as-is, or does it need a remediation/dispute path before this could be considered production-ready?
- If a payout has already been released, is there any obligation (legal or otherwise) to offer recourse, given transfers are on-chain and irreversible?

### 12. Refunds and disputes generally
- Beyond item 11, should the platform offer any refund or dispute-resolution mechanism at all, given blockchain transfers are irreversible by design?
- If a dispute-resolution mechanism is required, does it need to be built into the product, or can it be a purely off-platform/contractual process?

### 13. Dispute resolution mechanism
- Should disputes be resolved by arbitration, litigation, or another mechanism — and in which venue?

### 14. Liability limitations
- What limitation-of-liability and disclaimer language is appropriate given the platform never custodies funds but does select, run, and rely on the code that authorizes transfers?
- Does using AI-assisted (advisory-only) evaluation and fraud-risk features change the liability analysis?

---

## Privacy, data & AI

### 15. Privacy / data protection compliance
- Which specific data-protection regime(s) (e.g., GDPR, NDPR, CCPA, others) actually apply, given the platform's stated worldwide availability?
- What legal basis would apply to each category of data described in [`/privacy`](../app/privacy/page.tsx) (wallet address, session data, task/application/submission content, fraud-assessment data, technical logs)?

### 16. Fraud-detection data retention
- `fraud_assessments` rows (risk level, explanation, and a full signals snapshot) are never deleted or overwritten — confirmed in `services/fraud/fraudSignalsService.ts`; multiple assessments per application are kept indefinitely by design. Is an indefinite retention period acceptable, and if not, what should replace it?
- Should a user (creator or worker) be able to request deletion of fraud-assessment data concerning them, and is that even technically meaningful given it's tied to an application record, not a standalone profile?

### 17. AI / Anthropic data processing
- Submission content (worker-authored, potentially containing anything the worker chose to write) is sent to Anthropic's API for advisory evaluation — confirmed in `lib/ai/evaluateSubmission.ts`. Is a specific AI-processing disclosure or consent mechanism required beyond what [`/privacy`](../app/privacy/page.tsx) currently describes?
- Fraud-risk analysis sends only pre-computed, pre-thresholded signal values to Anthropic — never a wallet address or raw submission content, confirmed in `lib/ai/analyzeFraudRisk.ts`'s explicit design and code comments. Does this distinction matter for any applicable data-protection analysis?
- Is Anthropic's own data-processing/retention policy for API inputs (as opposed to this platform's own policy) something that needs to be separately disclosed to users?

### 18. International data transfers
- Given Neon (database), Anthropic, and Circle are all third-party processors of some category of user data, does any cross-border transfer mechanism (e.g., SCCs or equivalent) need to be assessed or documented?

---

## Platform terms

### 19. Intellectual property
- Who owns the content of a posted task, and who owns a worker's submitted content — the respective author, the platform, or a license arrangement?
- Does AI-assisted task drafting (Claude proposing a task from a creator's hint) raise any IP-ownership question of its own?

### 20. Account termination
- Under what conditions should the platform be able to suspend or terminate a wallet's access, and what happens to that wallet's in-flight tasks/applications/pending payouts if it does?
- *Current implementation note:* no suspension or termination mechanism exists in the application today — a wallet's access is not currently revocable by the platform at all.

---

## Third-party terms of service

Each of the following is a service this platform actually integrates with today (confirmed directly in source and dependencies, not assumed) — a reviewer needs to confirm this platform's own usage stays within, and correctly references, each provider's actual current terms:

### 21. Circle terms
- `@circle-fin/app-kit` (wallet connection) and, when `PAYOUT_CUSTODY_MODE=circle` is enabled, `@circle-fin/developer-controlled-wallets` (payout signing) are both in active use. Do Circle's own developer/API terms impose any obligation on how this platform must represent Circle's role to end users?

### 22. Arc terms
- The platform runs exclusively on Arc **Testnet** today (`lib/arc/chains.ts`, chain id `5042002`, hardcoded). Are there Arc network terms of use that apply even at the testnet stage, and separately, what would apply once/if a mainnet deployment is ever authorized?

### 23. Anthropic terms
- `@anthropic-ai/sdk` is used for all three AI-assisted features (task drafting, submission evaluation, fraud-risk synthesis). Does this platform's use of Claude — including feeding it worker-submitted content — comply with Anthropic's usage policies?

### 24. Hosting / provider terms
- Neon (database) is in active use today. Vercel is the intended, but not yet actual, hosting target (`docs/DEPLOYMENT.md`) — no deployment exists yet. Do either provider's terms impose obligations (e.g., data-processing addenda, acceptable-use terms) that need to be reflected in this platform's own policies before a real deployment?

---

## How to use this document

This checklist is meant to be worked through by a qualified legal/compliance reviewer alongside the three draft pages it supports. As each question is resolved, the corresponding placeholder section in [`/terms`](../app/terms/page.tsx), [`/privacy`](../app/privacy/page.tsx), or [`/payment-disclosure`](../app/payment-disclosure/page.tsx) can be replaced with real, reviewed language — and the "PENDING LEGAL REVIEW" banners removed only once that page's content has actually been reviewed and approved, not before.
