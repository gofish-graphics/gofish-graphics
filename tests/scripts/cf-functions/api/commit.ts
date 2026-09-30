/**
 * Cloudflare Pages Function: hand accepted visual diffs to GitHub Actions.
 *
 * Route: POST /api/commit
 *
 * The review site sends only what the reviewer decided: which stories of
 * which CI run to accept, and which stale baselines to remove. This function
 * sends that as one `visual-baselines-accept` repository_dispatch and returns
 * right away. The `accept-visual-baselines.yml` workflow does the rest with
 * tests/scripts/accept-baselines.ts: it copies the files from the run's
 * `js-dom-capture` artifact onto `snapshots/<branch>` in one commit, keeps
 * the `Visual Diff Review` status up to date, and re-runs the run's failed
 * jobs once the run has finished. That script also checks the story paths.
 *
 * Request body:  { repo, branch, runId, paths, removals? }
 *   branch is the code branch (the workflow writes to snapshots/<branch>).
 * Response:      { ok, workflowUrl } or { ok: false, error }
 *
 * The dispatch's client_payload is { branch, run_id, paths, removals }.
 * GitHub allows at most 10 top-level keys and 65535 characters in it. Story
 * paths are about 60 characters, so this holds for about a thousand stories;
 * a larger request is refused with a pointer to running the script by hand.
 *
 * GITHUB_TOKEN is a Cloudflare Pages secret. It needs only Contents write,
 * which GitHub requires to send repository_dispatch.
 */

interface Env {
  GITHUB_TOKEN: string;
}

interface AcceptBody {
  repo: string;
  /** Code branch of the run, e.g. "my-feature" (not "snapshots/..."). */
  branch: string;
  /** Visual Tests workflow run id whose capture to accept. */
  runId: string | number;
  /** Story paths to accept as baselines. */
  paths: string[];
  /** Story paths whose baselines to delete (accepted removals). */
  removals?: string[];
}

const WORKFLOW_FILE = "accept-visual-baselines.yml";
const MAX_CLIENT_PAYLOAD_CHARS = 65535;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((p) => typeof p === "string");
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    return await handleAccept(ctx);
  } catch (e) {
    return json({ ok: false, error: `Unexpected error: ${String(e)}` }, 500);
  }
};

async function handleAccept(
  ctx: EventContext<Env, string, unknown>
): Promise<Response> {
  const { env, request } = ctx;

  const token = env.GITHUB_TOKEN;
  if (!token) {
    return json({ ok: false, error: "GITHUB_TOKEN not configured" }, 500);
  }

  let body: AcceptBody;
  try {
    const raw = (await request.json()) as Partial<AcceptBody>;
    const paths = raw.paths ?? [];
    const removals = raw.removals ?? [];
    if (
      typeof raw.repo !== "string" ||
      !/^[\w.-]+\/[\w.-]+$/.test(raw.repo) ||
      typeof raw.branch !== "string" ||
      raw.branch === "" ||
      !/^\d+$/.test(String(raw.runId ?? "")) ||
      !isStringList(paths) ||
      !isStringList(removals) ||
      paths.length + removals.length === 0
    ) {
      return json({ ok: false, error: "Invalid request body" }, 400);
    }
    body = { ...raw, paths, removals } as AcceptBody;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const { repo, branch, runId, paths, removals = [] } = body;

  const clientPayload = { branch, run_id: Number(runId), paths, removals };
  if (JSON.stringify(clientPayload).length > MAX_CLIENT_PAYLOAD_CHARS) {
    return json(
      {
        ok: false,
        error:
          "Too many paths for one repository_dispatch. Run the accept script by hand: " +
          `pnpm --filter @gofish/tests accept-baselines ${runId} ${branch} --all ` +
          "accepts every diff this run reported, or pass --accept-file/--remove-file for a subset.",
      },
      413
    );
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "gofish-visual-review/1.0",
    },
    body: JSON.stringify({
      event_type: "visual-baselines-accept",
      client_payload: clientPayload,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      // Not JSON; report the raw body.
    }
    return json(
      {
        ok: false,
        error: `GitHub repository_dispatch failed (${res.status}): ${message}`,
      },
      res.status === 401 ? 401 : 502
    );
  }

  return json({
    ok: true,
    workflowUrl: `https://github.com/${repo}/actions/workflows/${WORKFLOW_FILE}`,
  });
}
