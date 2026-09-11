import { bc } from "../basecamp.js";
import type { CliContext } from "../context.js";
import { renderHelp, renderList, renderOutput, type Row } from "../toon.js";
import { fetchAssigned, assignedSchema } from "./report.js";
import { AxiError } from "../errors.js";

const HOME_LIMIT = 8;

export async function homeCommand(_args: string[], ctx: CliContext | undefined): Promise<string> {
  const blocks: string[] = [];
  let assigned: Awaited<ReturnType<typeof fetchAssigned>> | undefined;
  let failure: AxiError | undefined;
  try {
    assigned = await fetchAssigned(undefined, ctx);
  } catch (error) {
    failure = error instanceof AxiError ? error : new AxiError(String(error), "API_ERROR");
  }

  if (failure) {
    if (failure.code === "DEPENDENCY_MISSING" || failure.code === "AUTH_REQUIRED") {
      blocks.push(`basecamp: unavailable (${failure.message})`);
      blocks.push(renderHelp(failure.suggestions));
      return renderOutput(blocks);
    }
    blocks.push(`assigned: unavailable (${failure.message})`);
  }

  if (ctx?.project) {
    const project = await bc<Row>(["projects", "show", ctx.project.value], { account: ctx.account }).catch(() => undefined);
    blocks.push(project ? `project: ${project.data.name} (${project.data.id}, from ${ctx.project.source})` : `project: ${ctx.project.value} (from ${ctx.project.source})`);
  }

  if (assigned) {
    const { person, items } = assigned;
    if (items.length === 0) blocks.push(`assigned: 0 open items assigned to ${person}`);
    else {
      const overdue = items.filter((t) => t.due_on && new Date(`${t.due_on}T23:59:59`).getTime() < Date.now()).length;
      blocks.push(`assigned: ${items.length} open items for ${person}${overdue ? `, ${overdue} overdue` : ""}`);
      blocks.push(renderList("assigned", items.slice(0, HOME_LIMIT), assignedSchema));
    }
  }

  const hints: string[] = [];
  if (assigned && assigned.items.length > HOME_LIMIT) hints.push(`Run \`basecamp-axi report assigned\` for all ${assigned.items.length} items`);
  if (ctx?.project) {
    hints.push("Run `basecamp-axi todo list` to see this project's open todos");
    hints.push("Run `basecamp-axi message list` to see recent messages");
  } else {
    hints.push("Run `basecamp-axi project list` to find a project, then add `--in <id>` to project commands");
  }
  hints.push("Run `basecamp-axi todo view <id>` for details, `basecamp-axi todo done <id>` to complete");
  hints.push("Run `basecamp-axi url parse <url>` to turn a Basecamp link into ids");
  blocks.push(renderHelp(hints));
  return renderOutput(blocks);
}
