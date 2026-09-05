import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { copyText } from "@/lib/clipboard";
import { t } from "@/lib/i18n";
import { useFolio } from "@/lib/store";

export async function copyOrToast(text: string) {
  const locale = useFolio.getState().locale;
  const ok = await copyText(text);
  if (ok) toast.success(t(locale, "toastCopied"));
  else toast.error(t(locale, "toastCopyFail"));
  return ok;
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const locale = useFolio((s) => s.locale);
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      disabled={!text.trim()}
      onClick={async () => {
        if (!(await copyOrToast(text))) return;
        setDone(true);
        window.setTimeout(() => setDone(false), 1400);
      }}
      className="inline-flex h-11 cursor-pointer touch-manipulation items-center gap-1 rounded-md px-3 text-sm disabled:opacity-45"
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      {done ? t(locale, "copied") : (label ?? t(locale, "copy"))}
    </button>
  );
}

export function TapToCopy({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  const locale = useFolio((s) => s.locale);
  const [done, setDone] = useState(false);
  if (!text.trim()) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copyOrToast(text))) return;
        setDone(true);
        window.setTimeout(() => setDone(false), 1400);
      }}
      className="w-full cursor-pointer touch-manipulation rounded-sm text-left"
    >
      {children}
      <span className="mt-2 block text-xs text-muted-foreground">
        {done ? t(locale, "toastCopied") : t(locale, "tapCopy")}
      </span>
    </button>
  );
}

export function CopyLine({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  const locale = useFolio((s) => s.locale);
  const [done, setDone] = useState(false);
  if (!text.trim()) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        if (!(await copyOrToast(text))) return;
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
      className="flex min-h-11 w-full cursor-pointer touch-manipulation items-start gap-2 rounded-sm text-left"
    >
      <span className="min-w-0 flex-1">{children}</span>
      <span className="shrink-0 pt-1 text-xs text-muted-foreground">{done ? t(locale, "copied") : t(locale, "copy")}</span>
    </button>
  );
}
