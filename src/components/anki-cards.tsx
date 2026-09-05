import { cardCopyText, filledExamples, isolateCards, type AnkiCard } from "@/lib/anki";
import { CopyButton, CopyLine } from "@/components/copy-button";
import { t } from "@/lib/i18n";
import { useFolio } from "@/lib/store";

function plain(s: string) {
  return s.replace(/\*\*/g, "").trim();
}

export function AnkiCards({ cards }: { cards: AnkiCard[] }) {
  const locale = useFolio((s) => s.locale);
  const list = isolateCards(cards);
  if (!list.length) return null;
  return (
    <ol className="flex min-w-0 flex-col gap-3">
      {list.map((card, i) => (
        <li key={`${card.front}-${i}`} className="bg-paper px-4 py-3 paper-shadow">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CopyLine text={card.front}>
                <p className="font-display text-lg leading-snug text-foreground">{card.front}</p>
              </CopyLine>
            </div>
            <CopyButton text={cardCopyText(card)} label={t(locale, "copyBundle")} />
          </div>
          {card.meaning ? (
            <p className="mt-1 text-sm text-foreground">
              <span className="text-xs font-medium tracking-wide text-muted-foreground">{t(locale, "meaning")} </span>
              {card.meaning}
            </p>
          ) : null}
          {card.core ? (
            <div className="mt-1 text-sm leading-relaxed">
              <p className="text-muted-foreground">
                <span className="text-xs font-medium tracking-wide">{t(locale, "core")} </span>
                {card.core}
              </p>
              {card.coreJa ? <p className="text-foreground">{card.coreJa}</p> : null}
            </div>
          ) : null}
          {card.note ? (
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              <span className="text-xs font-medium tracking-wide text-muted-foreground">{t(locale, "usage")} </span>
              {card.note}
            </p>
          ) : null}
          {filledExamples(card).length ? (
            <ol className="mt-2 space-y-1 border-t border-border pt-2 text-sm leading-relaxed">
              {filledExamples(card).map((ex, n) => {
                const en = plain(ex.en);
                const copy = ex.ja ? `${en}\n${ex.ja}` : en;
                return (
                  <li key={n}>
                    <CopyLine text={copy}>
                      <span className="flex gap-2">
                        <span className="w-4 shrink-0 text-xs text-muted-foreground">{n + 1}</span>
                        <span>
                          <span className="block">{renderBold(ex.en)}</span>
                          {ex.ja ? (
                            <span className="mt-0.5 block text-muted-foreground">{ex.ja}</span>
                          ) : null}
                        </span>
                      </span>
                    </CopyLine>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-medium text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
