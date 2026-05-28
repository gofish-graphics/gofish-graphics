/**
 * Cloudflare Pages Function: batch-commit accepted visual diff stories.
 *
 * Route: POST /api/commit
 *
 * The client fetches file contents in the browser (no subrequest limit) and
 * sends them in the request body. The Worker only makes GitHub API calls:
 * - 1 blob creation per screenshot (binary, needs blob API)
 * - DOM files use tree `content` field directly (no blob API needed)
 * - 5–7 fixed GitHub calls: get ref, get commit, create tree, create commit,
 *   update/create ref, and (final chunk only) status update + rerun.
 *
 * Cloudflare caps each invocation at 50 outgoing subrequests (free plan),
 * so the client splits accepts into chunks of ~25 and calls /api/commit
 * once per chunk. Each chunk creates a follow-on commit on top of the
 * previous chunk's HEAD — fine for the snapshot orphan branch, whose
 * history is already a long "Accept N visual diff(s)" chain.
 *
 * Request body:
 *   { paths, domContents, screenshotContents, repo, branch,
 *     headSha?, runId? }  // headSha/runId set on the final chunk only
 *
 * GITHUB_TOKEN is a Cloudflare Pages secret.
 */

interface Env {
  GITHUB_TOKEN: string;
}

interface CommitBody {
  paths: string[];
  domContents: Record<string, string>; // storyPath → HTML text
  screenshotContents: Record<string, string>; // pngPath → base64
  repo: string;
  /** The snapshot branch to commit to (e.g. "snapshots/my-feature") */
  branch: string;
  /** PR head SHA — used to update the Visual Diff Review commit status. */
  headSha?: string;
  /** Workflow run id — if provided, rerun-failed-jobs is triggered post-commit
   *  so visual-test re-runs against the new baselines and python-parity gets to run. */
  runId?: string;
}

type TreeItem = {
  path: string;
  mode: string;
  type: string;
  sha?: string;
  content?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function createBlob(
  apiBase: string,
  headers: Record<string, string>,
  content: string
): Promise<string> {
  const res = await fetch(`${apiBase}/git/blobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, encoding: "base64" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub blob creation failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

async function githubJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${label} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    return await handleCommit(ctx);
  } catch (e) {
    return json({ ok: false, error: `Unexpected error: ${String(e)}` }, 500);
  }
};

async function handleCommit(
  ctx: EventContext<Env, string, unknown>
): Promise<Response> {
  const { env, request } = ctx;

  const token = env.GITHUB_TOKEN;
  if (!token) {
    return json({ error: "GITHUB_TOKEN not configured" }, 500);
  }

  let body: CommitBody;
  try {
    const raw = (await request.json()) as Partial<CommitBody>;
    if (
      !Array.isArray(raw.paths) ||
      raw.paths.length === 0 ||
      !raw.repo ||
      !raw.branch
    ) {
      return json({ error: "Invalid request body" }, 400);
    }
    body = raw as CommitBody;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    paths,
    domContents = {},
    screenshotContents = {},
    repo,
    branch,
    headSha: prHeadSha,
    runId,
  } = body;
  const [owner, repoName] = repo.split("/");

  const githubHeaders = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "gofish-visual-review/1.0",
  };
  const apiBase = `https://api.github.com/repos/${owner}/${repoName}`;

  const treeItems: TreeItem[] = [];
  const errors: string[] = [];
  let accepted = 0;

  for (const storyPath of paths) {
    const pngPath = storyPath.replace(/\.html$/, ".png");
    try {
      const domContent = domContents[storyPath];
      if (domContent == null) {
        errors.push(`${storyPath}: DOM content not provided`);
        continue;
      }

      // Use tree `content` for DOM files — GitHub creates the blob internally,
      // saving a subrequest compared to creating the blob explicitly.
      // On the snapshot branch, files live at dom/ and screenshots/ (no __snapshots__/ prefix).
      treeItems.push({
        path: `dom/${storyPath}`,
        mode: "100644",
        type: "blob",
        content: domContent,
      });

      // Screenshots are binary, so they still need the blob API.
      const screenshotBase64 = screenshotContents[pngPath];
      if (screenshotBase64) {
        const screenshotBlobSha = await createBlob(
          apiBase,
          githubHeaders,
          screenshotBase64
        );
        treeItems.push({
          path: `screenshots/${pngPath}`,
          mode: "100644",
          type: "blob",
          sha: screenshotBlobSha,
        });
      }

      accepted++;
    } catch (e) {
      errors.push(`${storyPath}: ${String(e)}`);
    }
  }

  if (treeItems.length === 0) {
    return json({ ok: false, accepted: 0, errors });
  }

  // Get current HEAD SHA of the snapshot branch, or null if it doesn't exist yet.
  const refRes = await fetch(`${apiBase}/git/ref/heads/${branch}`, {
    headers: githubHeaders,
  });

  let headSha: string | null = null;
  let baseTreeSha: string | null = null;

  if (refRes.ok) {
    const refData = (await refRes.json()) as { object: { sha: string } };
    headSha = refData.object.sha;

    // Get base tree SHA from the existing commit.
    const commitData = await githubJson<{ tree: { sha: string } }>(
      await fetch(`${apiBase}/git/commits/${headSha}`, {
        headers: githubHeaders,
      }),
      `get commit ${headSha}`
    );
    baseTreeSha = commitData.tree.sha;
  } else if (refRes.status === 404) {
    // Per-PR snapshot branch doesn't exist yet — initialize from snapshots/main
    // so the new orphan inherits all baselines, with accepted entries layered on top.
    // Without this, the new branch would contain ONLY the accepted entries, and the
    // next CI run (which prefers the per-PR branch over snapshots/main) would report
    // every other story as "new".
    const mainRefRes = await fetch(`${apiBase}/git/ref/heads/snapshots/main`, {
      headers: githubHeaders,
    });
    if (mainRefRes.ok) {
      const mainRefData = (await mainRefRes.json()) as {
        object: { sha: string };
      };
      const mainCommit = await githubJson<{ tree: { sha: string } }>(
        await fetch(`${apiBase}/git/commits/${mainRefData.object.sha}`, {
          headers: githubHeaders,
        }),
        `get commit ${mainRefData.object.sha}`
      );
      baseTreeSha = mainCommit.tree.sha;
      // headSha stays null so the new commit is parentless and the branch ref is
      // created via POST /git/refs below.
    } else if (mainRefRes.status !== 404) {
      const text = await mainRefRes.text();
      throw new Error(
        `GitHub get snapshots/main ref failed (${mainRefRes.status}): ${text}`
      );
    }
    // If snapshots/main also doesn't exist (truly fresh repo), baseTreeSha stays
    // null and we fall back to creating an empty-base orphan.
  } else {
    const text = await refRes.text();
    throw new Error(`GitHub get ref failed (${refRes.status}): ${text}`);
  }

  // Create tree with all changes (base_tree omitted for orphan branch creation).
  const newTree = await githubJson<{ sha: string }>(
    await fetch(`${apiBase}/git/trees`, {
      method: "POST",
      headers: githubHeaders,
      body: JSON.stringify({
        ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
        tree: treeItems,
      }),
    }),
    "create tree"
  );

  // Create single commit (no parents if this is a new orphan branch).
  const newCommit = await githubJson<{ sha: string }>(
    await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers: githubHeaders,
      body: JSON.stringify({
        message: `Accept ${accepted} visual diff(s)`,
        tree: newTree.sha,
        parents: headSha ? [headSha] : [],
      }),
    }),
    "create commit"
  );

  // Create or update the snapshot branch ref.
  if (headSha) {
    // Branch exists — fast-forward.
    const updateRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers: githubHeaders,
      body: JSON.stringify({ sha: newCommit.sha }),
    });
    if (!updateRes.ok) {
      const text = await updateRes.text();
      throw new Error(`Failed to update branch ref: ${text}`);
    }
  } else {
    // Branch doesn't exist — create it.
    const createRes = await fetch(`${apiBase}/git/refs`, {
      method: "POST",
      headers: githubHeaders,
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: newCommit.sha,
      }),
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Failed to create branch ref: ${text}`);
    }
  }

  // Best-effort post-commit actions: flip the Visual Diff Review status to
  // success (so the PR's checks reflect the action immediately) and rerun the
  // failed workflow jobs (so visual-test re-runs against the new baselines
  // and python-parity, blocked on visual-test, finally executes). Failures
  // here are non-fatal — the snapshot commit already succeeded.
  const postCommitWarnings: string[] = [];

  if (prHeadSha) {
    try {
      const statusRes = await fetch(`${apiBase}/statuses/${prHeadSha}`, {
        method: "POST",
        headers: githubHeaders,
        body: JSON.stringify({
          state: "success",
          target_url: `https://github.com/${repo}/tree/${branch}`,
          description: `Accepted ${accepted} diff(s); re-running tests`,
          context: "Visual Diff Review",
        }),
      });
      if (!statusRes.ok) {
        postCommitWarnings.push(
          `status update failed (${statusRes.status}) — token may be missing 'statuses: write'`
        );
      }
    } catch (e) {
      postCommitWarnings.push(`status update threw: ${String(e)}`);
    }
  }

  if (runId) {
    try {
      const rerunRes = await fetch(
        `${apiBase}/actions/runs/${runId}/rerun-failed-jobs`,
        { method: "POST", headers: githubHeaders }
      );
      if (!rerunRes.ok) {
        postCommitWarnings.push(
          `rerun failed (${rerunRes.status}) — token may be missing 'actions: write'`
        );
      }
    } catch (e) {
      postCommitWarnings.push(`rerun threw: ${String(e)}`);
    }
  }

  return json({
    ok: errors.length === 0,
    accepted,
    errors,
    commitSha: newCommit.sha,
    postCommitWarnings,
  });
}
