// Structured logging over the codebase's existing console.log/console.error
// convention -- not a new logging framework, just a consistent shape so
// output stays greppable. Deliberately minimal: no external service, no
// aggregation, no dashboard -- see the Phase 9 plan for why that's
// out of scope right now.
//
// NEVER pass: private keys, API keys, DATABASE_URL, session cookie values,
// full SIWE messages/signatures, or raw task/submission content. Log IDs
// and safe metadata instead -- the same principle already applied to what
// gets sent to Claude in lib/ai/*.

type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, string | number | boolean | null | undefined>;

function emit(level: LogLevel, event: string, context?: LogContext): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  info: (event: string, context?: LogContext) => emit("info", event, context),
  warn: (event: string, context?: LogContext) => emit("warn", event, context),
  error: (event: string, context?: LogContext) => emit("error", event, context),
};
