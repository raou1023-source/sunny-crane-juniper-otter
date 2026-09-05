import { FORMATS, type FormatId } from "@/lib/formats";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { useFolio } from "@/lib/store";

export function FormatPicker({
  value,
  custom,
  onChange,
  onCustom,
}: {
  value: FormatId;
  custom: string;
  onChange: (id: FormatId) => void;
  onCustom: (text: string) => void;
}) {
  const locale = useFolio((s) => s.locale);
  return (
    <div className="flex flex-col gap-3">
      <NativeSelect
        id="folio-format"
        label={t(locale, "formatLabel")}
        value={value}
        onChange={onChange}
        options={FORMATS.map((f) => ({ id: f.id, label: f.label }))}
      />
      {value === "custom" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-format">{t(locale, "formatCustom")}</Label>
          <Input
            id="custom-format"
            value={custom}
            onChange={(e) => onCustom(e.target.value)}
            placeholder={t(locale, "formatCustomPh")}
            autoComplete="off"
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {FORMATS.find((f) => f.id === value)?.blurb}
          {value !== "anki" ? ` · ${t(locale, "formatAnkiNote")}` : ""}
        </p>
      )}
    </div>
  );
}
