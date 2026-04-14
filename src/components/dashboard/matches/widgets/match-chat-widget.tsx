"use client";

import { useState } from "react";
import { SendHorizontal, Sparkles } from "lucide-react";

export function MatchChatWidget() {
  const [input, setInput] = useState("");

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden h-[200px] flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-1">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
            Ask the AI
          </p>
          <p className="text-[11px] font-normal text-[#888888] leading-[16.5px]">
            Ask questions about this match
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EBF2FD] text-[10px] font-medium text-[#3B82F6]">
          <Sparkles className="w-2.5 h-2.5" />
          Beta
        </span>
      </div>

      {/* Greeting message */}
      <div className="flex-1 px-5 py-2 overflow-hidden">
        <div className="flex gap-2 items-center">
          <div className="w-6 h-6 rounded-full bg-[#EBF2FD] flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 text-[#3B82F6]" />
          </div>
          <div className="flex-1 min-w-0 bg-[#FAFAFA] rounded-2xl px-4 py-2.5">
            <p className="text-[13px] font-normal text-[#71717A] leading-[21.125px]">
              Hello! I&apos;m your Advantage Intelligence assistant. Ask me anything about this match!
            </p>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2.5 px-5 pb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this match..."
          className="flex-1 h-[41.5px] rounded-full border border-[#E7E7E7] bg-white px-4 text-[13px] text-[#0D0D0D] placeholder:text-[#0D0D0D]/60 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]"
        />
        <button
          type="button"
          className="w-[30px] h-[30px] rounded-full bg-[#F3F3F3] flex items-center justify-center hover:bg-[#E5E5E5] transition-colors duration-200"
          aria-label="Send message"
        >
          <SendHorizontal className="w-3.5 h-3.5 text-[#888888]" />
        </button>
      </div>
    </div>
  );
}
