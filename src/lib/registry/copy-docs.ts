import "server-only";

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import {
  cellText,
  copyMarkdown,
  copyParts,
  readCopy,
  replaceCopy,
} from "@/lib/copy-doc-build";
import { reviewCopy, rowsFromTable, type PastedRow } from "@/lib/copy-import";
import { tablesFromDocXml } from "@/lib/doc-xml";
import { getPrototypeHistory } from "@/lib/registry";
import { LATEST, mintShareToken } from "@/lib/share";

import {
  readStudioFile,
  updateStudioFile,
  workingCopiesOn,
  workingFolder,
} from "./local-prototypes";

/**
 * A prototype's copy document, made on this machine only. The document is built here from the prototype's words (`src/lib/copy.ts`), with no
 * model reading anything: a section for each group of lines, and in it a table (what, key, current English, suggested English, German, status),
 * as the team's copy docs are. Claude Code is only the hand that puts it in the two places, because only it holds the logins to Claude Docs and
 * Notion; each run is told the exact text and nothing else, and is given only the one service it writes to, since everything a run is connected
 * to is read afresh into its context, and that is what a run costs (measured: no connections $0.001, Notion alone $0.014, everything $0.5 to $2).
 * What it made is kept in the folder's `.studio/copy-docs.json`: where each document is, and what is being done now, so the menu can say.
 */
export type CopyDoc = {
  url: string;
  title: string;
  at: string;
  /** Pasted in, made elsewhere: taking it away only takes it off the list, and the document itself is left alone. */
  linked?: true;
  /** The id of the doc's body, learnt on the first pull so later ones are a single read. */
  body?: string;
  /**
   * What the Claude doc says in its Current English column, by section and row, as of when it was made or last brought up to date: how a change in the prototype's
   * words is found later, and which cell it belongs in. A linked doc has none, since nothing is known of how it was made.
   */
  snapshot?: { name: string; rows: { key: string; value: string }[] }[];
};
export type CopyTask = {
  kind: "create" | "delete" | "update";
  state: "running" | "failed";
  step: string;
  at: string;
  error?: string;
};
export type CopyDocs = {
  /**
   * A document being deleted where it is. It is off the list at once (the doc is deleted by the studio in the background, so the page needn't wait or stay open);
   * what is kept here is only so that, if the delete fails or is cut short, it can be found again: with `error` set, or left too long, the menu offers it back.
   */
  pendingDeletes?: Partial<Record<CopyKind, { doc: CopyDoc; at: string; error?: string }>>;
  /** The lines last chosen for a document, by key: what is offered ticked the next time. */
  selection?: string[];
  claude?: CopyDoc;
  /** In the page that was pasted: `parent` is that page, and `last` is the heading of the document's last section, which is how its end is found again. */
  notion?: CopyDoc & { parent: string; last?: string };
  /** What is being done to each of the two now, or what last failed: they are made and taken away independently. */
  tasks?: { claude?: CopyTask; notion?: CopyTask };
};
export type CopyKind = "claude" | "notion";

const FILE = "copy-docs.json" as const;
/** A run that has been going this long is not going on: the studio was closed on it. */
const STALE_MS = 20 * 60_000;
/** Putting text where it is told to is the smallest model's work; and what a run may spend, a good way above what it needs. */
const MODEL = "haiku";
const NOTION_BUDGET_USD = "0.5";
const CLAUDE_BUDGET_USD = "1.5";

const guard = () => {
  if (!workingCopiesOn())
    throw new Error("Copy documents are only made on this machine.");
};

export async function readCopyDocs(slug: string): Promise<CopyDocs> {
  guard();
  let docs: CopyDocs = {};
  try {
    docs = JSON.parse((await readStudioFile(slug, FILE)) ?? "{}") as CopyDocs;
  } catch {
    // Unreadable: as good as none.
  }
  const tasks = { ...docs.tasks };
  for (const kind of ["claude", "notion"] as const) {
    const task = tasks[kind];
    if (
      task?.state === "running" &&
      Date.now() - new Date(task.at).getTime() > STALE_MS
    )
      tasks[kind] = {
        ...task,
        state: "failed",
        error: "It stopped before it finished.",
      };
  }
  let pendingDeletes = docs.pendingDeletes;
  if (pendingDeletes) {
    // A delete that has been going this long is not going on: the studio was closed on it.
    pendingDeletes = Object.fromEntries(Object.entries(pendingDeletes).map(([kind, pending]) => [kind, !pending.error && Date.now() - new Date(pending.at).getTime() > 5 * 60_000 ? { ...pending, error: "It stopped before it finished." } : pending]));
  }
  return { ...docs, ...(Object.keys(tasks).length ? { tasks } : {}), ...(pendingDeletes ? { pendingDeletes } : {}) };
}

const change = (slug: string, apply: (docs: CopyDocs) => CopyDocs) =>
  updateStudioFile(slug, FILE, (text) => {
    let docs: CopyDocs = {};
    try {
      docs = JSON.parse(text ?? "{}") as CopyDocs;
    } catch {
      // Start again from nothing.
    }
    return { content: JSON.stringify(apply(docs), null, 2) };
  });

// ---------------------------------------------------------------------------------------------------------------------------------
// Putting it in the two places: Claude Code, given only the one service, and the exact text.
// ---------------------------------------------------------------------------------------------------------------------------------

async function claudeBinary() {
  const places = [
    join(homedir(), ".local", "bin", "claude"),
    join(homedir(), ".claude", "local", "claude"),
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((dir) => join(dir, "claude")),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  for (const place of places)
    if (
      await access(place, constants.X_OK).then(
        () => true,
        () => false,
      )
    )
      return place;
  return null;
}

/** The studio's own environment out of it, as for any other program it starts (see `design-qa.ts`). */
const cleanEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(__NEXT_|NEXT_|TURBOPACK|NODE_ENV$|PORT$|INIT_CWD$|npm_)/.test(key),
    ),
  ) as NodeJS.ProcessEnv;

/** The one server a run is connected to: only what is named in `--mcp-config` is read in, so nothing else is put in front of the model. */
const NOTION_SERVER = JSON.stringify({
  mcpServers: { notion: { type: "http", url: "https://mcp.notion.com/mcp" } },
});

let known: { at: number; names: string[] } | null = null;
/** The names of every tool Claude Code would start with here, read from the start of a run that is stopped as soon as it has said them. */
function everyTool(binary: string, cwd: string) {
  if (known && Date.now() - known.at < 10 * 60_000)
    return Promise.resolve(known.names);
  return new Promise<string[]>((resolve) => {
    const child = spawn(
      binary,
      [
        "--print",
        "--model",
        "haiku",
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-budget-usd",
        "0.05",
      ],
      { cwd, stdio: ["pipe", "pipe", "ignore"], env: cleanEnv() },
    );
    let buffer = "";
    const done = (names: string[]) => {
      clearTimeout(timer);
      child.kill();
      resolve(names);
    };
    const timer = setTimeout(() => done([]), 45_000);
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      for (const line of buffer.split("\n")) {
        if (!line.includes('"subtype":"init"')) continue;
        try {
          const names = (JSON.parse(line) as { tools?: string[] }).tools ?? [];
          known = { at: Date.now(), names };
          return done(names);
        } catch {
          // A line not yet whole.
        }
      }
    });
    child.on("error", () => done([]));
    child.stdin.on("error", () => {});
    child.stdin.end("hi\n");
  });
}

type Service = "notion" | "claude";

/**
 * Runs Claude Code in the prototype's folder for one job at one service, and gives what it ended with. Notion is connected on its own. Claude Docs
 * is a connector of the account, which a run can only have along with the rest, so there every other tool is taken out of its context.
 */
async function run(
  slug: string,
  binary: string,
  service: Service,
  prompt: string,
  allow: string[],
  budget: string,
  // Given, the run is read from its stream: what each tool answered is put here, so that what the doc says never goes through the model at all.
  capture?: string[],
) {
  const cwd = workingFolder(slug);
  let connect: string[];
  if (service === "notion")
    connect = ["--strict-mcp-config", "--mcp-config", NOTION_SERVER];
  else {
    const unused = (await everyTool(binary, cwd)).filter(
      (name) =>
        name.startsWith("mcp__") &&
        !allow.some((one) => name === one || name.startsWith(`${one}__`)),
    );
    connect = unused.length ? ["--disallowedTools", unused.join(",")] : [];
  }
  return new Promise<{ ok: boolean; text: string }>((resolve) => {
    const child = spawn(
      binary,
      [
        "--print",
        "--model",
        MODEL,
        "--output-format",
        capture ? "stream-json" : "json",
        ...(capture ? ["--verbose"] : []),
        // No files, no shell: only the one service's tools, named.
        "--tools",
        "",
        "--allowedTools",
        allow.join(","),
        ...connect,
        "--disable-slash-commands",
        "--no-session-persistence",
        "--permission-mode",
        "default",
        "--permission-prompts",
        "none",
        "--max-budget-usd",
        budget,
      ],
      { cwd, stdio: ["pipe", "pipe", "ignore"], env: capture ? { ...cleanEnv(), MAX_MCP_OUTPUT_TOKENS: "200000" } : cleanEnv() },
    );
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("error", () =>
      resolve({ ok: false, text: "Claude Code couldn't be started." }),
    );
    child.on("close", () => {
      if (capture) {
        let ended: { result?: string; is_error?: boolean } | null = null;
        for (const line of out.split("\n")) {
          try {
            const event = JSON.parse(line) as { type?: string; message?: { content?: { type?: string; content?: string | { text?: string }[] }[] }; result?: string; is_error?: boolean };
            if (event.type === "user") {
              for (const part of event.message?.content ?? []) {
                if (part.type === "tool_result") capture.push(typeof part.content === "string" ? part.content : (part.content ?? []).map((piece) => piece.text ?? "").join(""));
              }
            } else if (event.type === "result") ended = event;
          } catch {
            // Not a line of the stream.
          }
        }
        return resolve({ ok: !!ended && !ended.is_error, text: ended?.result ?? "" });
      }
      try {
        const result = JSON.parse(out) as {
          result?: string;
          is_error?: boolean;
        };
        resolve({ ok: !result.is_error, text: result.result ?? "" });
      } catch {
        resolve({ ok: false, text: "It stopped before it finished." });
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

const CLAUDE_TOOLS = ["mcp__claude_ai_Claude_Docs"];
const NOTION_WRITE = ["mcp__notion__notion-update-page"];
const NOTION_REMOVE = [
  "mcp__notion__notion-update-page",
  "mcp__notion__notion-fetch",
];

const NOTION_URL = /^https:\/\/(?:[\w-]+\.)?notion\.(?:so|com)\/\S+$/;
/** The id of a Notion page from its address: the last 32 letters and numbers of the path. */
function notionId(url: string) {
  const path = url.split(/[?#]/)[0].replace(/-/g, "");
  const found = /([0-9a-f]{32})\/?$/i.exec(path);
  if (!found) throw new Error("There is no page in that Notion address.");
  const id = found[1].toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

const RESULT = /RESULT\s+(\{.*\})\s*$/m;
const reply =
  'End your reply with exactly one line, and nothing after it: RESULT {"url":"<the address of what you made>"}. If it could not be made, say in one sentence why instead.';

const notionPrompt = (name: string, parent: string, markdown: string) =>
  `Add text to the end of one existing Notion page, with the notion-update-page tool called once: page_id ${JSON.stringify(parent)}, command "insert_content", position {"type":"end"}, and as content exactly the text between the two lines of equals signs below, character for character: do not change, add, reorder or leave out anything, and do not fix any wording or punctuation. Do not make a new page, and do not change anything else on the page. Don't read anything first.\n${reply.replace("the address of what you made", "the address of the page")}\n\n==========\n${markdown}\n==========`;

/**
 * The doc connector is given the document in two calls, both made out here and told exactly. Its Status column is a dropdown, and a dropdown's
 * options have to exist before the table that holds them, so the first call makes the document with its heading lines, and the second adds the
 * options and then the sections, with the one dropdown token standing in every Status cell. No guide to read, nothing to work out.
 */
const claudePrompt = (name: string, parts: { head: string; body: string }) => {
  const first = JSON.stringify({
    container: {
      kind: "project",
      create: { name: `${name} copy`, doc: { markdown: parts.head } },
    },
    batch: [],
  });
  const second = JSON.stringify({
    container: { kind: "project", id: "<DOC_ID>" },
    batch: [
      {
        $lid: "s",
        verb: "create",
        object: "enum",
        payload: {
          value: {
            name: "Status",
            options: [
              { name: "Draft" },
              { name: "In review" },
              { name: "Approved" },
            ],
          },
        },
      },
      {
        verb: "update",
        ref: { object: "node", id: "<BODY_ID>" },
        engine: "prose",
        payload: {
          ops: [
            {
              op: "insert",
              target: { kind: "root" },
              side: "end",
              source: {
                as: "markdown",
                blocks: { st: { type: "dropdown", enum: "$lid:s", index: 0 } },
                from: { kind: "inline", content: parts.body },
              },
            },
          ],
        },
      },
    ],
  });
  return `Make exactly two tool calls, one after the other, to the Claude Docs connector's batch tool. Copy the arguments exactly as they are, character for character, changing nothing but the two placeholders named below.\n\nCall 1:\n${first}\n\nThe answer to call 1 holds the new document's id (it is "frame" then "slug") and the id of its body (it is "lids" then "n"), and the document's link ("frame" then "url"). Call 2 is the same as below with <DOC_ID> replaced by that document id and <BODY_ID> by that body id.\n\nCall 2:\n${second}\n\nCall no other tool, before, between or after, and do not read any guide. Then end your reply with exactly one line, and nothing after it: RESULT {"url":"<the link of the document>"}. If a call was refused, say in one sentence why instead.`;
};

const deleteNotionPrompt = (url: string, name: string, last: string) =>
  `On this Notion page the studio added a document at the end of the page, which starts with a heading ${JSON.stringify(`${name} copy`)} and goes on through numbered sections to the table of the last one, "${last}". Fetch the page, then take away that document and nothing else, with the notion-update-page tool's update_content command: old_str is the document's text exactly as the page has it (from its heading to the end of the last table), new_str is empty. Leave everything above it, and anything after it, exactly as it is. The page: ${url}\nWhen it is done, end your reply with exactly: DELETED`;
const deleteClaudePrompt = (url: string) =>
  `Delete this one document with the Claude Docs connector's delete tool and do nothing else: ${url}\nWhen it is gone, end your reply with exactly: DELETED`;

const LABEL: Record<CopyKind, string> = {
  claude: "Claude doc",
  notion: "Notion page",
};

/** Sets what is being done to one of the two, or (null) clears it. */
const setTask = (
  slug: string,
  kind: CopyKind,
  task: CopyTask | null,
  also?: (docs: CopyDocs) => CopyDocs,
) =>
  change(slug, (docs) => {
    const next: CopyDocs = also ? also({ ...docs }) : { ...docs };
    const tasks = { ...next.tasks };
    if (task) tasks[kind] = task;
    else delete tasks[kind];
    if (Object.keys(tasks).length) next.tasks = tasks;
    else delete next.tasks;
    return next;
  });

/** Makes one of the two documents from the prototype's words; returns at once, and the menu reads how far it has got. */
/**
 * Where a section can be opened on the canvas: the studio's own address (the one /push uses, in `~/.claude/prototype-studio.json`) and the prototype's
 * current version, which opens when no version is asked for. Only a pushed version can be opened by someone else, so a prototype never pushed gets no links.
 * The link carries a few of the section's lines (see `Group.find`): the canvas finds the section in the page by them and zooms to it, and shows the
 * whole screen when it can't.
 */
async function sectionLinks(slug: string) {
  const settings = await readFile(join(homedir(), ".claude", "prototype-studio.json"), "utf8").then(
    (text) => JSON.parse(text) as { url?: unknown; password?: unknown },
    () => ({}) as { url?: unknown; password?: unknown },
  );
  const config = settings.url;
  if (typeof config !== "string" || !/^https?:\/\//.test(config)) return undefined;
  const pushed = (await getPrototypeHistory(slug)).some((version) => !version.live);
  if (!pushed) return undefined;
  // A share link, not the studio's own page: it opens the prototype for looking at, with nothing to edit, and follows its current version. It is signed with the
  // studio's password (the one /push uses), as the deployed studio checks it, so it opens for anyone with the link and for no one else.
  const base = `${config.replace(/\/+$/, "")}/s/${mintShareToken(slug, LATEST, typeof settings.password === "string" && settings.password ? settings.password : undefined)}`;
  return (group: { find: string[] }) => {
    if (!group.find.length) return null;
    const find = group.find.filter((line) => !line.includes("|")).map((line) => encodeURIComponent(line).replace(/\(/g, "%28").replace(/\)/g, "%29")).join("%7C");
    return `${base}?find=${find}#canvas`;
  };
}

export async function createCopyDoc(
  slug: string,
  name: string,
  kind: CopyKind,
  notionUrl?: string,
  keys?: string[],
) {
  guard();
  const parentUrl = (notionUrl ?? "").trim();
  if (kind === "notion" && !NOTION_URL.test(parentUrl))
    throw new Error("That isn't a Notion address.");
  const parent = kind === "notion" ? notionId(parentUrl) : "";
  const binary = await claudeBinary();
  if (!binary)
    throw new Error(
      "Claude Code isn't installed where the studio can find it.",
    );
  const all = await readCopy(workingFolder(slug));
  // Only the lines that were chosen: a copy file holds the words of every variation, and a document is usually about one.
  const chosen = keys ? new Set(keys) : null;
  const groups = chosen
    ? all
        .map((group) => ({
          ...group,
          entries: group.entries.filter((entry) => chosen.has(entry.key)),
        }))
        .filter((group) => group.entries.length)
    : all;
  if (!groups.length) throw new Error("Choose at least one line.");
  const now = await readCopyDocs(slug);
  if (now.tasks?.[kind]?.state === "running")
    throw new Error("That is already being done.");
  if (now[kind]) throw new Error("There is one already.");

  await setTask(
    slug,
    kind,
    {
      kind: "create",
      state: "running",
      step: `Writing the ${LABEL[kind]}`,
      at: new Date().toISOString(),
    },
    (docs) => (keys ? { ...docs, selection: keys.slice(0, 5000) } : docs),
  );
  const link = await sectionLinks(slug);
  const markdown = copyMarkdown(groups, kind, name, link);
  const outcome =
    kind === "claude"
      ? run(
          slug,
          binary,
          "claude",
          claudePrompt(name, copyParts(groups, "claude", name, link)),
          CLAUDE_TOOLS,
          CLAUDE_BUDGET_USD,
        )
      : run(
          slug,
          binary,
          "notion",
          notionPrompt(name, parent, markdown),
          NOTION_WRITE,
          NOTION_BUDGET_USD,
        );
  void outcome.then(async (result) => {
    const found = RESULT.exec(result.text)?.[1];
    let made = "";
    try {
      made = found ? ((JSON.parse(found) as { url?: string }).url ?? "") : "";
    } catch {
      // Nothing it said can be used.
    }
    const at = new Date().toISOString();
    if (!made) {
      const why = (
        result.text
          .split("\n")
          .filter((line) => line.trim() && !line.startsWith("RESULT"))
          .pop() ?? "it didn't finish"
      ).slice(0, 200);
      return setTask(slug, kind, {
        kind: "create",
        state: "failed",
        step: "Failed",
        at,
        error: `The ${LABEL[kind]} wasn't made: ${why}`,
      });
    }
    // The words went into the Notion page that was given, so that page is where they are.
    await setTask(slug, kind, null, (docs) =>
      kind === "claude"
        ? {
            ...docs,
            claude: {
              url: made,
              title: `${name} copy`,
              at,
              snapshot: groups.map((group) => ({
                name: group.name,
                rows: group.entries.map((entry) => ({
                  key: entry.key,
                  value: entry.value,
                })),
              })),
            },
          }
        : {
            ...docs,
            notion: {
              url: parentUrl,
              title: `${name} copy`,
              at,
              parent: parentUrl,
              last: `${groups.length}. ${groups[groups.length - 1].name}`,
            },
          },
    );
  });
}

const LINK_HOSTS: Record<CopyKind, RegExp> = {
  claude: /^https:\/\/(?:www\.)?claude\.ai\/\S+$/,
  notion: NOTION_URL,
};

/** Takes note of a document that was made already, somewhere: it is then on the list, linked, and nothing else is done to it. */
export async function linkCopyDoc(
  slug: string,
  name: string,
  kind: CopyKind,
  url: string,
) {
  guard();
  const address = url.trim();
  if (!LINK_HOSTS[kind].test(address))
    throw new Error(
      `That isn't a ${kind === "claude" ? "Claude" : "Notion"} address.`,
    );
  if ((await readCopyDocs(slug))[kind])
    throw new Error("There is one already.");
  const at = new Date().toISOString();
  await change(slug, (docs) => ({
    ...docs,
    [kind]:
      kind === "claude"
        ? { url: address, title: `${name} copy`, at, linked: true }
        : {
            url: address,
            title: `${name} copy`,
            at,
            parent: address,
            linked: true,
          },
  }));
}

/**
 * Takes one of the two away, after the menu has asked; returns at once. One that was made here is deleted where it is (and from the list); one that was
 * linked is only taken off the list.
 */
export async function deleteCopyDoc(slug: string, kind: CopyKind) {
  guard();
  const docs = await readCopyDocs(slug);
  const doc = docs[kind];
  if (!doc) throw new Error("That isn't here any more.");
  if (docs.tasks?.[kind]?.state === "running") throw new Error("Something is being done to it already.");
  if (doc.linked) return forgetCopyDoc(slug, kind);
  const binary = await claudeBinary();
  if (!binary) throw new Error("Claude Code isn't installed where the studio can find it.");
  // Off the list at once; the delete carries on in the background, and is noted only until it is done.
  await change(slug, (current) => {
    const next = { ...current, pendingDeletes: { ...current.pendingDeletes, [kind]: { doc, at: new Date().toISOString() } } };
    delete next[kind];
    return next;
  });
  deleteInBackground(slug, binary, kind, doc, docs.notion?.last);
}

/** The delete itself, which nobody waits for: gone, it is forgotten; not, the doc is kept in `pendingDeletes` with what went wrong, so it can be offered back. */
function deleteInBackground(slug: string, binary: string, kind: CopyKind, doc: CopyDoc, last?: string) {
  const work =
    kind === "claude"
      ? run(slug, binary, "claude", deleteClaudePrompt(doc.url), CLAUDE_TOOLS, "1")
      : run(slug, binary, "notion", deleteNotionPrompt(doc.url, doc.title.replace(/ copy$/, ""), last ?? "the last section"), NOTION_REMOVE, "0.5");
  void work.then(async (outcome) => {
    const gone = outcome.ok && /DELETED\s*$/.test(outcome.text.trim());
    await change(slug, (current) => {
      const pending = { ...current.pendingDeletes };
      if (gone) delete pending[kind];
      else pending[kind] = { doc, at: new Date().toISOString(), error: "It couldn't be deleted." };
      const next = { ...current };
      if (Object.keys(pending).length) next.pendingDeletes = pending;
      else delete next.pendingDeletes;
      return next;
    });
  });
}

/** Tries again a delete that failed. */
export async function retryCopyDocDelete(slug: string, kind: CopyKind) {
  guard();
  const pending = (await readCopyDocs(slug)).pendingDeletes?.[kind];
  if (!pending) throw new Error("There is nothing to delete.");
  const binary = await claudeBinary();
  if (!binary) throw new Error("Claude Code isn't installed where the studio can find it.");
  await change(slug, (current) => ({ ...current, pendingDeletes: { ...current.pendingDeletes, [kind]: { doc: pending.doc, at: new Date().toISOString() } } }));
  deleteInBackground(slug, binary, kind, pending.doc);
}

/** Lets go of a delete that failed (the document is deleted by hand where it is). */
export async function dismissCopyDocDelete(slug: string, kind: CopyKind) {
  guard();
  await change(slug, (current) => {
    const pending = { ...current.pendingDeletes };
    delete pending[kind];
    const next = { ...current };
    if (Object.keys(pending).length) next.pendingDeletes = pending;
    else delete next.pendingDeletes;
    return next;
  });
}

/** Takes a document off the list without touching it where it is: for one that was deleted by hand, or one that was linked. */
export async function forgetCopyDoc(slug: string, kind: CopyKind) {
  guard();
  await setTask(slug, kind, null, (docs) => (delete docs[kind], docs));
}

/** Clears the note of a failure, so the menu goes back to what it was. */
export async function clearCopyDocsTask(slug: string, kind: CopyKind) {
  guard();
  await setTask(slug, kind, null);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Taking a document back: weighed against the file here, and written to it only for the rows that were chosen.
// ---------------------------------------------------------------------------------------------------------------------------------

const clean = (rows: PastedRow[]) =>
  rows.slice(0, 5000).map((row) => ({
    key: String(row.key ?? "").slice(0, 200),
    current: String(row.current ?? "").slice(0, 4000),
    next: String(row.next ?? "").slice(0, 4000),
    status: String(row.status ?? "").slice(0, 60),
    section: String(row.section ?? "").slice(0, 200),
  }));

/** What a paste of a copy document would change in the prototype's words, row by row, without changing anything. */
export async function previewCopyImport(slug: string, rows: PastedRow[]) {
  guard();
  const groups = await readCopy(workingFolder(slug));
  const words = new Map(
    groups.flatMap((group) =>
      group.entries.map((entry) => [entry.key, entry.value] as const),
    ),
  );
  return reviewCopy(clean(rows), words);
}

/** Writes the chosen lines into `src/lib/copy.ts`, each only if the file still says what it was weighed against. */
export async function applyCopyImport(
  slug: string,
  changes: { key: string; before: string; after: string }[],
) {
  guard();
  if (!Array.isArray(changes) || !changes.length || changes.length > 1000)
    throw new Error("There is nothing to apply.");
  const file = join(workingFolder(slug), "src", "lib", "copy.ts");
  const text = await readFile(file, "utf8");
  const result = await replaceCopy(
    text,
    changes.map((change) => ({
      key: String(change.key).slice(0, 200),
      before: String(change.before),
      after: String(change.after).slice(0, 2000),
    })),
  );
  if (result.applied.length) {
    await writeFile(file, result.text);
    // These words came from the doc: it already has them, so they aren't changes to push back to it.
    const taken = new Map(
      changes
        .filter((change) => result.applied.includes(String(change.key).slice(0, 200)))
        .map((change) => [String(change.key).slice(0, 200), String(change.after).slice(0, 2000)]),
    );
    await setTask(slug, "claude", null, (current) =>
      current.claude?.snapshot
        ? {
            ...current,
            claude: {
              ...current.claude,
              snapshot: current.claude.snapshot.map((section) => ({
                ...section,
                rows: section.rows.map((row) =>
                  taken.has(row.key) ? { ...row, value: taken.get(row.key)! } : row,
                ),
              })),
            },
          }
        : current,
    );
  }
  return { applied: result.applied, skipped: result.skipped };
}

/** What the prototype's copy file holds, for choosing from: its sections and their lines, and the lines chosen last time (none yet: null). */
export async function readCopySections(slug: string) {
  guard();
  const groups = await readCopy(workingFolder(slug));
  const docs = await readCopyDocs(slug);
  return {
    groups: groups.map((group) => ({
      name: group.name,
      blurb: group.blurb,
      entries: group.entries.map((entry) => ({
        key: entry.key,
        what: entry.what,
        value: entry.value,
        index: entry.index,
      })),
    })),
    saved: docs.selection ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Bringing the Claude doc up to date: only the Current English cells of the lines that have changed since it was made.
// ---------------------------------------------------------------------------------------------------------------------------------

export type DocChange = {
  key: string;
  section: string;
  was: string;
  now: string;
  table: number;
  row: number;
};

/** Which lines of the doc no longer say what the prototype's copy file says: found by key, against what the doc was last known to hold. */
export async function previewClaudeUpdate(slug: string) {
  guard();
  const docs = await readCopyDocs(slug);
  const snapshot = docs.claude?.snapshot;
  if (!docs.claude || docs.claude.linked || !snapshot)
    return {
      canUpdate: false as const,
      // A doc made here before its words were kept can't be told from the prototype: it is made again.
      madeBefore: !!docs.claude && !docs.claude.linked,
      changed: [] as DocChange[],
      removed: [] as { key: string; was: string }[],
    };
  const now = new Map(
    (await readCopy(workingFolder(slug))).flatMap((group) =>
      group.entries.map((entry) => [entry.key, entry.value] as const),
    ),
  );
  const changed: DocChange[] = [];
  const removed: { key: string; was: string }[] = [];
  snapshot.forEach((section, table) =>
    section.rows.forEach((row, at) => {
      const value = now.get(row.key);
      if (value === undefined) removed.push({ key: row.key, was: row.value });
      else if (value !== row.value)
        changed.push({
          key: row.key,
          section: section.name,
          was: row.value,
          now: value,
          table: table + 1,
          row: at + 1,
        });
    }),
  );
  return { canUpdate: true as const, madeBefore: false, changed, removed };
}

const updatePrompt = (doc: string, edits: DocChange[]) => {
  const ops = edits.map((edit) => ({
    op: "replace",
    target: {
      kind: "find",
      text: cellText(edit.was),
      within: {
        kind: "cell",
        table: `<TABLE_${edit.table}>`,
        row: edit.row,
        col: 2,
      },
    },
    with: { from: { kind: "inline", content: cellText(edit.now) }, as: "text" },
  }));
  return `Make exactly three tool calls to the Claude Docs connector, one after the other. Do not read any guide. Copy the arguments as they are, changing only what is said below.

Call 1: the read tool, with {"ref":{"object":"project","id":${JSON.stringify(doc)}}}. In its answer, take the first file's content id: that is <BODY_ID>.

Call 2: the read tool, with {"ref":{"object":"node","id":"<BODY_ID>"},"engine":"prose","container":{"kind":"project","id":${JSON.stringify(doc)}},"payload":{"projection":"outline"}}, <BODY_ID> replaced by that id. Its answer lists the document's tables, in order, as elements with an id. Ids are printed short after the first one (like .35): write each in full, with the start of the first id in the answer (the part before its dot, for example mjs34mx2f50 from mjs34mx2f50.0) in front of the dot (mjs34mx2f50.35).

Call 3: the update tool, with ${JSON.stringify({ ref: { object: "node", id: "<BODY_ID>" }, engine: "prose", container: { kind: "project", id: doc }, payload: { ops } })}, <BODY_ID> replaced as before, and each <TABLE_n> replaced by the full id of the n-th table from call 2 (<TABLE_1> is the first table, <TABLE_2> the second, and so on).

Call no other tool. Then end your reply with exactly one line, and nothing after it: RESULT {"updated":true}. If a call was refused, say in one sentence why instead.`;
};

/** Brings the chosen changed lines of the Claude doc up to date; returns at once, and the menu reads how far it has got. */
export async function updateClaudeDoc(slug: string, keys: string[]) {
  guard();
  const preview = await previewClaudeUpdate(slug);
  if (!preview.canUpdate)
    throw new Error(
      "This doc can't be brought up to date from here: it wasn't made here.",
    );
  const chosen = new Set(keys);
  const edits = preview.changed.filter((change) => chosen.has(change.key));
  if (!edits.length) throw new Error("There is nothing to update.");
  const docs = await readCopyDocs(slug);
  const doc = docs.claude!;
  if (docs.tasks?.claude?.state === "running")
    throw new Error("That is already being done.");
  const binary = await claudeBinary();
  if (!binary)
    throw new Error(
      "Claude Code isn't installed where the studio can find it.",
    );
  // The id of the doc is the last part of its address.
  const id = doc.url.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";

  await setTask(slug, "claude", {
    kind: "update",
    state: "running",
    step: "Updating the Claude doc",
    at: new Date().toISOString(),
  });
  void run(
    slug,
    binary,
    "claude",
    updatePrompt(id, edits),
    CLAUDE_TOOLS,
    "1",
  ).then(async (outcome) => {
    if (!outcome.ok || !/RESULT\s+\{"updated":true\}/.test(outcome.text)) {
      const why = (
        outcome.text
          .split("\n")
          .filter((line) => line.trim() && !line.startsWith("RESULT"))
          .pop() ?? "it didn't finish"
      ).slice(0, 200);
      return setTask(slug, "claude", {
        kind: "update",
        state: "failed",
        step: "Failed",
        at: new Date().toISOString(),
        error: `The doc wasn't updated: ${why}`,
      });
    }
    // What the doc holds now: the lines that were changed take the words they were changed to.
    const now = new Map(edits.map((edit) => [edit.key, edit.now]));
    await setTask(slug, "claude", null, (current) =>
      current.claude?.snapshot
        ? {
            ...current,
            claude: {
              ...current.claude,
              snapshot: current.claude.snapshot.map((section) => ({
                ...section,
                rows: section.rows.map((row) =>
                  now.has(row.key) ? { ...row, value: now.get(row.key)! } : row,
                ),
              })),
            },
          }
        : current,
    );
  });
}

/**
 * Reads the rows of the Claude doc (or the one linked) for taking its copy back, with as little model as there can be: the run only makes the two reads
 * of the doc, exactly as told, and the studio takes what they answered from the run's stream and reads the tables itself. Nothing the doc says is
 * written out by the model, so nothing can be changed on the way.
 */
export async function pullClaudeDoc(slug: string) {
  guard();
  const doc = (await readCopyDocs(slug)).claude;
  if (!doc) throw new Error("There is no Claude doc to pull from.");
  const binary = await claudeBinary();
  if (!binary) throw new Error("Claude Code isn't installed where the studio can find it.");
  const id = doc.url.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  const read = async (body: string | undefined) => {
    const answers: string[] = [];
    const view = (node: string) => `the read tool, with {"ref":{"object":"node","id":${JSON.stringify(node)}},"engine":"prose","container":{"kind":"project","id":${JSON.stringify(id)}},"payload":{"kind":"view"}}`;
    const again = "If its answer says it is not complete, call it again with the keys the answer names added to the payload, until it is.";
    // Known where the body is: one read. The first time, the project is read to find it.
    const prompt = body
      ? `Make this tool call to the Claude Docs connector. Do not read any guide, and do not repeat or summarise anything you read.

Call 1: ${view(body)}. ${again}

Call no other tool. Then end your reply with exactly: DONE`
      : `Make these tool calls to the Claude Docs connector, one after the other. Do not read any guide, and do not repeat or summarise anything you read.

Call 1: the read tool, with {"ref":{"object":"project","id":${JSON.stringify(id)}}}. In its answer, take the first file's content id: that is <BODY_ID>.

Call 2: ${view("<BODY_ID>")}, <BODY_ID> replaced by that id. ${again}

Call no other tool. Then end your reply with exactly: DONE <BODY_ID>`;
    const outcome = await run(slug, binary, "claude", prompt, CLAUDE_TOOLS, "1", answers);
    const xml = answers.flatMap((answer) => {
      const found = /"xml":"((?:[^"\\]|\\.)*)"/.exec(answer)?.[1];
      if (!found) return [];
      try {
        return [JSON.parse(`"${found}"`) as string];
      } catch {
        return [];
      }
    });
    const rows = tablesFromDocXml(...xml).flatMap((table) => rowsFromTable(table.lines, table.section));
    return { rows, ok: outcome.ok, learnt: /DONE\s+([\w-]{8,})/.exec(outcome.text)?.[1] };
  };
  let found = await read(doc.body);
  // A body id that no longer reads (the doc was rebuilt): forgotten, and read again the long way.
  if (!found.rows.length && doc.body) found = await read(undefined);
  if (!found.rows.length) throw new Error(found.ok ? "There was no table of copy in that doc." : "The doc couldn't be read.");
  if (found.learnt && found.learnt !== doc.body) {
    const learnt = found.learnt;
    await setTask(slug, "claude", null, (current) => (current.claude ? { ...current, claude: { ...current.claude, body: learnt } } : current));
  }
  return found.rows;
}
