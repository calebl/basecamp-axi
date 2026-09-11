import { AxiError } from "axi-sdk-js";

export { AxiError };

export interface BasecampFailure {
  error?: string;
  code?: string;
  hint?: string;
}

export function basecampNotInstalledError(): AxiError {
  return new AxiError("The `basecamp` CLI is not installed or not on PATH", "DEPENDENCY_MISSING", [
    "Install it from https://github.com/basecamp/basecamp-cli and run `basecamp auth login`",
  ]);
}

/** Translate a basecamp CLI failure envelope into a structured AxiError. */
export function mapBasecampError(failure: BasecampFailure, exitCode: number): AxiError {
  const message = (failure.error ?? "").trim();
  const code = (failure.code ?? "").toLowerCase();
  const hint = failure.hint?.trim();

  if (code === "usage" || exitCode === 1) {
    const unknownOpt = /^Unknown option: (--?\S+)/.exec(message);
    if (unknownOpt) {
      return new AxiError(`The installed basecamp CLI does not support ${unknownOpt[1]}`, "DEPENDENCY_OUTDATED", [
        "Ask the user to run `basecamp upgrade`, then retry",
      ]);
    }
    return new AxiError(message || "Invalid usage", "VALIDATION_ERROR", hint ? [hint] : []);
  }

  const tool = /^(todoset|message board|campfire|vault|schedule|card table|questionnaire|inbox) not found: (\S+)/i.exec(message);
  if (tool) {
    const label: Record<string, string> = { todoset: "To-dos", "message board": "Message Board", campfire: "Chat", vault: "Docs & Files", schedule: "Schedule", "card table": "Card Table", questionnaire: "Check-ins", inbox: "Email Forwards" };
    const name = label[tool[1]!.toLowerCase()] ?? tool[1];
    return new AxiError(`The ${name} tool is not enabled in project ${tool[2]}`, "TOOL_DISABLED", [
      `Run \`basecamp-axi project view ${tool[2]}\` to see which tools are enabled`,
    ]);
  }

  const projectMatch = /projects\/(\d+)\.json/.exec(message);
  if (/failed to fetch project/i.test(message) || (projectMatch && /not found/i.test(message))) {
    return new AxiError(`Project ${projectMatch?.[1] ?? ""} not found`.replace("  ", " ").trim(), "NOT_FOUND", [
      "Run `basecamp-axi project list` to see available projects",
    ]);
  }

  if (code === "not_found" || exitCode === 2 || /not found/i.test(message)) {
    return new AxiError(stripUrls(message) || "Resource not found", "NOT_FOUND", [
      "Check the id, or pass a Basecamp URL to `basecamp-axi url parse <url>`",
    ]);
  }

  if (code === "auth" || exitCode === 3 || /unauthori[sz]ed|not authenticated|token/i.test(message)) {
    return new AxiError("Basecamp authentication required or expired", "AUTH_REQUIRED", [
      "Ask the user to run `basecamp auth login` in their terminal",
    ]);
  }

  if (code === "forbidden" || exitCode === 4) {
    return new AxiError(stripUrls(message) || "Access forbidden", "FORBIDDEN", [
      "Check that the account has access to this project",
    ]);
  }

  if (code === "rate_limit" || exitCode === 5) {
    return new AxiError("Basecamp rate limit reached", "RATE_LIMITED", ["Wait a moment and retry the same command"]);
  }

  if (code === "network" || exitCode === 6) {
    return new AxiError("Could not reach Basecamp", "NETWORK_ERROR", [
      "Check connectivity, then retry",
    ]);
  }

  if (code === "ambiguous" || exitCode === 8 || /ambiguous/i.test(message)) {
    return new AxiError(stripUrls(message) || "Ambiguous reference", "AMBIGUOUS", [
      hint ?? "Use a numeric id instead of a name",
    ]);
  }

  return new AxiError(stripUrls(message) || `Basecamp command failed (exit ${exitCode})`, "API_ERROR", hint ? [hint] : []);
}

function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/:\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
