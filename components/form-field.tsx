import { Label } from "@/components/ui/label";

/**
 * Label + control + inline error. The control itself should set
 * `aria-invalid={!!error}` (red border) and `aria-describedby={errorId(id)}`.
 */
export function FormField({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required && (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          )}
        </Label>
        {hint}
      </div>
      {children}
      {error && (
        <p id={errorId(id)} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function errorId(id: string) {
  return `${id}-error`;
}
