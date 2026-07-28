"use client";

import { useEffect, useRef, useState } from "react";
import { chatWithIssues } from "@/services/issues.service";
import { ChatMessage, ChatCitation } from "@/types/issue.type";

interface DisplayMessage extends ChatMessage {
  citations?: ChatCitation[];
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSend() {
    const query = input.trim();
    if (!query || loading) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await chatWithIssues(query, history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer, citations: res.citations },
      ]);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-3 w-[380px] h-[520px] bg-white border border-gray-200 rounded-2xl shadow-xl flex flex-col overflow-hidden">
          {/* header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
            <div>
              <p className="text-[13px] font-semibold text-gray-900">
                Defect assistant
              </p>
              <p className="text-[11px] text-gray-400">
                Ask about the issue backlog
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          >
            {messages.length === 0 && (
              <p className="text-[12px] text-gray-400 text-center mt-6">
                Try: "What are the most common causes of login failures?"
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-800 border border-gray-100"
                  }`}
                >
                  <p>{m.content}</p>
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200/70 flex flex-wrap gap-1.5">
                      {m.citations.map((c) => (
                        <a
                          key={c.id}
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 hover:bg-violet-100 truncate max-w-[160px]"
                          title={c.title}
                        >
                          {c.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-[13px] text-gray-400">
                  Thinking…
                </div>
              </div>
            )}
            {error && (
              <p className="text-[12px] text-red-500 text-center">{error}</p>
            )}
          </div>

          {/* input */}
          <div className="border-t border-gray-100 p-3 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question…"
              rows={1}
              className="flex-1 resize-none text-[13px] border border-gray-200 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all max-h-24"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="shrink-0 px-3 py-2 rounded-lg bg-gray-900 text-white text-[13px] font-medium
                disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center
          hover:bg-gray-800 transition-colors"
        aria-label="Open chat assistant"
      >
        {open ? (
          <span className="text-xl">×</span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-6 h-6"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}
