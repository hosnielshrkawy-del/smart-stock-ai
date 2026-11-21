import { createFileRoute } from "@tanstack/react-router";
import { Bot, Send, Sparkles, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Shell, useApp } from "@/components/shell";
import { Badge, Button, PageHead, Panel, TextArea } from "@/components/ui";
import { askAssistant } from "@/lib/stock/api";

export const Route = createFileRoute("/assistant")({ component: Page });

type Message = { role: "user" | "assistant"; text: string };

function Page() {
  return <Shell><Assistant /></Shell>;
}

function Assistant() {
  const { org, lang, t, allowed } = useApp();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rtl = lang === "ar";
  const prompts = [t("ai.preset.low"), t("ai.preset.slow"), t("ai.preset.reorder")];

  async function send(value = question) {
    const clean = value.trim();
    if (!clean || busy) return;
    setQuestion("");
    setError("");
    setMessages((items) => [...items, { role: "user", text: clean }]);
    setBusy(true);
    try {
      const result = await askAssistant({ data: {
        orgId: org.id,
        question: clean,
        locale: lang,
        history: messages.slice(-8).map((message) => ({ role: message.role, text: message.text })),
      } });
      if (result.ok) setMessages((items) => [...items, { role: "assistant", text: result.text }]);
      else {
        const code = result.error;
        const aiMessages: Record<string, string> = {
          AI_NOT_CONFIGURED: t("ai.notConfigured"),
          AI_INVALID_KEY: t("ai.invalidKey"),
          AI_PROVIDER_RATE: t("ai.providerRate"),
          RATE: t("ai.appRate"),
          AI_MODEL: t("ai.modelUnavailable"),
          AI_TIMEOUT: t("ai.timeout"),
        };
        setError(code === "FORBIDDEN" ? t("err.FORBIDDEN") : aiMessages[code] ?? t("ai.unavailable"));
      }
    } catch {
      setError(t("ai.unavailable"));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  return (
    <>
      <PageHead
        crumb={`${org.name} / ${t("nav.assistant")}`}
        title={t("ai.title")}
        hint={t("ai.note")}
        actions={<Badge tone="info">Gemini AI</Badge>}
      />
      {!allowed("ai.use") ? (
        <Panel className="p-5 text-sm text-muted">{t("err.FORBIDDEN")}</Panel>
      ) : (
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
          <Panel className="flex min-h-[560px] flex-col overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-soft text-teal"><Sparkles className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Smart Stock AI</div>
                <div className="text-xs text-muted">{rtl ? "تحليل المخزون وقرارات التشغيل" : "Inventory intelligence and operational decisions"}</div>
              </div>
              <Badge tone="info">Gemini 3.8</Badge>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
              {messages.length === 0 ? (
                <div className="mx-auto flex max-w-lg flex-col items-center py-12 text-center">
                  <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-teal-soft text-teal"><Bot className="h-7 w-7" /></div>
                  <h2 className="text-base font-semibold">{rtl ? "مرحباً، كيف أساعدك اليوم؟" : "Hello. What can I help you with?"}</h2>
                  <p className="mt-2 text-sm text-muted">{t("ai.empty")}</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {prompts.map((prompt) => <button key={prompt} type="button" onClick={() => void send(prompt)} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs hover:border-teal">{prompt}</button>)}
                  </div>
                </div>
              ) : messages.map((message, index) => (
                <div key={`${index}-${message.role}`} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "assistant" ? <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-soft text-teal"><Bot className="h-4 w-4" /></div> : null}
                  <div className={`max-w-[88%] rounded-xl px-3 py-2.5 text-sm leading-7 ${message.role === "user" ? "bg-teal text-teal-ink" : "border border-line bg-surface-2"}`}>
                    {message.text.split("\n").map((line, lineIndex) => <p key={lineIndex} className={lineIndex ? "mt-2" : ""}>{line || " "}</p>)}
                  </div>
                  {message.role === "user" ? <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"><UserRound className="h-4 w-4" /></div> : null}
                </div>
              ))}
              {busy ? <div className="flex items-center gap-2 text-xs text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-teal" />{rtl ? "جاري تحليل بيانات المخزون..." : "Analyzing your inventory..."}</div> : null}
              {error ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
            </div>
            <form onSubmit={submit} className="border-t border-line p-3">
              <div className="flex items-end gap-2">
                <TextArea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t("ai.placeholder")} rows={2} maxLength={1500} className="min-h-12 resize-y" />
                <Button type="submit" disabled={busy || !question.trim()} className="h-12 shrink-0"><Send className="h-4 w-4" />{t("ai.send")}</Button>
              </div>
              <div className="mt-2 text-[11px] text-muted">{rtl ? "يتم إرسال بيانات المخزون المصرح لك بالاطلاع عليها فقط." : "Only inventory data you are authorized to view is sent for analysis."}</div>
            </form>
          </Panel>
          <aside className="space-y-3">
            <Panel className="p-4">
              <h3 className="mb-2 text-sm font-semibold">{rtl ? "ما الذي يستطيع المساعد فعله؟" : "What the assistant can do"}</h3>
              <ul className="space-y-2 text-xs leading-6 text-muted">
                <li>• {rtl ? "اكتشاف الأصناف التي تقترب من حد إعادة الطلب." : "Identify items approaching reorder points."}</li>
                <li>• {rtl ? "تحليل حركة الصرف خلال آخر 30 يوماً." : "Analyze outbound movement over the last 30 days."}</li>
                <li>• {rtl ? "اقتراح خطوات تشغيلية مبنية على بيانات المؤسسة." : "Suggest actions grounded in your organization data."}</li>
              </ul>
            </Panel>
            <Panel className="p-4">
              <h3 className="mb-2 text-sm font-semibold">{rtl ? "ضوابط الموثوقية" : "Trust and safety"}</h3>
              <p className="text-xs leading-6 text-muted">{rtl ? "لا ينفذ المساعد حركات مخزون أو مشتريات. راجع الاقتراحات قبل اتخاذ القرار. التوقعات تقديرية وليست حقائق." : "The assistant cannot post stock or purchasing transactions. Review recommendations before acting. Forecasts are estimates, not facts."}</p>
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}
