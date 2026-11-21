import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, useApp } from "@/components/shell";
import { Button, Field, PageHead, Panel, SelectInput, TextInput } from "@/components/ui";
import { addMember, listMembers, updateMember } from "@/lib/stock/api";
import { Banner, useSnap } from "@/components/work";

export const Route = createFileRoute("/team")({ component: Page });
function Page() { return <Shell><Team /></Shell>; }
const ROLES = ["administrator", "manager", "warehouse_manager", "warehouse_operator", "purchasing", "sales", "accountant", "auditor", "viewer"];
function Team() {
  const { org, t, lang, allowed } = useApp();
  const snap = useSnap(`members:${org.id}`, () => listMembers({ data: { orgId: org.id } }), [org.id]);
  const [email, setEmail] = useState(""); const [role, setRole] = useState("viewer"); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const rtl = lang === "ar";
  async function invite() {
    setBusy(true); setError("");
    try { const result = await addMember({ data: { orgId: org.id, email, role } }); if (result.ok) { setEmail(""); snap.reload(); } else setError(result.error === "NOT_FOUND" ? (rtl ? "لم يتم العثور على مستخدم بهذا البريد. يجب أن ينشئ حسابًا أولًا." : "No account found for this email. They must sign up first.") : t(`err.${result.error}`)); }
    catch { setError(t("err.VALIDATION")); } finally { setBusy(false); }
  }
  async function change(userId: string, nextRole: string, grants: unknown, revokes: unknown) {
    setBusy(true); setError("");
    try { const result = await updateMember({ data: { orgId: org.id, userId, role: nextRole, grants: Array.isArray(grants) ? grants.map(String) : [], revokes: Array.isArray(revokes) ? revokes.map(String) : [] } }); if (result.ok) snap.reload(); else setError(t(`err.${result.error}`)); }
    catch { setError(t("err.VALIDATION")); } finally { setBusy(false); }
  }
  return <>
    <PageHead crumb={`${org.name} / ${t("nav.team")}`} title={t("nav.team")} hint={rtl ? "إدارة أعضاء المؤسسة وأدوارهم." : "Manage organization members and their roles."} />
    <Banner code={snap.error} local={snap.local} />{error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}
    {allowed("team.write") ? <Panel className="mb-4 p-4"><h2 className="mb-3 text-sm font-semibold">{rtl ? "إضافة عضو" : "Add a member"}</h2><div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]"><Field label={rtl ? "البريد الإلكتروني" : "Email address"}><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></Field><Field label={rtl ? "الدور" : "Role"}><SelectInput value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</SelectInput></Field><div className="flex items-end"><Button disabled={busy || !email.includes("@")} onClick={() => void invite()}>{rtl ? "إضافة" : "Add member"}</Button></div></div><p className="mt-2 text-xs text-muted">{rtl ? "يمكن إضافة المستخدمين الذين أنشأوا حسابًا بالفعل." : "Only users who have already created an account can be added."}</p></Panel> : null}
    <Panel className="overflow-hidden"><div className="border-b border-line px-4 py-3 text-sm font-semibold">{rtl ? "أعضاء المؤسسة" : "Organization members"} <span className="text-muted">({snap.data?.length ?? 0})</span></div><div className="divide-y divide-line">{(snap.data ?? []).map((member) => <div key={member.userId} className="flex flex-wrap items-center gap-3 px-4 py-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-teal-soft text-sm font-semibold text-teal">{(member.name || member.email || "?").slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{member.name || member.email}</div><div className="text-xs text-muted">{member.email}</div></div>{allowed("team.write") && member.role !== "owner" ? <SelectInput className="max-w-52" value={member.role} disabled={busy} onChange={(e) => void change(member.userId, e.target.value, member.grants, member.revokes)}>{ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</SelectInput> : <span className="rounded-md bg-surface-2 px-3 py-2 text-xs">{t(`role.${member.role}`)}</span>}</div>)}</div></Panel>
  </>;
}
