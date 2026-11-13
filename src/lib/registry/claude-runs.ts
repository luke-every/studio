import "server-only";

import { spawn } from "node:child_process";
import { closeSync, constants, openSync } from "node:fs";
import { access, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import { z } from "zod";

import { CLAUDE_AUTHOR, commentsFileSchema, reviewPrompt, type Comment } from "@/lib/comments";
import { controlsInWords, controlsSchema } from "@/lib/controls";

import { ChangedSince, changesSince, put, snapshot, type FileChange } from "./claude-undo";
import { readStudioFile, studioPath, updateStudioFile, workingFolder } from "./local-prototypes";

/**
 * Claude, answering comments on a live version.
 *
 * A comment or reply that says `@claude` on a working copy (see `comments.ts`) starts Claude Code, headless, in that
 * prototype's folder, with the thread as it stands. Claude answers in the thread twice, in one reply: at once, that it
 * is working on it (or will look at it next, behind another), and when it finishes that same reply becomes the answer:
 * what it changed, in a sentence or two, or one question. So the file never keeps a "Working on it." above an answer,
 * and a run that stops short still ends in a sentence saying so. A thread whose last word from Claude was a question
 * goes back to it with the next reply, without being tagged again, in the same Claude session so it remembers. One run
 * at a time per prototype; the rest wait their turn.
 *
 * Everything about a run is kept in the prototype's `.studio/claude.json`, so a reload shows it and a restart of the
 * studio finds it. Claude writes its answer to a file of its own beside it rather than back to this process, so an
 * answer that finishes while the studio is restarting is still picked up; one that never finishes, or a run that stops
 * without a word, is said so in the thread. Nothing here is shown as such: the interface sees replies, one of them quiet
 * while Claude is still behind it.
 *
 * What a run changed can be put back by the studio itself, without Claude (see `claude-undo.ts`): the folder is looked
 * at before the run and after, and the difference is kept under `.studio/undo/`, by the id of Claude's reply.
 */

/** A thread's dealings with Claude, by the id of the comment that starts it. */
type Thread = {
  /** The Claude Code session, so a follow-up carries on the same conversation. */
  session?: string;
  /** How Claude last ended: the change made, a question the thread is waiting on somebody to answer, or not finished. */
  last?: "done" | "question" | "failed";
  /** Edits made by hand in the studio that this thread asks Claude to make in the code (see `editsBrief`), until it has answered. */
  brief?: string;
  /**
   * A run asked for and not finished: waiting its turn, or at work in process `pid`. `reply` is Claude's reply standing
   * in the thread for it, which the answer takes the place of. `again` is a reply that came in while it worked.
   */
  run?: { state: "queued" | "working"; at: string; pid?: number; reply?: string; again?: boolean };
  /** The files each run changed, by the id of Claude's reply to it, while that can still be put back or made again. */
  changes?: Record<string, { at: string; files: FileChange[]; undone?: boolean }>;
};
type Threads = Record<string, Thread>;

/** How long a run may take before it is stopped. */
const LIMIT_MS = 15 * 60 * 1000;
/** What one run may spend at most. */
const BUDGET_USD = "5";

const MENTION = /(^|[^\w@])@claude\b/i;

/** How many runs' changes are kept to put back, per prototype: the newest. */
const KEPT = 5;
/** How long after Claude finished a file may have been written and still be its work. */
const SLACK_MS = 2000;

/** What Claude says in the thread until it has an answer. */
const WAITING = "I'll look at this next.";
const WORKING = "Working on it.";

/** Whether a comment just posted goes to Claude: it says @claude, or it answers a thread Claude last asked a question in. */
export function goesToClaude(comment: Pick<Comment, "text" | "parentId">, thread?: Thread) {
  return MENTION.test(comment.text) || (!!comment.parentId && thread?.last === "question");
}

const ANSWER = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: ["done", "question"] },
    message: { type: "string" },
  },
  required: ["outcome", "message"],
  additionalProperties: false,
};
const answerSchema = z.object({ outcome: z.enum(["done", "question"]), message: z.string().trim().min(1).max(2000) });
const resultSchema = z.object({
  type: z.literal("result"),
  subtype: z.string(),
  is_error: z.boolean().optional(),
  session_id: z.string().optional(),
  structured_output: z.unknown().optional(),
});

type Outcome = { outcome: "done" | "question"; message: string; session?: string } | { outcome: "failed"; message: string; session?: string };

/** What Claude Code printed (`--output-format json` with `--json-schema`), as the reply it makes. Anything else is a run that failed, said why in a sentence. */
export function parseAnswer(printed: string): Outcome {
  let result: z.infer<typeof resultSchema> | null = null;
  try {
    result = resultSchema.parse(JSON.parse(printed));
  } catch {
    return { outcome: "failed", message: "I stopped before I could finish, so I have nothing to report. Mention @claude to try again." };
  }
  const session = result.session_id;
  if (result.subtype === "error_max_budget_usd") {
    return { outcome: "failed", session, message: "I couldn't finish this: it would have cost more than one comment is allowed." };
  }
  const answer = answerSchema.safeParse(result.structured_output);
  if (result.is_error || result.subtype !== "success" || !answer.success) {
    return { outcome: "failed", session, message: "I couldn't finish this: something went wrong on my side. Mention @claude to try again." };
  }
  return { ...answer.data, session };
}

const INSTRUCTIONS = [
  "You are answering a comment that a designer left on this prototype in Prototype Studio. The prototype is the app in this folder, running on its dev server, which reloads by itself when you save.",
  "Act on the newest message in the thread; the earlier ones are its context. Work only on the files in this folder.",
  'End in exactly one of two ways. "done": you made the change; message is one or two plain sentences for a designer saying what changed, such as "Removed the subheading under the hero title." No file names, code or diffs unless the comment asked for them. "question": you need to know something before changing anything; message is one question, and you have changed no files.',
].join("\n\n");

/** Where Claude Code is. The studio may run with only a bare PATH (launchd), so the usual places it installs to are looked in first. */
async function claudeBinary() {
  const places = [
    join(homedir(), ".local", "bin", "claude"),
    join(homedir(), ".claude", "local", "claude"),
    ...(process.env.PATH ?? "").split(delimiter).filter(Boolean).map((dir) => join(dir, "claude")),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  for (const place of places) {
    if (await access(place, constants.X_OK).then(() => true, () => false)) return place;
  }
  return null;
}

const outputOf = (slug: string, id: string) => studioPath(slug, `claude-${id}.json`);
/** The folder as it was before the run at work; and what a finished run changed, by its reply. */
const snapshotOf = (slug: string) => studioPath(slug, "snapshot");
const undoOf = (slug: string, reply: string) => studioPath(slug, join("undo", reply));

const readThreads = async (slug: string): Promise<Threads> => {
  const text = await readStudioFile(slug, "claude.json");
  try {
    return text ? (JSON.parse(text) as Threads) : {};
  } catch {
    return {};
  }
};
const changeThreads = (slug: string, change: (threads: Threads) => void) =>
  updateStudioFile(slug, "claude.json", (text) => {
    let threads: Threads = {};
    try {
      threads = text ? (JSON.parse(text) as Threads) : {};
    } catch {
      // A file that can't be read starts over: what it held was only runs in progress.
    }
    change(threads);
    return { content: JSON.stringify(threads, null, 2) };
  });

const alive = (pid?: number) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The prototype's controls, for saying a setup in words. */
async function controlsOf(slug: string) {
  const text = await readFile(join(workingFolder(slug), "public", "studio.json"), "utf8").catch(() => null);
  try {
    return text ? controlsSchema.parse(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

/** The thread as Claude is given it: the studio's review prompt for this one comment and its replies, without the space left for more. */
async function promptFor(slug: string, root: Comment, replies: Comment[]) {
  const controls = await controlsOf(slug);
  const words = (setup?: string) => (setup ? controlsInWords(setup, controls).join(" · ") || setup : null);
  const prompt = reviewPrompt(slug.replace(/-/g, " "), [root], { [root.id]: replies }, words);
  return prompt.slice(0, prompt.lastIndexOf("\n## Also")).trimEnd();
}

/** Every per-slug step happens one after another, across the studio's own module copies, so no run is started twice. */
const chains = ((globalThis as { __claudeRuns?: Map<string, Promise<unknown>> }).__claudeRuns ??= new Map());
function inTurn<T>(slug: string, step: () => Promise<T>) {
  const next = (chains.get(slug) ?? Promise.resolve()).catch(() => {}).then(step);
  chains.set(slug, next);
  return next;
}

/**
 * A comment was posted on a live version: if it is for Claude, its thread waits its turn (or, if Claude is at work on
 * it, goes again after). `brief` is more for Claude than the comment says: the edits it stands for, each in full.
 */
export function ask(slug: string, comment: Comment, brief?: string) {
  return inTurn(slug, async () => {
    const id = comment.parentId ?? comment.id;
    const threads = await readThreads(slug);
    if (!goesToClaude(comment, threads[id])) return;
    await changeThreads(slug, (now) => {
      const thread = (now[id] ??= {});
      if (brief) thread.brief = brief;
      if (thread.run?.state === "working") thread.run.again = true;
      else thread.run ??= { state: "queued", at: new Date().toISOString() };
    });
    await next(slug);
    // Still waiting after that: Claude is on another thread, and says here that this one is next.
    const run = (await readThreads(slug))[id]?.run;
    if (run?.state === "queued" && !run.reply) await standIn(slug, id, WAITING);
  });
}

/**
 * Where Claude is with each run, by the id of its reply standing in the thread (the thread's first comment, if it has
 * none), after settling what has finished since last asked: a run whose process has gone (or that has run out of time)
 * is answered from what it left, and the next one starts.
 */
export function runsOf(slug: string) {
  return inTurn(slug, async () => {
    await next(slug);
    const threads = await readThreads(slug);
    return Object.fromEntries(Object.entries(threads).flatMap(([id, thread]) => (thread.run ? [[thread.run.reply ?? id, thread.run.state]] : []))) as Record<string, "queued" | "working">;
  });
}

/** Settles the run at work, if it has finished, and starts the oldest waiting one if none is at work. Only called in turn. */
async function next(slug: string) {
  const threads = await readThreads(slug);
  const working = Object.entries(threads).find(([, thread]) => thread.run?.state === "working");
  if (working) {
    const [id, thread] = working;
    const { pid, at } = thread.run!;
    const took = Date.now() - Date.parse(at);
    if (alive(pid) && took <= LIMIT_MS) return;
    // Over time and still going, after a restart of the studio took away its own timer: stopped. Long after that, the
    // number may be some other process's by now, so it is left alone and the run is only settled.
    if (alive(pid) && took < LIMIT_MS * 2) process.kill(pid!, "SIGTERM");
    const printed = await readFile(outputOf(slug, id), "utf8").catch(() => "");
    const outcome = took >= LIMIT_MS - 5000 && !printed.trim() ? { outcome: "failed" as const, message: "I couldn't finish this: it took longer than 15 minutes, so I stopped." } : parseAnswer(printed);
    // Its answer was the last thing it wrote: a file written later than that is somebody else's work.
    const ended = (await stat(outputOf(slug, id)).catch(() => null))?.mtimeMs ?? Date.now();
    const reply = await answer(slug, id, outcome);
    await remember(slug, id, reply, ended + SLACK_MS);
    await rm(outputOf(slug, id), { force: true });
    return next(slug);
  }
  const waiting = Object.entries(threads)
    .filter(([, thread]) => thread.run?.state === "queued")
    .sort(([, a], [, b]) => Date.parse(a.run!.at) - Date.parse(b.run!.at))[0];
  if (waiting) await start(slug, waiting[0], waiting[1]);
}

/**
 * Claude's word in a thread: a new reply at the end of it, or, given the reply it already has there (`standing`), that
 * one saying something new, moved to the end if anybody has replied since. The id it is kept under, or null when the
 * thread was deleted meanwhile and there is nowhere to say it.
 */
async function say(slug: string, id: string, text: string, standing?: string) {
  const said: { id: string | null } = { id: null };
  await updateStudioFile(slug, "comments.json", (file) => {
    const comments = file ? commentsFileSchema.parse(JSON.parse(file)) : [];
    const root = comments.find((item) => item.id === id);
    said.id = null;
    if (!root) return { content: JSON.stringify(comments) };
    const was = comments.find((item) => item.id === standing && item.parentId === id);
    const reply: Comment = {
      id: was?.id ?? crypto.randomUUID(),
      n: root.n,
      author: CLAUDE_AUTHOR,
      at: new Date().toISOString(),
      text,
      anchor: root.anchor,
      variant: root.variant,
      parentId: root.id,
    };
    said.id = reply.id;
    return { content: JSON.stringify([...comments.filter((item) => item !== was), reply]) };
  });
  return said.id;
}

/** Says where a run not yet finished is, in its thread, and remembers which reply that is. */
async function standIn(slug: string, id: string, text: string) {
  const reply = await say(slug, id, text, (await readThreads(slug))[id]?.run?.reply);
  await changeThreads(slug, (threads) => {
    const run = threads[id]?.run;
    if (run && reply) run.reply = reply;
  });
}

/** Claude's answer in the thread, in place of what it said while working, and the thread's state after it: done, waiting on a question, or (with a reply that came in meanwhile) its turn again. */
async function answer(slug: string, id: string, outcome: Outcome) {
  const reply = await say(slug, id, outcome.message, (await readThreads(slug))[id]?.run?.reply);
  await changeThreads(slug, (threads) => {
    const thread = (threads[id] ??= {});
    if (outcome.session) thread.session = outcome.session;
    thread.last = outcome.outcome;
    // Said once: a follow-up carries on the same conversation, which has it.
    delete thread.brief;
    thread.run = thread.run?.again ? { state: "queued", at: new Date().toISOString() } : undefined;
  });
  return reply;
}

/** Keeps what the run that just ended changed, under its reply, so it can be put back; and only the newest few of those. */
async function remember(slug: string, id: string, reply: string | null, until: number) {
  // Compared even with no reply to keep it under (the thread was deleted): the snapshot is used up either way.
  const files = await changesSince(workingFolder(slug), snapshotOf(slug), id, undoOf(slug, reply ?? "none"), until);
  if (!reply) await rm(undoOf(slug, "none"), { recursive: true, force: true });
  if (!reply || !files?.length) return;
  const dropped: string[] = [];
  await changeThreads(slug, (threads) => {
    (threads[id].changes ??= {})[reply] = { at: new Date().toISOString(), files };
    const all = Object.values(threads).flatMap((thread) => Object.entries(thread.changes ?? {}).map(([key, change]) => ({ thread, key, at: change.at })));
    for (const { thread, key } of all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(KEPT)) {
      delete thread.changes![key];
      dropped.push(key);
    }
  });
  await Promise.all(dropped.map((key) => rm(undoOf(slug, key), { recursive: true, force: true })));
}

/** Which of Claude's replies have a change that can be put back ("offered") or made again ("undone"), by reply id. */
export async function changesOf(slug: string) {
  const threads = await readThreads(slug);
  return Object.fromEntries(
    Object.values(threads).flatMap((thread) => Object.entries(thread.changes ?? {}).map(([reply, change]) => [reply, change.undone ? "undone" : "offered"])),
  ) as Record<string, "offered" | "undone">;
}

/**
 * Puts back what Claude changed for one of its replies, or with `redo` makes that change again, in code: Claude isn't
 * run. If a file it touched isn't as it was left (somebody has worked on it since, or a later run has), nothing is
 * touched, it says so, and that change is no longer offered. Not while Claude is at work here: what this writes would
 * be taken for that run's.
 */
export function undo(slug: string, reply: string, redo = false) {
  return inTurn(slug, async () => {
    await next(slug);
    const threads = await readThreads(slug);
    const [id, thread] = Object.entries(threads).find(([, item]) => item.changes?.[reply]) ?? [];
    const change = thread?.changes?.[reply];
    if (!id || !change || !!change.undone !== redo) throw new Error("There is nothing to undo here any more.");
    if (Object.values(threads).some((item) => item.run?.state === "working")) throw new Error("Claude is working on this prototype. Try again when it has finished.");
    try {
      await put(workingFolder(slug), undoOf(slug, reply), change.files, redo ? "after" : "before");
    } catch (error) {
      await changeThreads(slug, (now) => {
        delete now[id]?.changes?.[reply];
      });
      await rm(undoOf(slug, reply), { recursive: true, force: true });
      throw error instanceof ChangedSince ? new Error("That part has changed since, so I left it as it is.") : error;
    }
    await changeThreads(slug, (now) => {
      const kept = now[id]?.changes?.[reply];
      if (kept) kept.undone = !redo;
    });
  });
}

/** Starts Claude Code on a thread, in the background: its answer goes to a file, and its end settles it. */
async function start(slug: string, id: string, thread: Thread) {
  const binary = await claudeBinary();
  if (!binary) {
    return answer(slug, id, { outcome: "failed", message: "I couldn't start: Claude Code isn't installed where the studio can find it." });
  }
  const comments = commentsFileSchema.parse(JSON.parse((await readStudioFile(slug, "comments.json")) ?? "[]"));
  const root = comments.find((item) => item.id === id);
  if (!root) {
    return changeThreads(slug, (threads) => {
      delete threads[id];
    });
  }
  // The thread as people wrote it: not Claude's own word that it is waiting, which is no part of what was asked.
  const asked = await promptFor(slug, root, comments.filter((item) => item.parentId === id && item.id !== thread.run?.reply));
  const prompt = thread.brief ? `${asked}\n\n${thread.brief}` : asked;

  const args = [
    "--print",
    "--output-format", "json",
    "--json-schema", JSON.stringify(ANSWER),
    "--append-system-prompt", INSTRUCTIONS,
    // Files in this folder and nothing else: no shell, no web, no settings or MCP servers of anybody's, no skills.
    "--restricted",
    "--tools", "Read,Edit,Write,Glob,Grep",
    "--permission-mode", "acceptEdits",
    "--permission-prompts", "none",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--max-budget-usd", BUDGET_USD,
    ...(thread.session ? ["--resume", thread.session] : []),
  ];
  await rm(outputOf(slug, id), { force: true });
  // The folder as it is now, to tell afterwards what the run changed. If that can't be taken, the run has no undo.
  await snapshot(workingFolder(slug), snapshotOf(slug), id).catch(() => rm(snapshotOf(slug), { recursive: true, force: true }));
  const out = openSync(outputOf(slug, id), "w");
  // Its own process group, so it outlives a restart of the studio; never a shell, so nothing in a comment is run.
  const child = spawn(binary, args, { cwd: workingFolder(slug), detached: true, stdio: ["pipe", out, "ignore"], timeout: LIMIT_MS });
  closeSync(out);
  // Settled when it ends (or couldn't start); if the studio has restarted by then, the next read of the comments settles it instead.
  const settle = () => void inTurn(slug, () => next(slug));
  child.on("error", settle);
  child.on("exit", settle);
  child.stdin?.on("error", () => {});
  child.stdin?.end(prompt);
  child.unref();

  await changeThreads(slug, (threads) => {
    threads[id] = { ...threads[id], run: { ...threads[id]?.run, state: "working", at: new Date().toISOString(), pid: child.pid } };
  });
  await standIn(slug, id, WORKING);
}
