import { reactive, toRaw } from "vue";
import { z } from "zod";
import {
  seed,
  workspaceSchema,
  applyCommand,
  type Command,
  type Workspace,
} from "../shared/domain";
const cache = "ledgerly.v3.sample";
function load() {
  try {
    return workspaceSchema.parse(
      JSON.parse(sessionStorage.getItem(cache) || "null"),
    );
  } catch {
    return seed();
  }
}
export const workspace = reactive({
  data: load(),
  mode: "sample" as "sample" | "live",
  busy: false,
  error: "",
  notice: "",
  key: "",
});
const api = (path: string) => `${import.meta.env.BASE_URL}api/${path}`;
export async function request(
  path: string,
  body?: unknown,
  key = workspace.key,
) {
  const response = await fetch(api(path), {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(40000),
    credentials: "same-origin",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
export async function run(action: () => Promise<void>) {
  if (workspace.busy) return;
  workspace.busy = true;
  workspace.error = "";
  workspace.notice = "";
  try {
    await action();
  } catch (e) {
    workspace.error =
      e instanceof z.ZodError
        ? e.issues[0]?.message || "Check the required fields."
        : e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.";
  } finally {
    workspace.busy = false;
  }
}
export async function execute(command: Command) {
  const next: Workspace =
    workspace.mode === "sample"
      ? applyCommand(toRaw(workspace.data), command)
      : workspaceSchema.parse(
          await request("commands", {
            command,
            version: workspace.data.version,
          }),
        );
  workspace.data = next;
  if (workspace.mode === "sample") {
    try {
      sessionStorage.setItem(cache, JSON.stringify(next));
    } catch {
      workspace.notice =
        "Browser storage is unavailable. Changes will last only until reload.";
    }
  }
}
export async function connect(key: string) {
  if (key.startsWith("sk-"))
    throw new Error(
      "Use your Ledgerly demo access key, not an OpenAI API key.",
    );
  if (!key.trim()) throw new Error("Enter a demo access key.");
  const data = workspaceSchema.parse(await request("session", {}, key));
  workspace.key = key;
  workspace.data = data;
  workspace.mode = "live";
}
export function disconnect() {
  workspace.key = "";
  workspace.mode = "sample";
  workspace.data = load();
  workspace.error = "";
}
export async function refresh() {
  if (workspace.mode === "live")
    workspace.data = workspaceSchema.parse(await request("workspace"));
  else workspace.data = load();
}
