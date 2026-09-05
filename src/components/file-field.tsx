import { cn } from "@/lib/utils";

export function FileField({
  id,
  label,
  accept,
  capture,
  disabled,
  multiple,
  onFile,
  onFiles,
}: {
  id: string;
  label: string;
  accept: string;
  capture?: "environment" | "user";
  disabled?: boolean;
  multiple?: boolean;
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void;
}) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
      <input
        id={id}
        type="file"
        accept={accept}
        capture={capture}
        disabled={disabled}
        multiple={multiple}
        className={cn(
          "block w-full min-w-0 cursor-pointer touch-manipulation text-base text-foreground",
          "file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:text-sm file:font-medium file:text-primary-foreground",
        )}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!list.length) return;
          if (onFiles) onFiles(list);
          else if (onFile) onFile(list[0]!);
        }}
      />
    </label>
  );
}
