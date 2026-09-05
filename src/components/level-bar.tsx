import { LEVELS, type Level } from "@/lib/formats";
import { NativeSelect } from "@/components/native-select";
import { t, type MsgKey } from "@/lib/i18n";
import { useFolio } from "@/lib/store";

const BAND: Record<Level, MsgKey> = {
  A1: "bandA1",
  A2: "bandA2",
  B1: "bandB1",
  B2: "bandB2",
  C1: "bandC1",
  C2: "bandC2",
};
const HINT: Record<Level, MsgKey> = {
  A1: "hintA1",
  A2: "hintA2",
  B1: "hintB1",
  B2: "hintB2",
  C1: "hintC1",
  C2: "hintC2",
};

export function LevelBar({
  value,
  onChange,
  compact = false,
  name = "folio-level",
}: {
  value: Level;
  onChange: (level: Level) => void;
  compact?: boolean;
  name?: string;
}) {
  const locale = useFolio((s) => s.locale);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <NativeSelect
        id={name}
        label={compact ? undefined : t(locale, "level")}
        ariaLabel={t(locale, "level")}
        value={value}
        onChange={onChange}
        options={LEVELS.map((level) => ({
          id: level,
          label: compact
            ? `${level} · ${t(locale, BAND[level])}`
            : `${level} · ${t(locale, BAND[level])} · ${t(locale, HINT[level])}`,
        }))}
      />
      {compact ? (
        <p className="truncate text-right text-[11px] leading-tight text-muted-foreground">
          {t(locale, HINT[value])}
        </p>
      ) : null}
    </div>
  );
}
