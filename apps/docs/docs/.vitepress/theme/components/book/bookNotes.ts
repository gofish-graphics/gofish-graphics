// Where a reader's feedback on "Under the Surface" goes. The note box
// (BookNoteBox.vue) collects it: a one-click reaction, a "stopped reading
// here" mark, some text, or any mix of the three. A transport sends it. The page picks
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

export const MAX_NOTE = 2000;

/** The one-click reactions, in the order the box shows them. They are the
 *  four that beta reading asks for, worst first. */
export const REACTIONS = [
  {
    value: "confusing",
    label: "Confusing",
    emoji: "😕",
    prompt: "What lost you?",
  },
  { value: "slow", label: "Slow", emoji: "🐌", prompt: "What could be cut?" },
  {
    value: "useful",
    label: "Useful",
    emoji: "💡",
    prompt: "What did it help with?",
  },
  { value: "loved", label: "Loved it", emoji: "❤️", prompt: "What worked?" },
] as const;
export type Reaction = (typeof REACTIONS)[number]["value"];

/** The text box's label, which follows the chosen reaction. */
export function promptFor(reaction: Reaction | undefined): string {
  return (
    REACTIONS.find((r) => r.value === reaction)?.prompt ??
    "What was your reaction here?"
  );
}
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
  /** The reader's one-click reaction, if any. */
  reaction?: Reaction;
  /** The reader marked "I stopped reading here". */
  stopped: boolean;
  /** What the reader typed, maybe "" when there is a reaction or a stop. */
  text: string;
}

/** The parts of a note the reader fills in, which the draft keeps. */
export type Draft = Pick<Note, "reaction" | "stopped" | "text">;

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
  if (note.reaction) lines.push(`Reaction: ${note.reaction}`);
  if (note.stopped) lines.push("Stopped reading here: yes");
  if (note.reaction || note.stopped) lines.push("");
  if (note.text.trim())
    lines.push(`**${promptFor(note.reaction)}**`, "", note.text.trim(), "");
  const q = new URLSearchParams({
    title: `Feedback on "${note.question}"`,
    labels: "book-feedback",
    body: lines.join("\n"),
  });
  return `${REPO}/issues/new?${q.toString()}`;
}

const brief: Transport = {
  action: "Send feedback",
  hint: "",
  async send(note) {
    const res = await fetch(ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: note.slug,
        anchor: note.anchor,
        quote: note.quote,
        reaction: note.reaction,
        stopped: note.stopped,
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
  hint: "Opens GitHub with your feedback filled in. You submit it there.",
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

const EMPTY: Draft = { reaction: undefined, stopped: false, text: "" };

export function loadDraft(key: string): Draft {
  try {
    const raw = store("local")?.getItem(DRAFT + key);
    if (!raw) return { ...EMPTY };
    const d = JSON.parse(raw);
    return {
      reaction: REACTIONS.some((r) => r.value === d?.reaction)
        ? d.reaction
        : undefined,
      stopped: d?.stopped === true,
      text: typeof d?.text === "string" ? d.text : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveDraft(key: string, draft: Draft) {
  try {
    if (draft.reaction || draft.stopped || draft.text)
      store("local")?.setItem(DRAFT + key, JSON.stringify(draft));
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
