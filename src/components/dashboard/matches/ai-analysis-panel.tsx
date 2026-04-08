"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
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
  index = 0,
}: {
  children: React.ReactNode;
  index?: number;
}) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      className="bg-white rounded-[14px] border border-[#F3F3F3] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden"
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07, ease: EASE_CURVE }}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-3">
      {children}
    </p>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-10 border border-dashed border-[#F0F0F0] rounded-xl">
      <p className="text-[12px] text-[#AAAAAA]">{label}</p>
    </div>
  );
}

/* ── Key Moments ──────────────────────────────────────────── */

function KeyMomentsCard({
  moments,
}: {
  moments: Array<{ moment: string; description: string }>;
}) {
  const prefersReduced = useReducedMotion();
  return (
    <Card index={0}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#3B82F6]" />
            <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
              Key Moments
            </p>
          </div>
          {moments.length > 0 && (
            <span className="bg-[#EBF2FD] text-[#3B82F6] rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0">
              {moments.length} events
            </span>
          )}
        </div>

        {moments.length === 0 ? (
          <EmptyState label="No key moments recorded for this match" />
        ) : (
          <div className="flex flex-col divide-y divide-[#F0F0F0]">
            {moments.map((m, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-3.5 py-3.5 first:pt-0 last:pb-0"
                initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.35 + i * 0.07, ease: EASE_CURVE }}
              >
                {/* Sequence number */}
                <span className="shrink-0 text-[12px] font-medium tabular-nums text-[#AAAAAA] w-5 pt-[2px] leading-none">
                  {String(i + 1).padStart(2, "0")}
                </span>

                {/* Player color dot */}
                <div
                  className="shrink-0 w-1.5 h-1.5 rounded-full mt-[6px]"
                  style={{ backgroundColor: i % 2 === 0 ? P1_COLOR : P2_COLOR }}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#0D0D0D] leading-snug">{m.moment}</p>
                  <p className="text-[12px] text-[#525252] mt-0.5 leading-relaxed">{m.description}</p>
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
  const barColor = color === "green" ? "#5DB955" : "#E51837";
  const valueColor = color === "green" ? "text-[#5DB955]" : "text-[#E51837]";
  const iconColor = color === "green" ? "#5DB955" : "#E51837";
  const Icon = color === "green" ? TrendingUp : TrendingDown;
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      className="py-3.5 border-b border-[#F0F0F0] last:border-0"
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 + index * 0.06, ease: EASE_CURVE }}
    >
      {/* Name + value */}
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3 h-3 shrink-0" style={{ color: iconColor }} />
          <span className="text-[12px] text-[#525252] leading-snug truncate">
            {item.name}
          </span>
        </div>
        <span className={`text-[12px] font-medium tabular-nums shrink-0 ${valueColor}`}>
          {item.value}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[#F3F3F3] rounded-full h-2 overflow-hidden mb-2">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${item.value}%` }}
          transition={{ duration: 0.65, delay: 0.15 + index * 0.06, ease: EASE_CURVE }}
        />
      </div>

      {/* Description */}
      <p className="text-[11px] text-[#888888] leading-relaxed">{item.description}</p>
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
    <Card index={1}>
      <div className="p-5">
        <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA] mb-1">
          Match Intelligence
        </p>
        <p className="text-[11px] text-[#888888] leading-relaxed">AI-analyzed strengths and areas to improve</p>
      </div>

      {!hasData ? (
        <div className="px-5 pb-5">
          <EmptyState label="No insights data available for this match" />
        </div>
      ) : (
        <>
          {/* Player selector pills */}
          <div className="flex flex-row gap-2 px-5 pb-4">
            <button
              type="button"
              onClick={() => setSelected("player1")}
              className={`px-4 py-1.5 text-[12px] font-medium rounded-full transition-colors duration-200 ${
                selected === "player1"
                  ? "ring-1 ring-inset ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
                  : "ring-1 ring-inset ring-[#EAECF0] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6]"
              }`}
            >
              {p1Short}
            </button>
            <button
              type="button"
              onClick={() => setSelected("player2")}
              className={`px-4 py-1.5 text-[12px] font-medium rounded-full transition-colors duration-200 ${
                selected === "player2"
                  ? "ring-1 ring-inset ring-[#3B82F6] text-[#3B82F6] bg-[#EBF2FD]"
                  : "ring-1 ring-inset ring-[#EAECF0] text-[#525252] bg-white hover:bg-[#EFF6FF] hover:ring-[#3B82F6]/30 hover:text-[#3B82F6]"
              }`}
            >
              {p2Short}
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={selected}
              className="px-5 pb-5"
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
                <div className="flex flex-col gap-5">
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
    <Card index={2}>
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
            Ask the AI
          </p>
          <p className="text-[11px] text-[#888888] mt-1">Ask questions about this match</p>
        </div>
        <div className="flex items-center gap-1 bg-[#EBF2FD] text-[#3B82F6] rounded-full px-2 py-0.5 text-[10px] font-medium mt-0.5">
          <MessageSquare className="w-2.5 h-2.5" />
          Beta
        </div>
      </div>

      {/* Message list */}
      <div className="flex flex-col gap-3 px-5 max-h-[300px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#D9D9D9_transparent]">
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
                    ? "bg-[#EBF2FD] text-[#3B82F6]"
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
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#3B82F6] text-white"
                    : "bg-[#FAFAFA] text-[#0D0D0D]"
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
              <div className="shrink-0 w-6 h-6 rounded-full bg-[#EBF2FD] text-[#3B82F6] flex items-center justify-center">
                <Bot className="w-3 h-3" />
              </div>
              <div className="bg-[#FAFAFA] rounded-2xl px-4 py-3 flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#AAAAAA]"
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
      <div className="mx-5 my-4 flex items-center gap-2.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask about this match..."
          className="flex-1 border border-[#E7E7E7] rounded-full px-4 py-2.5 text-[13px] text-[#0D0D0D] placeholder:text-[#AAAAAA] bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-[border-color,box-shadow] duration-200"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="shrink-0 bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#F3F3F3] disabled:pointer-events-none text-white rounded-full p-2 transition-colors duration-200 active:scale-[0.97]"
        >
          <Send className="w-3.5 h-3.5" />
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
      <KeyMomentsCard moments={keyMoments} />
      <PlayerInsightsCard match={match} insights={insights} />
      <ChatCard />
    </div>
  );
}
