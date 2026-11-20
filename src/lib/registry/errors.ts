/**
 * An error about where things are kept (GitHub, the environment, a stored file that no longer parses) rather than about
 * what the person did. Its message is for the logs: it names repositories, paths and variables, which the interface
 * never shows (CLAUDE.md, data rule 7). Every other error's message is written to be read, and is passed on as it is.
 */
export class InfraError extends Error {}

/** What to tell the person about a failure: the message when it was written for them, otherwise a plain line, with the real one logged. */
export function userMessage(error: unknown, fallback = "That didn't save. Try again.") {
  if (error instanceof Error && !(error instanceof InfraError)) return error.message;
  console.error(error);
  return fallback;
}
