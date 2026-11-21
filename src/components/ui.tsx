import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "ghost" | "danger" }) {
  const styles = {
    primary: "ui-button--primary bg-teal text-teal-ink hover:brightness-[1.04]",
    quiet: "ui-button--quiet border border-line bg-surface text-ink hover:bg-surface-2",
    ghost: "bg-transparent text-ink hover:bg-surface-2",
    danger: "border border-danger/10 bg-danger-soft text-danger hover:brightness-[.98]",
  }[variant];
  return (
    <button
      {...props}
      className={cx(
        "ui-button inline-flex items-center justify-center gap-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ui-field flex min-w-0 flex-col text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

const control =
  "ui-control w-full outline-none";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, props.className)} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx("ui-control ui-textarea w-full outline-none", props.className)} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad" | "info"; children: ReactNode }) {
  const styles = {
    neutral: "bg-surface-2 text-muted",
    good: "bg-success-soft text-success",
    warn: "bg-warning-soft text-warning",
    bad: "bg-danger-soft text-danger",
    info: "bg-teal-soft text-teal",
  }[tone];
  return <span className={cx("ui-badge", styles)}>{children}</span>;
}

export function statusTone(status: string): "neutral" | "good" | "warn" | "bad" | "info" {
  if (["posted", "received", "fulfilled", "active", "approved", "confirmed"].includes(status)) return "good";
  if (["draft", "pending", "partial", "acked"].includes(status)) return "warn";
  if (["cancelled", "reversed", "archived", "closed"].includes(status)) return "neutral";
  return "info";
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="ui-modal-backdrop fixed inset-0 z-40 flex items-end justify-center p-3 sm:items-center">
      <button type="button" className="absolute inset-0 bg-transparent" aria-label="close" onClick={onClose} />
      <div className={cx("ui-modal-card relative z-10 max-h-[90vh] w-full overflow-auto p-5 sm:p-6", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-4">
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          <Button variant="ghost" onClick={onClose} type="button" aria-label="Close dialog" className="h-9 min-h-9 w-9 rounded-lg p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="ui-empty flex flex-col items-center justify-center gap-3 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-muted">
        <span className="h-2 w-2 rounded-full bg-teal/60" />
      </span>
      <p className="max-w-md text-sm text-muted">{title}</p>
      {action}
    </div>
  );
}

export function PageHead({ title, hint, actions, crumb }: { title: string; hint?: string; actions?: ReactNode; crumb?: string }) {
  return (
    <div className="page-head">
      <div className="page-head-copy">
        {crumb ? <div className="page-crumb"><span className="h-1.5 w-1.5 rounded-full bg-teal" />{crumb}</div> : null}
        <h1 className="page-title">{title}</h1>
        {hint ? <p className="page-hint">{hint}</p> : null}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}

export function MetricCard({ label, value, detail, icon, tone = "default" }: { label: string; value: ReactNode; detail?: string; icon: ReactNode; tone?: "default" | "teal" | "warning" | "danger" }) {
  const tones = {
    default: "bg-surface-2 text-muted",
    teal: "bg-teal-soft text-teal",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="metric-card-label truncate">{label}</p>
          <div className="metric-card-value truncate">{value}</div>
          {detail ? <p className="metric-card-detail truncate">{detail}</p> : null}
        </div>
        <span className={cx("metric-card-icon", tones[tone])}>{icon}</span>
      </div>
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("ui-panel", className)}>{children}</section>;
}

export function SkeletonRows() {
  return (
    <div className="ui-panel space-y-4 p-5">
      <div className="h-5 w-40 animate-pulse rounded-md bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />)}
      </div>
      <div className="space-y-2 pt-1">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-2" />)}
      </div>
    </div>
  );
}
