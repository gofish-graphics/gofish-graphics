// Where a reader's note on "Under the Surface" goes. The note box
// (BookNoteBox.vue) collects the note; a transport sends it. The page picks
// one transport when it loads:
//
// - `brief`: on the local dev server, the dev-only plugin in
//   .vitepress/book-notes-server.ts answers GET /__book/note, and a POST to it
//   writes the note straight into the chapter's brief.
// - `issue`: anywhere else (the published site is static), the note opens a
//   prefilled new GitHub issue in a new tab, which the reader submits there.
//
// TODO: a third transport, `service`: a small web service that files the
// GitHub issue for the reader, so no tab opens on the published site. It is
// one more `Transport` whose `send` POSTs the note to that service; pick it in
// `chooseTransport` when the service answers. Not built yet.
import { REPO } from "./book";

export const PROMPT = "What lost you, or what is wrong?";
export const MAX_NOTE = 2000;
const ROUTE = "/__book/note";

/** One note, about one passage of a chapter or about the whole chapter. */
export interface Note {
  /** The chapter's slug, the name of its brief. */
  slug: string;
  /** The chapter's question. */
  question: string;
  /** The chapter's markdown file, repo-relative. */
  sourcePath: string;
  /** The id of the passage's figure or of the heading above it, or "". */
  anchor: string;
  /** The page URL with that anchor. */
  anchorUrl: string;
  /** The passage's text, or "" for the whole chapter. */
  quote: string;
  /** What the reader typed. */
  text: string;
}

export interface Sent {
  /** What the box says afterwards. */
  message: string;
  /** The note has reached its destination, so the passage gets a mark. False
   *  when the reader still has to finish it elsewhere. */
  delivered: boolean;
}

export interface Transport {
  /** The primary button. */
  action: string;
  /** One quiet line under the button, or "". */
  hint: string;
  /** Sends the note. Rejects with an error to show in the box. */
  send(note: Note): Promise<Sent>;
}

/** The prefilled new-issue URL for a note. */
export function issueUrl(note: Note): string {
  const lines = [
    `**Chapter:** ${note.question}`,
    `**Page:** \`${note.sourcePath}\``,
    `**Where:** ${note.anchorUrl}`,
    "",
  ];
  if (note.quote)
    lines.push(...note.quote.split("\n").map((l) => `> ${l}`), "");
  lines.push(`**${PROMPT}**`, "", note.text.trim(), "");
  const q = new URLSearchParams({
    title: `Note on "${note.question}"`,
    labels: "book-note",
    body: lines.join("\n"),
  });
  return `${REPO}/issues/new?${q.toString()}`;
}

const brief: Transport = {
  action: "Save note",
  hint: "",
  async send(note) {
    const res = await fetch(ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: note.slug,
        anchor: note.anchor,
        quote: note.quote,
        text: note.text,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(body.error ?? `The server said ${res.status}.`);
    return {
      message:
        "Saved to this chapter's brief. It will be used at the next rebuild.",
      delivered: true,
    };
  },
};

const issue: Transport = {
  action: "Open as GitHub issue",
  hint: "Opens GitHub with your note filled in. You submit it there.",
  async send(note) {
    window.open(issueUrl(note), "_blank", "noopener,noreferrer");
    return {
      message: "Opened in a new tab. Submit it there.",
      delivered: false,
    };
  },
};

let chosen: Promise<Transport> | undefined;

/** The transport for this page load. The dev plugin answers the probe with
 *  JSON; a static host answers 404, and a dev server started without the
 *  plugin answers with a page, so both of those get `issue`. */
export function chooseTransport(): Promise<Transport> {
  chosen ??= fetch(ROUTE, { headers: { Accept: "application/json" } })
    .then(async (res) => {
      if (!res.ok) return issue;
      if (!res.headers.get("content-type")?.includes("application/json"))
        return issue;
      const body = await res.json();
      return body?.transport === "brief" ? brief : issue;
    })
    .catch(() => issue);
  return chosen;
}

// ---- drafts and marks ------------------------------------------------------
// Browser storage can be missing or throw (private windows, blocked site
// data). It only remembers drafts and marks, so every access is optional.

const DRAFT = "book-note-draft:";
const SENT = "book-note-sent:";

function store(kind: "local" | "session"): Storage | undefined {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function loadDraft(key: string): string {
  try {
    return store("local")?.getItem(DRAFT + key) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(key: string, text: string) {
  try {
    if (text) store("local")?.setItem(DRAFT + key, text);
    else store("local")?.removeItem(DRAFT + key);
  } catch {
    /* no storage: the draft lasts as long as the box */
  }
}

export function isSent(key: string): boolean {
  try {
    return store("session")?.getItem(SENT + key) === "1";
  } catch {
    return false;
  }
}

export function markSent(key: string) {
  try {
    store("session")?.setItem(SENT + key, "1");
  } catch {
    /* no storage: the mark lasts until the page is rebuilt */
  }
}

/** A short stable hash, so a passage's key does not carry its whole text. */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
