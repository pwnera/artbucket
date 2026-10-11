"use client";

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AssistantAnswer } from "@/components/assistant-answer";
import { useMe } from "@/components/can";
import { CopyButton } from "@/components/copy-button";
import { IconArrowUp, IconArrowsMaximize, IconArrowsMinimize, IconHistory, IconPlus, IconSparkles, IconX } from "@/components/icons";
import { IconButton } from "@/components/icon-button";
import { assistantPlace } from "@/lib/assistant-place";
import { jsonLines, plainText } from "@/lib/assistant-answer";
import { refusal, sendResult } from "@/lib/send";
import { FocusScope } from "radix-ui/internal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The server's assistant (ASSISTANT_URL, me.assistant), drawn by the app in a
 * panel beside the page. The server answers, as the person, through the API
 * or MCP; the app draws what it says. Its endpoints, under ASSISTANT_URL:
 *
 *   GET  {url}                 { data: { notice } } when it is closed to this
 *                              person here ({ code, title, text, href?, label? }),
 *                              else { notice: null, project, chats: [{ id, title }],
 *                              ideas: { library: [...], asset: [...] } }
 *   GET  {url}/chats/{id}      { data: { id, title, turns } }: each turn's
 *                              question, answer, steps and the changes it asked
 *   POST {url}/ask             { question, chat?, asset?, where, embed: true }, or
 *                              { chat, approvals: [{ id, approved }] }: the answer,
 *                              as JSON lines (chat, tool, working, text, approval,
 *                              action, ui, error)
 *
 * Refusals are the API's ({ error: { message, code? } }). An answer is a small
 * Markdown with blocks of the assistant's own (lib/assistant-answer.ts).
 *
 * One panel, never remounted once opened: the shell holds it, so an answer
 * goes on while the person goes from page to page, opens and closes assets, or
 * closes the panel. An open asset's dialog leaves it usable (AssistantAsset)
 * and says which asset is open: "this" in a question means it. The assistant
 * can take the person somewhere ({ type: "ui", path }, and a place in an
 * answer): the app goes only to its own pages that show things
 * (assistantPlace), never to one that acts by being opened. A change the
 * person approved and that was made refreshes the page beside it.
 *
 * On a wide screen the panel is docked on the right and the app makes room for
 * it: its width is --assistant-w on <html> while it is open (0 otherwise),
 * which the shell and an open asset's dialog leave free. The person drags its
 * left edge to change it (or uses the arrow keys there), and the width is kept.
 * Expanded, it covers the whole window.
 */

type AssistantValue = {
  url: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The conversation the panel shows: the tab keeps it across reloads. */
  chat: string | null;
  setChat: (chat: string | null) => void;
  /** A change the person approved was made: pages holding what it touched fetch it again. */
  onChanged: () => void;
  /** The asset open in the app, which "this" means in a question. */
  asset: string | null;
  setAsset: React.Dispatch<React.SetStateAction<string | null>>;
  /** The docked panel's width, in pixels. */
  width: number;
  /** Over the whole window rather than beside the page. */
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  setWidth: (width: number, keep?: boolean) => void;
};

/** The panel's width: a usable chat at least, and room left for the app. */
const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 420;
const APP_ROOM = 480;
const clampWidth = (w: number) => Math.round(Math.max(MIN_WIDTH, Math.min(w, 900, (typeof window === "undefined" ? 1440 : window.innerWidth) - APP_ROOM)));

const AssistantContext = createContext<AssistantValue | null>(null);

/** The assistant, where the server has one; null elsewhere (and on /design). */
export const useAssistant = () => useContext(AssistantContext);

export function AssistantProvider({ url, onChanged, children }: { url: string | null; onChanged: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // The tab remembers the conversation across reloads, as it remembers a closed banner (components/shell.tsx).
  const [chat, setChatState] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : sessionStorage.getItem("assistant:chat");
    } catch {
      return null;
    }
  });
  const setChat = useCallback((c: string | null) => {
    setChatState(c);
    try {
      if (c) sessionStorage.setItem("assistant:chat", c);
      else sessionStorage.removeItem("assistant:chat");
    } catch {}
  }, []);
  const [asset, setAsset] = useState<string | null>(null);
  // The width the person last left it at, in this browser; a narrow window only holds it back: wider again, it comes back.
  const [saved] = useState(() => {
    try {
      const w = typeof window === "undefined" ? NaN : Number(localStorage.getItem("assistant:width"));
      return Number.isFinite(w) && w > 0 ? w : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const [width, setWidthState] = useState(() => clampWidth(saved));
  const wanted = useRef(saved);
  const setWidth = useCallback((w: number, keep = false) => {
    const c = clampWidth(w);
    wanted.current = c;
    setWidthState(c);
    if (keep)
      try {
        localStorage.setItem("assistant:width", String(c));
      } catch {}
  }, []);
  // The room the app leaves on the right: the panel's width while it is open.
  const docked = !!url && open;
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--assistant-w", docked ? `${width}px` : "0px");
    return () => void root.removeProperty("--assistant-w");
  }, [docked, width]);
  // A window made narrower keeps room for the app.
  useEffect(() => {
    const fit = () => setWidthState(clampWidth(wanted.current));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const [expanded, setExpanded] = useState(false);
  // Closed, it opens beside the page again.
  if (!open && expanded) setExpanded(false);
  const value = useMemo(
    () => (url ? { url: url.replace(/\/+$/, ""), open, setOpen, chat, setChat, onChanged, asset, setAsset, width, setWidth, expanded, setExpanded } : null),
    [url, open, chat, setChat, onChanged, asset, width, setWidth, expanded],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

/** Why the assistant can't answer this person here, as the server says it. */
type Notice = { code?: string; title: string; text: string; href?: string; label?: string };
type Start = { notice: Notice | null; project?: string; chats?: { id: string; title: string }[]; ideas?: { library: string[]; asset: string[] } };
/** A change the assistant asks to make. `deciding`: the person said yes or no, and it is on its way. */
type Action = { name: string; label: string; input: unknown; state: "waiting" | "deciding" | "done" | "failed" | "declined"; error?: string };
type Step = { tool: string } | { said: string };
/** A question and its answer. `since`: tools run since the answer last had words, where a step's words go. */
type Turn = { question: string; answer: string; steps: Step[]; error?: string; since: number };

/**
 * The panel, rendered once by the shell: a card docked on the right (over the
 * whole screen on a phone, or when expanded). Not a dialog: the page beside it
 * stays usable, and nothing on it closes the panel but its own close or Escape.
 */
export function AssistantPanel() {
  const a = useAssistant();
  const project = useMe()?.project?.id ?? null;
  // Once opened, it stays: an answer goes on while the panel is closed.
  const [opened, setOpened] = useState(false);
  if (a?.open && !opened) setOpened(true);
  // Its history menu, open or not.
  const [menu, setMenu] = useState(false);
  // While its edge is dragged: the app follows without easing.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    document.documentElement.dataset.assistantResizing = "";
    return () => void delete document.documentElement.dataset.assistantResizing;
  }, [dragging]);
  // An asset's dialog locks scrolling outside itself (react-remove-scroll, listening on the document): wheel and touch
  // inside the panel stop here, so the conversation still scrolls beside it.
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const keep = (e: Event) => e.stopPropagation();
    el.addEventListener("wheel", keep, { passive: true });
    el.addEventListener("touchmove", keep, { passive: true });
    return () => {
      el.removeEventListener("wheel", keep);
      el.removeEventListener("touchmove", keep);
    };
  }, [opened]);
  if (!a || !opened) return null;

  return (
    <aside
      ref={panel}
      hidden={!a.open}
      // Beside a modal dialog it stays usable: a click there isn't outside the dialog (ui/dialog.tsx), nor is Escape.
      data-assistant-panel=""
      aria-label="Assistant"
      // Escape anywhere in it closes its history menu, or it (an open asset's dialog leaves it alone, so it may come
      // marked handled already).
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        if (menu) setMenu(false);
        else a.setOpen(false);
      }}
      // A card beside the page, a little off the window's edges; expanded, over the whole window. Above an asset's
      // dialog on a phone, where both cover the screen; usable while one is open (pointer-events: body's are off).
      className={cn(
        "bg-popover text-popover-foreground animate-in slide-in-from-right fixed inset-0 z-[60] flex flex-col overflow-hidden duration-200 pointer-events-auto",
        "md:inset-y-2 md:right-2 md:left-auto md:z-50 md:rounded-xl md:border md:shadow-sm",
        a.expanded ? "md:left-2" : "md:w-[calc(var(--assistant-w)-0.5rem)]",
        !a.open && "hidden",
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the assistant"
        aria-valuenow={a.width}
        aria-valuemin={MIN_WIDTH}
        tabIndex={0}
        title="Drag to resize"
        className={cn("group/edge absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize touch-none outline-none md:block", a.expanded && "md:hidden")}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (dragging) a.setWidth(window.innerWidth - e.clientX);
        }}
        onPointerUp={(e) => {
          if (!dragging) return;
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
          a.setWidth(window.innerWidth - e.clientX, true);
        }}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => a.setWidth(DEFAULT_WIDTH, true)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 80 : 20;
          if (e.key === "ArrowLeft") a.setWidth(a.width + step, true);
          else if (e.key === "ArrowRight") a.setWidth(a.width - step, true);
          else return;
          e.preventDefault();
        }}
      >
        <span
          className={cn(
            "absolute inset-y-3 left-0 w-0.5 rounded-full transition-colors group-hover/edge:bg-primary group-focus-visible/edge:bg-primary",
            dragging && "bg-primary",
          )}
        />
      </div>
      {/* Another project: its own conversations, none of this one's. */}
      <Chat key={project ?? ""} a={a} menu={menu} setMenu={setMenu} />
    </aside>
  );
}

const STATUS_THINKING = "Thinking";

/** The conversation: its header, its turns, and the box to ask in. */
function Chat({ a, menu, setMenu }: { a: AssistantValue; menu: boolean; setMenu: (open: boolean) => void }) {
  const router = useRouter();
  const [start, setStart] = useState<Start | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [actions, setActions] = useState<Record<string, Action>>({});
  const decisions = useRef<Record<string, boolean>>({});
  const [title, setTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // The conversation the turns are of: one loaded or answered, not one the provider merely names. The ref is what
  // answers in flight check; the state, what the panel shows.
  const shown = useRef<string | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  // Following the answer as it is written, unless the person scrolled up to read.
  const stick = useRef(true);

  // The panel's start: what it says, the person's conversations in this project (a project of its own remounts it).
  useEffect(() => {
    let live = true;
    void sendResult("GET", a.url, undefined, { quiet: true }).then((r) => {
      if (!live) return;
      setFailed(!r.ok);
      if (r.ok) setStart(r.data as Start);
    });
    return () => {
      live = false;
    };
  }, [a.url, attempt]);

  /** A conversation's turns; one gone, or of another project, starts afresh. */
  async function open(id: string) {
    shown.current = id;
    const r = await sendResult("GET", `${a.url}/chats/${encodeURIComponent(id)}`, undefined, { quiet: true });
    if (shown.current !== id) return;
    if (!r.ok) {
      shown.current = null;
      setShowing(null);
      return a.setChat(null);
    }
    const c = r.data as { title: string; turns: (Omit<Turn, "since"> & { actions?: Record<string, Action> })[] };
    setShowing(id);
    setTitle(c.title);
    setActions(Object.assign({}, ...c.turns.map((t) => t.actions ?? {})));
    setTurns(c.turns.map(({ question, answer, steps }) => ({ question, answer, steps: steps ?? [], since: 0 })));
    stick.current = true;
  }
  // The conversation the tab was on, once the panel knows it may answer here.
  const resume = useEffectEvent((id: string) => void open(id));
  useEffect(() => {
    if (start && !start.notice && a.chat && a.chat !== shown.current) resume(a.chat);
  }, [start, a.chat]);

  function fresh() {
    shown.current = null;
    setShowing(null);
    a.setChat(null);
    setTurns([]);
    setActions({});
    decisions.current = {};
    setTitle(null);
    setMenu(false);
    box.current?.focus();
  }

  // At the end of the conversation while it grows: words streaming in, and thumbnails and typefaces loading after them.
  useEffect(() => {
    const el = log.current;
    const inner = el?.firstElementChild;
    if (!el || !inner) return;
    const follow = () => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    };
    follow();
    const seen = new ResizeObserver(follow);
    seen.observe(inner);
    return () => seen.disconnect();
  }, []);
  // An answer ended: a change waiting for the person has the focus, or else the box to ask in.
  useEffect(() => {
    if (busy) return;
    const waiting = log.current?.querySelector<HTMLButtonElement>('[data-state="waiting"] button');
    (waiting ?? box.current)?.focus({ preventScroll: true });
  }, [busy]);

  /** The answer being written: the last turn, changed. */
  const current = (f: (t: Turn) => Turn) => setTurns((ts) => (ts.length ? [...ts.slice(0, -1), f(ts.at(-1)!)] : ts));

  /** Sends a question or decisions, and writes the answer into the last turn as it streams. */
  async function stream(body: Record<string, unknown>, first: string, named: string) {
    setBusy(true);
    setStatus(first);
    stick.current = true;
    let changed = false;
    // Where the assistant takes the app: gone to once the answer ends, so the page doesn't move under the person mid-answer.
    let go: string | null = null;
    try {
      const res = await fetch(`${a.url}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) throw new Error(await refusal(res, "Something went wrong"));
      for await (const ev of jsonLines(res)) {
        if (ev.type === "chat" && typeof ev.id === "string") {
          const id = ev.id;
          shown.current = id;
          setShowing(id);
          a.setChat(id);
          setTitle(named);
          setStart((s) => (s ? { ...s, chats: [{ id, title: named }, ...(s.chats ?? [])] } : s));
        } else if (ev.type === "tool" && typeof ev.label === "string") {
          const label = ev.label;
          setStatus(`${label}…`);
          current((t) => ({ ...t, steps: [...t.steps, { tool: label }], since: t.since + 1 }));
        } else if (ev.type === "working" && typeof ev.text === "string") {
          // What it said in a step that only read: not the answer, so it moves to the steps, before that step's tools.
          const said = ev.text;
          current((t) => {
            if (!t.answer.endsWith(said)) return t;
            const steps = [...t.steps];
            steps.splice(steps.length - t.since, 0, { said: said.trim() });
            return { ...t, answer: t.answer.slice(0, -said.length), steps };
          });
        } else if (ev.type === "ui" && typeof ev.path === "string") go = ev.path;
        else if (ev.type === "text" && typeof ev.text === "string") {
          const text = ev.text;
          // The first words after the steps start the answer: no paragraph break above them.
          current((t) => ({ ...t, answer: t.answer ? t.answer + text : text.replace(/^\n+/, ""), since: 0 }));
          setStatus("Writing");
        } else if (ev.type === "approval" && typeof ev.id === "string") {
          const id = ev.id;
          setActions((as) => ({ ...as, [id]: { name: String(ev.name ?? ""), label: String(ev.label ?? "A change"), input: ev.input, state: "waiting" } }));
          current((t) => ({ ...t, answer: `${t.answer}\n\n[[action:${id}]]\n\n` }));
        } else if (ev.type === "action" && typeof ev.id === "string") {
          const { id, state, error } = ev as { id: string; state: Action["state"]; error?: string };
          if (state === "done") changed = true;
          setActions((as) => (as[id] ? { ...as, [id]: { ...as[id], state, error } } : as));
          setStatus("Writing");
        } else if (ev.type === "error" && typeof ev.message === "string") {
          const message = ev.message;
          current((t) => ({ ...t, error: message }));
        }
      }
    } catch (err) {
      const message = err instanceof TypeError ? "Couldn't reach the server" : err instanceof Error ? err.message : "Something went wrong";
      current((t) => ({ ...t, error: message }));
    } finally {
      setBusy(false);
      setStatus(null);
      // A change made: the page beside the panel shows it, and the ones holding assets in the browser fetch them again.
      if (changed) {
        router.refresh();
        a.onChanged();
      }
      const place = go && assistantPlace(go, window.location.origin);
      if (place) router.push(place);
    }
  }

  function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    // Asking something else: what still waits is declined (the server tells the model so).
    setActions((as) => Object.fromEntries(Object.entries(as).map(([k, v]) => [k, v.state === "waiting" ? { ...v, state: "declined" as const } : v])));
    setTurns((ts) => [...ts, { question: text, answer: "", steps: [], since: 0 }]);
    setQuestion("");
    void stream(
      { chat: shown.current, question: text, asset: a.asset, embed: true, where: window.location.pathname + window.location.search },
      STATUS_THINKING,
      text.slice(0, 80),
    );
  }

  // Approve or decline: once every change waiting is decided, the answer goes on.
  function decide(id: string, approved: boolean) {
    if (busy || actions[id]?.state !== "waiting") return;
    decisions.current[id] = approved;
    const next = { ...actions, [id]: { ...actions[id], state: "deciding" as const } };
    setActions(next);
    if (Object.values(next).some((x) => x.state === "waiting")) return;
    const approvals = Object.keys(decisions.current)
      .filter((k) => next[k]?.state === "deciding")
      .map((k) => ({ id: k, approved: decisions.current[k] }));
    // What it writes next is a paragraph of its own, after the card.
    current((t) => ({ ...t, answer: `${t.answer}\n\n` }));
    void stream({ chat: shown.current, approvals, embed: true }, approvals.some((x) => x.approved) ? "Making the change" : STATUS_THINKING, "");
  }

  const card = (id: string) => <ActionCard key={id} a={actions[id]} approved={decisions.current[id]} busy={busy} onDecide={(yes) => decide(id, yes)} />;
  const onGo = (path: string) => {
    const place = assistantPlace(path, window.location.origin);
    if (place) router.push(place);
  };
  const notice = start?.notice ?? null;
  const ideas = start?.ideas ? (a.asset ? start.ideas.asset : start.ideas.library) : [];

  return (
    <>
      <header className="bg-muted/70 relative flex items-center gap-1 p-2">
        <IconButton
          label={a.expanded ? "Collapse" : "Expand"}
          variant="ghost"
          className="bg-primary/10 text-primary-ink hover:bg-primary/15 max-md:hidden"
          aria-pressed={a.expanded}
          onClick={() => a.setExpanded(!a.expanded)}
        >
          {a.expanded ? <IconArrowsMinimize /> : <IconArrowsMaximize />}
        </IconButton>
        <span className="bg-background ms-1 inline-flex min-w-0 shrink items-center gap-2 truncate rounded-lg px-2.5 py-1 text-sm font-medium shadow-xs">
          {title ? (
            <span className="truncate">{title}</span>
          ) : a.asset ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={`/a/${a.asset}/w_160,f_webp`} className="bg-muted size-5 rounded object-cover" />
              <span className="truncate">About this asset</span>
            </>
          ) : (
            "New chat"
          )}
        </span>
        <span className="flex-1" />
        <IconButton label="New chat" variant="ghost" className="text-muted-foreground" disabled={busy || (!turns.length && !showing)} onClick={fresh}>
          <IconPlus />
        </IconButton>
        <IconButton label="History" variant="ghost" className="text-muted-foreground" aria-expanded={menu} aria-haspopup="true" disabled={!!notice} onClick={() => setMenu(!menu)}>
          <IconHistory />
        </IconButton>
        <IconButton label="Close" variant="ghost" className="text-muted-foreground" onClick={() => a.setOpen(false)}>
          <IconX />
        </IconButton>
        {menu && (
          <History
            project={start?.project ?? null}
            chats={start?.chats ?? []}
            on={showing}
            onPick={(id) => {
              setMenu(false);
              if (busy || id === shown.current) return;
              setTurns([]);
              setActions({});
              decisions.current = {};
              a.setChat(id);
              void open(id);
            }}
            onClose={() => setMenu(false)}
          />
        )}
      </header>

      <div
        ref={log}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5">
          {failed ? (
            <Empty title="The assistant can't be reached" text="Try again in a moment.">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </Button>
            </Empty>
          ) : notice ? (
            <Empty title={notice.title} text={notice.text}>
              {notice.href && (
                <Button asChild size="sm">
                  <a href={notice.href}>{notice.label ?? "Open"}</a>
                </Button>
              )}
            </Empty>
          ) : !turns.length && start ? (
            <Empty
              title={a.asset ? "Ask about this asset" : "Ask Artbucket"}
              text={
                a.asset
                  ? "What it shows, whether you may use it, and what to do with it."
                  : `Find assets, check rights and brand rules, and make changes in ${start.project ?? "this project"}.`
              }
            >
              <div className="flex max-w-md flex-wrap justify-center gap-2">
                {ideas.map((i) => (
                  <button key={i} type="button" className="bg-muted hover:bg-accent rounded-xl px-3.5 py-2 text-start text-sm" onClick={() => ask(i)}>
                    {i}
                  </button>
                ))}
              </div>
            </Empty>
          ) : (
            turns.map((t, i) => {
              const last = i === turns.length - 1;
              const writing = last && busy;
              return (
                <div key={i} className="grid gap-3">
                  <p className="bg-muted max-w-[85%] justify-self-end rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{t.question}</p>
                  <div className="grid min-w-0 gap-2">
                    <Steps steps={t.steps} />
                    <AssistantAnswer text={t.answer} streaming={writing} card={card} onGo={onGo} />
                    {t.error && <p className="text-destructive text-sm">{t.error}</p>}
                    {writing && status && <p className="text-muted-foreground animate-pulse text-sm">{status}</p>}
                    {!writing && t.answer.trim() && (
                      <div className="flex">
                        <CopyButton text={plainText(t.answer)} label="Copy the answer" what="the answer" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {!notice && !failed && (
        <form
          className="px-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <div className="bg-background focus-within:border-ring focus-within:ring-ring/50 mx-auto grid max-w-3xl gap-1 rounded-2xl border p-2 shadow-xs focus-within:ring-[3px]">
            <textarea
              ref={box}
              rows={1}
              value={question}
              placeholder="Ask about your library"
              aria-label="Your question"
              maxLength={4000}
              className="field-sizing-content max-h-48 min-h-9 resize-none bg-transparent px-1.5 py-1 text-sm outline-none"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(question);
                }
              }}
            />
            <div className="flex justify-end">
              <Button type="submit" size="icon-sm" className="rounded-full" disabled={busy || !question.trim()} aria-label="Ask">
                <IconArrowUp />
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-3xl text-center text-xs">
            Answers can be wrong: check before you use them. Nothing changes until you approve it.
          </p>
        </form>
      )}
    </>
  );
}

/** The panel's start, or why it can't answer: its mark, a title, a line, and what to do. */
function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="mt-[10vh] grid justify-items-center gap-3 text-center">
      <IconSparkles className="text-primary-ink size-12" aria-hidden />
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground max-w-sm text-sm text-pretty">{text}</p>
      {children}
    </div>
  );
}

/** How it got there: what it read with, and what it said while it only read. Folded; opened, it stays open. */
function Steps({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  const n = steps.filter((s) => "tool" in s).length;
  return (
    <details className="text-muted-foreground text-xs">
      <summary className="w-max cursor-pointer select-none">{n ? `${n} ${n === 1 ? "step" : "steps"}` : "Working"}</summary>
      <ol className="mt-1.5 grid gap-1 border-s ps-3">
        {steps.map((s, i) => (
          <li key={i} className={"said" in s ? "italic" : undefined}>
            {"tool" in s ? s.tool : s.said}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** The person's recent conversations here, in the panel (a menu portalled out of it would be outside an asset's dialog). */
function History({
  project,
  chats,
  on,
  onPick,
  onClose,
}: {
  project: string | null;
  chats: { id: string; title: string }[];
  on: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[aria-haspopup="true"]')) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);
  return (
    <nav
      ref={ref}
      aria-label="Recent conversations"
      className="bg-popover absolute end-2 top-[calc(100%-0.25rem)] z-10 grid max-h-[60vh] w-64 max-w-[calc(100%-1rem)] overflow-y-auto rounded-xl border p-1 shadow-lg"
    >
      <p className="text-muted-foreground px-2 py-1.5 text-xs">Recent conversations{project ? ` in ${project}` : ""}</p>
      {chats.length ? (
        chats.map((c) => (
          <button
            key={c.id}
            type="button"
            className={cn("hover:bg-muted truncate rounded-lg px-2 py-1.5 text-start text-sm", c.id === on && "bg-muted")}
            onClick={() => onPick(c.id)}
          >
            {c.title}
          </button>
        ))
      ) : (
        <p className="text-muted-foreground px-2 py-1.5 text-sm">No conversations yet</p>
      )}
    </nav>
  );
}

const short = (v: unknown) => {
  const s = typeof v === "string" ? v : Array.isArray(v) && v.every((x) => x === null || typeof x !== "object") ? v.join(", ") : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 159)}…` : s;
};

/** A change the assistant asks to make: what, its details, and Approve or Decline; then how it went. */
function ActionCard({ a, approved, busy, onDecide }: { a: Action | undefined; approved: boolean | undefined; busy: boolean; onDecide: (yes: boolean) => void }) {
  if (!a) return null;
  const input = a.input && typeof a.input === "object" ? (a.input as Record<string, unknown>) : {};
  const keys = Object.keys(input).filter((k) => input[k] !== undefined && input[k] !== null && input[k] !== "");
  const shown = keys.slice(0, 8);
  // Everything it will send, when the list leaves some out.
  const whole = keys.length > shown.length || shown.some((k) => typeof input[k] === "object" || String(input[k]).length > 160);
  const danger = /^(delete|close)_/.test(a.name);
  return (
    <div className="bg-card grid gap-2 rounded-xl border px-3.5 py-3" data-state={a.state}>
      <div className="font-semibold">
        {a.label}
        {a.state === "waiting" && <small className="text-muted-foreground ms-1.5 font-normal">needs your approval</small>}
      </div>
      {shown.length > 0 && (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {shown.map((k) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="[overflow-wrap:anywhere]">{short(input[k])}</dd>
            </div>
          ))}
        </dl>
      )}
      {whole && (
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer">All details</summary>
          <pre className="bg-muted text-foreground mt-1.5 max-h-64 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
            {JSON.stringify(input, null, 2)}
          </pre>
        </details>
      )}
      {a.state === "waiting" ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={danger ? "destructive" : "default"} disabled={busy} onClick={() => onDecide(true)}>
            {danger ? "Delete" : "Approve"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onDecide(false)}>
            Decline
          </Button>
        </div>
      ) : (
        <p className={cn("text-sm", a.state === "done" ? "text-success" : a.state === "failed" ? "text-destructive" : "text-muted-foreground")}>
          {a.state === "deciding" ? (approved ? "Approved. Working on it…" : "Declined.") : a.state === "done" ? "Done." : a.state === "failed" ? `It failed${a.error ? `: ${short(a.error)}` : "."}` : "Declined."}
        </p>
      )}
    </div>
  );
}

/**
 * Said by an open asset's dialog, inside it: which asset is open, for the
 * panel. While the panel is open beside the dialog, it also lets the panel take
 * focus: a scope of its own, mounted after the dialog's, stops that one
 * trapping focus (Radix keeps one active focus scope; the newest wins).
 */
export function AssistantAsset({ id }: { id: string }) {
  const a = useAssistant();
  const setAsset = a?.setAsset;
  useEffect(() => {
    if (!setAsset) return;
    setAsset(id);
    return () => setAsset((was) => (was === id ? null : was));
  }, [setAsset, id]);
  // After the dialog's own scope has mounted: a child's effects run before its parent's.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(f);
  }, []);
  if (!a?.open || !ready) return null;
  return (
    <FocusScope.Root trapped={false} onMountAutoFocus={(e) => e.preventDefault()} onUnmountAutoFocus={(e) => e.preventDefault()}>
      <span hidden />
    </FocusScope.Root>
  );
}

/** The way in: a button that opens the panel. Nothing where the server has no assistant. */
export function AskButton({ className, label = "Ask" }: { className?: string; label?: string }) {
  const a = useAssistant();
  if (!a) return null;
  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={() => a.setOpen(!a.open)} aria-pressed={a.open}>
      <IconSparkles className="text-primary-ink" /> {label}
    </Button>
  );
}
