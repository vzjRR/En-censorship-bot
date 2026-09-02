import { type ReactNode } from "react";

export function StatCard({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "warn" | "danger" | "ok" }) {
  const toneClass = {
    default: "text-slate-100",
    warn: "text-warn",
    danger: "text-danger",
    ok: "text-ok",
  }[tone];
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-ok/15 text-ok border-ok/30",
    EXPIRED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    REVOKED: "bg-danger/15 text-danger border-danger/30",
    SENT: "bg-ok/15 text-ok border-ok/30",
    FAILED: "bg-warn/15 text-warn border-warn/30",
    PENDING: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    COMPLETED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30"}`}>
      {status}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const base = "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    secondary: "bg-surface-raised border border-surface-border text-slate-200 hover:bg-surface-border/60",
    danger: "bg-danger text-white hover:bg-danger/80",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised">
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-200">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-surface-border bg-surface-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{message}</div>;
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-500 border-t-accent" />;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-slate-500">{message}</div>;
}
