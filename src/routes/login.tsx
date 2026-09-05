import { createFileRoute, Link } from "@tanstack/react-router";
import { FolioMark } from "@/components/folio-mark";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { t } from "@/lib/i18n";
import { useFolio } from "@/lib/store";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const locale = useFolio((s) => s.locale);
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center gap-3">
          <FolioMark className="size-9 shrink-0" />
          <div>
            <p className="font-display text-xl leading-none">{t(locale, "appName")}</p>
            <p className="mt-1 text-xs tracking-wide text-muted-foreground">{t(locale, "appTagline")}</p>
          </div>
        </Link>
        <div className="paper-sheet p-6">
          <div className="letterhead-rules mb-5 h-[5px] w-full" />
          <h1 className="font-display text-3xl leading-tight">{t(locale, "loginTitle")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t(locale, "loginLead")}
          </p>
          {authEnabled ? (
            <div className="mt-6 grid gap-2">
              {GROK_PROVIDERS.map((p) => (
                <button
                  key={p.providerId}
                  type="button"
                  onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                  className="inline-flex h-12 w-full cursor-pointer touch-manipulation items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  {t(locale, "loginContinue", { name: p.label })}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">{t(locale, "loginOff")}</p>
          )}
          <Link
            to="/"
            className="mt-5 inline-flex h-11 items-center text-sm text-muted-foreground"
          >
            {t(locale, "loginSkip")}
          </Link>
        </div>
      </div>
    </main>
  );
}
