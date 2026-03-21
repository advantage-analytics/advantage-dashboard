"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Send,
  Bot,
  User,
  TrendingUp,
  TrendingDown,
  Zap,
  MessageSquare,
} from "lucide-react";
import { useMatchData } from "./match-data-provider";
import { shortName } from "@/lib/data/match-utils";
import type { PlayerStatistics } from "@/lib/data/types";

/* ── Constants ────────────────────────────────────────────── */

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const P1_COLOR = "#4A8AF4";
const P2_COLOR = "#F38439";

/* ── Stats summary helper ─────────────────────────────────── */

function buildStatsSummary(stats: PlayerStatistics): string {
  const pct = (n: number) => `${Math.round(n)}%`;
  return [
    `Aces: ${stats.aces}`,
    `Double Faults: ${stats.doubleFaults}`,
    `1st Serve In: ${pct(stats.firstServeInPct)}`,
    `1st Serve Win: ${pct(stats.firstServeWinPct)}`,
    `2nd Serve Win: ${pct(stats.secondServeWinPct)}`,
    `Winners: ${stats.winners}`,
    `Unforced Errors: ${stats.unforcedErrors}`,
    `Points Won: ${pct((stats.totalPointsWon / Math.max(stats.totalPoints, 1)) * 100)}`,
  ].join(", ");
}

/* ── Types ─────────────────────────────────────────────────── */

interface InsightItem {
  name: string;
  value: number;
  description: string;
}

/* ── Shared primitives ────────────────────────────────────── */

function Card({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      className="bg-white rounded-[16px] border border-[#E7E7E7] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)] overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE_CURVE }}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#999999] mb-3">
      {children}
    </p>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-10 border border-dashed border-[#EBEBEB] rounded-xl">
      <p className="text-sm text-[#CCCCCC]">{label}</p>
    </div>
  );
}

/* ── Key Moments ──────────────────────────────────────────── */

function KeyMomentsCard({
  moments,
}: {
  moments: Array<{ moment: string; description: string }>;
}) {
  return (
    <Card delay={0.3}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-medium text-[#0D0D0D]">Key Moments</h2>
            <p className="text-xs text-[#999999] mt-1">Turning points identified by AI</p>
          </div>
          {moments.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[#999999] bg-[#F5F5F5] rounded-full px-2.5 py-1 mt-0.5 shrink-0">
              <Zap className="w-2.5 h-2.5" />
              {moments.length} events
            </span>
          )}
        </div>

        {moments.length === 0 ? (
          <EmptyState label="No key moments recorded for this match" />
        ) : (
          <div className="flex flex-col">
            {moments.map((m, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-3.5 py-3.5 border-b border-[#F5F5F5] last:border-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.35 + i * 0.07, ease: EASE_CURVE }}
              >
                {/* Sequence number */}
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[#CCCCCC] w-5 pt-[3px] leading-none">
                  {String(i + 1).padStart(2, "0")}
                </span>

                {/* Player color dot */}
                <div
                  className="shrink-0 w-1.5 h-1.5 rounded-full mt-[6px]"
                  style={{ backgroundColor: i % 2 === 0 ? P1_COLOR : P2_COLOR }}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0D0D0D] leading-snug">{m.moment}</p>
                  <p className="text-xs text-[#999999] mt-0.5 leading-relaxed">{m.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── Insight row ──────────────────────────────────────────── */

function InsightRow({
  item,
  color,
  index,
}: {
  item: InsightItem;
  color: "green" | "red";
  index: number;
}) {
  const barColor = color === "green" ? "#22C55E" : "#EF4444";
  const valueColor = color === "green" ? "text-[#16A34A]" : "text-[#EF4444]";
  const iconColor = color === "green" ? "#22C55E" : "#EF4444";
  const Icon = color === "green" ? TrendingUp : TrendingDown;

  return (
    <motion.div
      className="py-4 border-b border-[#F5F5F5] last:border-0"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 + index * 0.06, ease: EASE_CURVE }}
    >
      {/* Name + value */}
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3 h-3 shrink-0" style={{ color: iconColor }} />
          <span className="text-sm font-medium text-[#0D0D0D] leading-snug truncate">
            {item.name}
          </span>
        </div>
        <span className={`text-sm font-bold tabular-nums shrink-0 ${valueColor}`}>
          {item.value}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-[#F0F0F0] rounded-full overflow-hidden mb-2">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${item.value}%` }}
          transition={{ duration: 0.65, delay: 0.15 + index * 0.06, ease: EASE_CURVE }}
        />
      </div>

      {/* Description */}
      <p className="text-[11px] text-[#999999] leading-relaxed">{item.description}</p>
    </motion.div>
  );
}

/* ── Player Insights ──────────────────────────────────────── */

function PlayerInsightsCard({
  match,
  insights,
}: {
  match: { player1: { name: string }; player2: { name: string } };
  insights: {
    player1?: { strengths?: InsightItem[]; weaknesses?: InsightItem[] };
    player2?: { strengths?: InsightItem[]; weaknesses?: InsightItem[] };
  } | null;
}) {
  const [selected, setSelected] = useState<"player1" | "player2">("player1");

  const p1Short = shortName(match.player1.name);
  const p2Short = shortName(match.player2.name);

  const playerData = selected === "player1" ? insights?.player1 : insights?.player2;
  const strengths = playerData?.strengths ?? [];
  const weaknesses = playerData?.weaknesses ?? [];
  const hasAny = strengths.length > 0 || weaknesses.length > 0;

  const hasData =
    (insights?.player1?.strengths?.length ?? 0) > 0 ||
    (insights?.player1?.weaknesses?.length ?? 0) > 0 ||
    (insights?.player2?.strengths?.length ?? 0) > 0 ||
    (insights?.player2?.weaknesses?.length ?? 0) > 0;

  return (
    <Card delay={0.4}>
      <div className="px-6 pt-6">
        <h2 className="text-base font-medium text-[#0D0D0D]">Match Intelligence</h2>
        <p className="text-xs text-[#999999] mt-1">AI-analyzed strengths and areas to improve</p>
      </div>

      {!hasData ? (
        <div className="px-6 pb-6 pt-4">
          <EmptyState label="No insights data available for this match" />
        </div>
      ) : (
        <>
          {/* Player tabs — same pattern as existing sidebar */}
          <div className="flex flex-row shadow-[inset_0_-1px_0_0_#E8E8E8] mt-4">
            <button
              type="button"
              onClick={() => setSelected("player1")}
              className={`h-[34px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
                selected === "player1"
                  ? "text-[#4A8AF4] border-[#4A8AF4]"
                  : "text-[#999999] border-transparent hover:text-[#666666]"
              }`}
            >
              {p1Short}
            </button>
            <button
              type="button"
              onClick={() => setSelected("player2")}
              className={`h-[34px] flex-1 py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
                selected === "player2"
                  ? "text-[#F38439] border-[#F38439]"
                  : "text-[#999999] border-transparent hover:text-[#666666]"
              }`}
            >
              {p2Short}
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={selected}
              className="px-6 py-5"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: EASE_CURVE }}
            >
              {!hasAny ? (
                <EmptyState
                  label={`No insights for ${selected === "player1" ? p1Short : p2Short}`}
                />
              ) : (
                <div className="flex flex-col gap-6">
                  {strengths.length > 0 && (
                    <div>
                      <SectionLabel>Strengths</SectionLabel>
                      <div className="flex flex-col">
                        {strengths.map((item, i) => (
                          <InsightRow key={i} item={item} color="green" index={i} />
                        ))}
                      </div>
                    </div>
                  )}
                  {weaknesses.length > 0 && (
                    <div>
                      <SectionLabel>Areas to Improve</SectionLabel>
                      <div className="flex flex-col">
                        {weaknesses.map((item, i) => (
                          <InsightRow key={i} item={item} color="red" index={i} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </Card>
  );
}

/* ── AI Chat ──────────────────────────────────────────────── */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

function ChatCard() {
  const { match, statsResult, keyMoments, insights } = useMatchData();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hello! I'm your Advantage Intelligence assistant. Ask me anything about this match — tactics, performance trends, or areas to improve.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMessage: ChatMessage = { id: Date.now().toString(), role: "user", text };
    const assistantId = (Date.now() + 1).toString();

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Build conversation history for the API (exclude welcome message id)
    const history = [...messages, userMessage]
      .filter((m) => m.id !== "welcome" || m.role !== "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));

    // Build match context
    const p1Stats = statsResult?.statistics.player1Stats;
    const p2Stats = statsResult?.statistics.player2Stats;
    const matchContext = {
      player1Name: match.player1.name,
      player2Name: match.player2.name,
      finalScore: match.score.finalScore,
      tournamentName: match.tournamentName,
      courtType: match.courtType ?? null,
      statsP1: p1Stats ? buildStatsSummary(p1Stats) : "No stats available",
      statsP2: p2Stats ? buildStatsSummary(p2Stats) : "No stats available",
      keyMoments,
      insights,
    };

    // Add empty assistant placeholder immediately
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, matchContext }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      setIsTyping(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: m.text + chunk } : m
          )
        );
      }
    } catch {
      setIsTyping(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: "Sorry, something went wrong. Please try again." }
            : m
        )
      );
    }
  }

  return (
    <Card delay={0.5}>
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-6 pb-4">
        <div>
          <h2 className="text-base font-medium text-[#0D0D0D]">Ask the AI</h2>
          <p className="text-xs text-[#999999] mt-1">Ask questions about this match</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-semibold text-[#999999] bg-[#F5F5F5] rounded-full px-2.5 py-1 mt-0.5">
          <MessageSquare className="w-2.5 h-2.5" />
          Beta
        </div>
      </div>

      {/* Message list */}
      <div className="flex flex-col gap-3 px-6 max-h-[300px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className={`flex items-end gap-2 ${
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: EASE_CURVE }}
            >
              {/* Avatar */}
              <div
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                  msg.role === "assistant"
                    ? "bg-[#EEF4FE] text-[#4A8AF4]"
                    : "bg-[#0D0D0D] text-white"
                }`}
              >
                {msg.role === "assistant" ? (
                  <Bot className="w-3 h-3" />
                ) : (
                  <User className="w-3 h-3" />
                )}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#4A8AF4] text-white"
                    : "bg-[#F5F5F5] text-[#0D0D0D]"
                }`}
              >
                {msg.text}
              </div>
            </motion.div>
          ))}

          {isTyping && (
            <motion.div
              key="typing"
              className="flex items-end gap-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="shrink-0 w-6 h-6 rounded-full bg-[#EEF4FE] text-[#4A8AF4] flex items-center justify-center">
                <Bot className="w-3 h-3" />
              </div>
              <div className="bg-[#F5F5F5] rounded-2xl px-3.5 py-3 flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#CCCCCC]"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="mx-6 my-4 flex items-center gap-2.5 rounded-xl border border-[#E8E8E8] bg-[#FAFAFA] px-4 py-2.5 focus-within:border-[#4A8AF4] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(74,138,244,0.08)] transition-all">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask about this match..."
          className="flex-1 text-sm text-[#0D0D0D] placeholder:text-[#CCCCCC] bg-transparent outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="shrink-0 w-7 h-7 rounded-full bg-[#4A8AF4] disabled:bg-[#E8E8E8] flex items-center justify-center transition-colors"
        >
          <Send className="w-3 h-3 text-white" />
        </button>
      </div>
    </Card>
  );
}

/* ── Main export ──────────────────────────────────────────── */

export function AIAnalysisPanel() {
  const { keyMoments, insights, match } = useMatchData();

  return (
    <div className="flex flex-col gap-6">
      {/* Tab header */}
      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.2, ease: EASE_CURVE }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#4A8AF4]" />
          <h2 className="text-base font-medium text-[#0D0D0D]">Advantage Intelligence</h2>
        </div>
        <span className="text-[10px] font-semibold text-[#3986F3] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-[#EEF4FE]">
          AI-Powered
        </span>
      </motion.div>

      <KeyMomentsCard moments={keyMoments} />
      <PlayerInsightsCard match={match} insights={insights} />
      <ChatCard />
    </div>
  );
}
