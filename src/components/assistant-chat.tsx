"use client";

import { useEffect, useRef, useState } from "react";
import type { assistant } from "@/lib/i18n/dict/assistant";
import { markdownToHtml } from "@/lib/markdown-lite";

type Text = (typeof assistant)["en"];
type Turn = { role: "user" | "assistant"; content: string };
type Event = { t: "text"; v: string } | { t: "tool"; name: string } | { t: "done" } | { t: "error"; code: keyof Text["errors"] };

const STORE = "oc-assistant-v1";
/** turns sent with a question; older ones are left out (the API never sees thinking from earlier turns, so that is safe) */
const SEND_TURNS = 39;

function load(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORE);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((t): t is Turn => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string") : [];
  } catch {
    return [];
  }
}

function save(turns: Turn[]) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(turns));
  } catch {
    // private window or storage off: the chat still works, it just is not kept on reload
  }
}

/**
 * The chat. The conversation lives in this component and in the tab's sessionStorage (the member's own browser),
 * never in a URL; each question posts it to /api/assistant/chat, which streams JSON lines back. Answers are rendered
 * with markdown-lite, which escapes everything first.
 */
export function AssistantChat({ text }: { text: Text }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTurns(load());
  }, []);
  useEffect(() => {
    // braces on purpose: newer browsers return a Promise from scrollIntoView, and an effect must not return one
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, status]);

  const update = (fn: (prev: Turn[]) => Turn[]) =>
    setTurns((prev) => {
      const next = fn(prev);
      save(next);
      return next;
    });

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setDraft("");
    const history = [...turns.filter((t) => t.content.trim()), { role: "user" as const, content: q }];
    let send = history.slice(-SEND_TURNS);
    while (send[0] && send[0].role !== "user") send = send.slice(1);
    update(() => [...history, { role: "assistant", content: "" }]);
    setBusy(true);
    setStatus(text.thinking);
    const ctrl = new AbortController();
    abort.current = ctrl;

    const append = (v: string) =>
      update((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === "assistant" ? [...prev.slice(0, -1), { ...last, content: last.content + v }] : prev;
      });

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: send }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        setError(res.status === 401 ? text.errors.unauthorized : text.errors.ai_failed);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let e: Event;
          try {
            e = JSON.parse(line) as Event;
          } catch {
            continue;
          }
          if (e.t === "text") {
            setStatus(null);
            append(e.v);
          } else if (e.t === "tool") {
            setStatus(text.tools[e.name] ?? text.thinking);
            // a new round after tools: keep the earlier sentence apart from what comes next
            update((prev) => {
              const last = prev[prev.length - 1];
              return last?.role === "assistant" && last.content && !last.content.endsWith("\n\n")
                ? [...prev.slice(0, -1), { ...last, content: `${last.content}\n\n` }]
                : prev;
            });
          } else if (e.t === "error") {
            setError(text.errors[e.code] ?? text.errors.ai_failed);
          }
        }
      }
    } catch {
      if (!ctrl.signal.aborted) setError(text.errors.network);
    } finally {
      setBusy(false);
      setStatus(null);
      abort.current = null;
      // an answer that never started is dropped, so the question can simply be asked again
      update((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === "assistant" && !last.content.trim() ? prev.slice(0, -1) : prev;
      });
    }
  }

  const reset = () => {
    abort.current?.abort();
    update(() => []);
    setError(null);
  };

  return (
    <div className="as-chat">
      {turns.length === 0 && (
        <div className="as-examples">
          {text.examples.map((q) => (
            <button key={q} type="button" className="as-example" onClick={() => void ask(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="as-log" aria-live="polite">
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="as-msg as-user">
              <span className="as-who">{text.you}</span>
              <p dir="auto">{t.content}</p>
            </div>
          ) : (
            <div key={i} className="as-msg as-claude">
              <span className="as-who">{text.claude}</span>
              {/* markdown-lite escapes all HTML before adding its own tags, so this is safe; the direction follows the answer's language */}
              <div className="as-md" dir="auto" dangerouslySetInnerHTML={{ __html: markdownToHtml(t.content) }} />
            </div>
          ),
        )}
        {status && (
          <p className="as-status muted small" role="status">
            {status}
          </p>
        )}
        {error && (
          <p className="notice warn" role="alert">
            {error}
          </p>
        )}
        {turns.length > SEND_TURNS && <p className="muted small">{text.tooLong}</p>}
        <div ref={end} />
      </div>

      <form
        className="as-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          placeholder={text.placeholder}
          rows={2}
          maxLength={4000}
          dir="auto"
          aria-label={text.placeholder}
        />
        <div className="as-actions">
          {busy ? (
            <button type="button" className="btn secondary" onClick={() => abort.current?.abort()}>
              {text.stop}
            </button>
          ) : (
            <button type="submit" className="btn" disabled={!draft.trim()}>
              {text.send}
            </button>
          )}
          {turns.length > 0 && !busy && (
            <button type="button" className="btn-link" onClick={reset}>
              {text.newChat}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
