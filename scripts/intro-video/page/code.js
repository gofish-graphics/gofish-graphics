// The code panel: tokenizing, syntax classes, typing, and one-hunk-per-line
// diffs between the code strings the video executes. Everything here is a pure
// function of the code strings and the time `t`, so a frame never depends on
// what was drawn before it.

const TOKEN_RE =
  /("(?:[^"\\]|\\.)*")|(\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d"])/g;

/** Split one line of JS into tokens with a highlight class. */
export function tokenizeLine(line) {
  const raw = [];
  for (const m of line.matchAll(TOKEN_RE)) {
    const [text, str, num, id, ws] = m;
    raw.push({
      text,
      kind: str ? "str" : num ? "num" : id ? "id" : ws ? "ws" : "punct",
    });
  }
  // Refine identifiers by what follows them: `name(` is a call, `name:` a key.
  return raw.map((tok, i) => {
    if (tok.kind !== "id") return tok;
    if (tok.text === "true" || tok.text === "false")
      return { ...tok, kind: "kw" };
    let j = i + 1;
    while (raw[j]?.kind === "ws") j++;
    const next = raw[j]?.text;
    if (next === "(") return { ...tok, kind: "fn" };
    if (next === ":") return { ...tok, kind: "field" };
    return tok;
  });
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** HTML for a token list, cut to its first `limit` characters. */
function tokensHtml(tokens, limit = Infinity) {
  let out = "";
  let used = 0;
  for (const tok of tokens) {
    if (used >= limit) break;
    const text = tok.text.slice(0, limit - used);
    used += text.length;
    out +=
      tok.kind === "ws"
        ? text
        : `<span class="tok-${tok.kind}">${esc(text)}</span>`;
  }
  return out;
}

const tokLen = (tokens) => tokens.reduce((n, t) => n + t.text.length, 0);

/**
 * Diff two code strings line by line. The edits in this video never add or
 * remove lines, so each changed line becomes one hunk: the common token prefix
 * and suffix stay, and the middle is deleted and/or inserted.
 */
export function diffLines(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  if (la.length !== lb.length) {
    throw new Error("diffLines: the edits must keep the same line count");
  }
  const hunks = [];
  for (let i = 0; i < la.length; i++) {
    if (la[i] === lb[i]) continue;
    const ta = tokenizeLine(la[i]);
    const tb = tokenizeLine(lb[i]);
    let p = 0;
    while (p < ta.length && p < tb.length && ta[p].text === tb[p].text) p++;
    let s = 0;
    while (
      s < ta.length - p &&
      s < tb.length - p &&
      ta[ta.length - 1 - s].text === tb[tb.length - 1 - s].text
    )
      s++;
    hunks.push({
      line: i,
      prefix: tb.slice(0, p),
      del: ta.slice(p, ta.length - s),
      ins: tb.slice(p, tb.length - s),
      suffix: tb.slice(tb.length - s),
    });
  }
  return hunks;
}

// ---- timing helpers -------------------------------------------------------

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeInOut = (x) => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** Eased progress of `t` through [a, b]. */
export const ramp = (t, a, b) => easeInOut((t - a) / (b - a));

/**
 * When each character of `text` appears, typing from `start` at `cps`
 * characters per second, with an extra `linePause` after each newline.
 * Returns { times, end } where times[i] is when character i appears.
 */
export function typingSchedule(text, start, cps, linePause = 0) {
  const times = [];
  let t = start;
  for (const ch of text) {
    times.push(t);
    t += 1 / cps + (ch === "\n" ? linePause : 0);
  }
  return { times, end: t };
}

/** How many characters of a schedule are visible at time t. */
export function typedCount(schedule, t) {
  let n = 0;
  while (n < schedule.times.length && schedule.times[n] <= t) n++;
  return n;
}

// ---- rendering ------------------------------------------------------------

const caret = `<span class="caret"></span>`;

/** Typing phase: the first `count` characters of `code`, with a caret. */
export function typingHtml(code, count, showCaret) {
  const lines = code.split("\n");
  const out = [];
  let offset = 0;
  for (const line of lines) {
    const visible = Math.max(0, Math.min(line.length, count - offset));
    let html = tokensHtml(tokenizeLine(line), visible);
    // The caret sits on the line being typed. Character `offset + length` is
    // this line's newline; once it is typed the caret moves down a line.
    if (showCaret && count >= offset && count <= offset + line.length) {
      html += caret;
    }
    out.push(html);
    offset += line.length + 1;
  }
  return out.join("\n");
}

/**
 * One edit step (code `a` → code `b`) at time t. `plan[k]` gives hunk k its
 * timing: { mark: [t0, t1], strike: [t0, t1], type: schedule, collapse: [t0, t1] }.
 * `highlight` is the opacity of the edit highlights (fades out after the step).
 */
export function editHtml(a, hunks, plan, t, highlight) {
  const lines = a.split("\n").map((l) => tokensHtml(tokenizeLine(l)));
  hunks.forEach((h, k) => {
    const p = plan[k];
    let html = tokensHtml(h.prefix);
    // Deleted tokens: tinted, struck through, then collapsed away.
    if (h.del.length) {
      const mark = clamp01((t - p.mark[0]) / (p.mark[1] - p.mark[0]));
      const strike = ramp(t, p.strike[0], p.strike[1]);
      const gone = ramp(t, p.collapse[0], p.collapse[1]);
      if (gone < 1) {
        const n = tokLen(h.del);
        html +=
          `<span class="seg seg-del" style="width:${(n * (1 - gone)).toFixed(3)}ch;` +
          `margin-right:${(0.25 * (1 - gone)).toFixed(3)}ch;` +
          `opacity:${(1 - gone).toFixed(3)};` +
          `background:rgba(194,65,59,${(0.14 * easeInOut(mark)).toFixed(3)})">` +
          `${tokensHtml(h.del)}<span class="strike" style="width:${(strike * 100).toFixed(2)}%"></span></span>`;
      }
    }
    // Inserted tokens: typed in on a green tint.
    if (h.ins.length) {
      const n = typedCount(p.type, t);
      const typing = n > 0 && n < tokLen(h.ins);
      if (n > 0) {
        html +=
          `<span class="seg seg-ins" style="background:rgba(47,158,110,${(0.18 * highlight).toFixed(3)})">` +
          tokensHtml(h.ins, n) +
          `</span>`;
      }
      if (typing || (t >= p.type.times[0] && n === 0)) html += caret;
    }
    html += tokensHtml(h.suffix);
    lines[h.line] = html;
  });
  return lines.join("\n");
}

/** Plain highlighted code (no edit in progress). */
export function staticHtml(code) {
  return code
    .split("\n")
    .map((l) => tokensHtml(tokenizeLine(l)))
    .join("\n");
}
