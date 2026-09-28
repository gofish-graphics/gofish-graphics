/**
 * Cloudflare Pages Function: hand accepted visual diffs to GitHub Actions.
 *
 * Route: POST /api/commit
 *
 * The review site sends only what the reviewer decided: which stories of
 * which CI run to accept, and which stale baselines to remove. This function
 * sends that as one `visual-baselines-accept` repository_dispatch and returns
 * right away. The `accept-visual-baselines.yml` workflow does the file work
 * with plain git from the run's own `js-dom-capture` artifact (see
 * tests/scripts/accept-baselines.sh): it commits the baselines to
 * `snapshots/<branch>` in one commit, marks the `Visual Diff Review` status
 * as success, and re-runs the run's failed jobs once the run has finished.
 *
 * Request body:
 *   { repo, branch, runId, headSha?, paths, removals? }
 *   branch is the code branch (the workflow writes to snapshots/<branch>).
 *
 * The dispatch's client_payload is { branch, run_id, paths, removals }.
 * GitHub allows at most 10 top-level keys and 65535 characters in it. Story
 * paths are about 60 characters, so this holds for about a thousand stories;
 * a larger request is refused. The error says how to run the accept script
 * by hand: `--all` accepts every diff the run reported, or `--accept-file`
 * and `--remove-file` take a chosen subset.
 *
 * GITHUB_TOKEN is a Cloudflare Pages secret. It needs Contents write, which
 * is what GitHub requires to send repository_dispatch, and Commit statuses
 * write, to mark the review as pending while the workflow runs (optional:
 * without it the accept still happens). It no longer writes any files, and
 * it does not need Actions access: the workflow downloads the artifact and
 * re-runs the jobs with its own token.
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
  /** PR head SHA, for the pending `Visual Diff Review` status. */
  headSha?: string;
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

function isStoryPathList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        typeof p === "string" &&
        p.endsWith(".html") &&
        !p.startsWith("/") &&
        !`/${p}/`.includes("/../")
    )
  );
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
      !isStoryPathList(paths) ||
      !isStoryPathList(removals) ||
      paths.length + removals.length === 0
    ) {
      return json({ ok: false, error: "Invalid request body" }, 400);
    }
    body = { ...raw, paths, removals } as AcceptBody;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const { repo, branch, runId, headSha, paths, removals = [] } = body;

  const clientPayload = {
    branch,
    run_id: Number(runId),
    paths,
    removals,
  };
  if (JSON.stringify(clientPayload).length > MAX_CLIENT_PAYLOAD_CHARS) {
    return json(
      {
        ok: false,
        error:
          "Too many paths for one repository_dispatch. Run the accept script by hand: " +
          `tests/scripts/accept-baselines.sh ${runId} ${branch} --all accepts every diff this run reported, ` +
          "or pass --accept-file/--remove-file for a subset.",
      },
      413
    );
  }

  const githubHeaders = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "gofish-visual-review/1.0",
  };
  const apiBase = `https://api.github.com/repos/${repo}`;
  const workflowUrl = `https://github.com/${repo}/actions/workflows/${WORKFLOW_FILE}`;

  const dispatchRes = await fetch(`${apiBase}/dispatches`, {
    method: "POST",
    headers: githubHeaders,
    body: JSON.stringify({
      event_type: "visual-baselines-accept",
      client_payload: clientPayload,
    }),
  });
  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    let message = text;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      // Not JSON; report the raw body.
    }
    return json(
      {
        ok: false,
        error: `GitHub repository_dispatch failed (${dispatchRes.status}): ${message}`,
      },
      dispatchRes.status === 401 ? 401 : 502
    );
  }

  // Best effort: show on the PR that the accept is in progress. The
  // workflow sets the final state.
  const warnings: string[] = [];
  if (headSha && /^[0-9a-f]{40}$/.test(headSha)) {
    try {
      const statusRes = await fetch(`${apiBase}/statuses/${headSha}`, {
        method: "POST",
        headers: githubHeaders,
        body: JSON.stringify({
          state: "pending",
          target_url: workflowUrl,
          description:
            `Accepting ${paths.length} diff(s)` +
            (removals.length > 0 ? `, removing ${removals.length}` : "") +
            "; committing baselines",
          context: "Visual Diff Review",
        }),
      });
      if (!statusRes.ok) {
        warnings.push(
          `status update failed (${statusRes.status}); the token may be missing 'Commit statuses: write'`
        );
      }
    } catch (e) {
      warnings.push(`status update threw: ${String(e)}`);
    }
  }

  return json({
    ok: true,
    accepted: paths.length,
    removed: removals.length,
    workflowUrl,
    warnings,
  });
}
