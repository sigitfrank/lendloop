"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { errorId, FormField } from "@/components/form-field";
import { IconPicker } from "@/components/icon-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  TOOL_DESCRIPTION_MAX,
  TOOL_NAME_MAX,
  type Category,
  type Condition,
  type ToolIcon,
} from "@/convex/lib/validators";
import { errorMessage } from "@/lib/errors";
import { CATEGORIES, CONDITIONS } from "@/lib/labels";

type ToolFormValues = {
  name: string;
  category: Category | "";
  condition: Condition | "";
  description: string;
  icon?: ToolIcon; // undefined = category default
};
type FieldErrors = Partial<Record<keyof ToolFormValues, string>>;

const EMPTY: ToolFormValues = { name: "", category: "", condition: "", description: "" };

/** Client-side checks for instant feedback; the server re-validates everything. */
function validate(values: ToolFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.name.trim()) errors.name = "Enter a name.";
  if (!values.category) errors.category = "Choose a category.";
  if (!values.condition) errors.condition = "Choose a condition.";
  return errors;
}

/** Add a new tool, or edit an existing one when `tool` is given. */
export function ToolFormDialog({
  tool,
  trigger,
}: {
  tool?: {
    _id: Id<"tools">;
    name: string;
    category: Category;
    condition: Condition;
    description: string;
    icon?: ToolIcon;
  };
  trigger: React.ReactNode;
}) {
  const createTool = useMutation(api.tools.create);
  const updateTool = useMutation(api.tools.update);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ToolFormValues>(tool ?? EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = tool !== undefined;

  function set<K extends keyof ToolFormValues>(key: K, value: ToolFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined })); // clear as the user fixes it
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setValues(tool ?? EMPTY);
      setFieldErrors({});
      setServerError(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validate(values);
    setFieldErrors(errors);
    setServerError(null);
    const { name, category, condition, description, icon } = values;
    if (Object.keys(errors).length > 0 || !category || !condition) return;

    setSaving(true);
    try {
      const fields = { name, category, condition, description, icon };
      if (isEdit) {
        await updateTool({ toolId: tool._id, ...fields });
        toast.success("Listing updated");
      } else {
        await createTool(fields);
        toast.success("Tool listed");
      }
      setOpen(false);
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /** Shared a11y wiring: red border + error text linked for screen readers. */
  const invalidProps = (field: keyof ToolFormValues, id: string) => ({
    "aria-invalid": fieldErrors[field] ? true : undefined,
    "aria-describedby": fieldErrors[field] ? errorId(id) : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit listing" : "List a tool"}</DialogTitle>
            <DialogDescription>
              Neighbours see the name, category, condition and description. Fields marked{" "}
              <span className="text-destructive">*</span> are required.
            </DialogDescription>
          </DialogHeader>

          <FormField id="tool-name" label="Name" required error={fieldErrors.name}>
            <Input
              id="tool-name"
              value={values.name}
              maxLength={TOOL_NAME_MAX}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Cordless drill"
              aria-required
              {...invalidProps("name", "tool-name")}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="tool-category" label="Category" required error={fieldErrors.category}>
              <Select value={values.category} onValueChange={(v) => set("category", v as Category)}>
                <SelectTrigger
                  id="tool-category"
                  className="w-full"
                  aria-required
                  {...invalidProps("category", "tool-category")}
                >
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField id="tool-condition" label="Condition" required error={fieldErrors.condition}>
              <Select value={values.condition} onValueChange={(v) => set("condition", v as Condition)}>
                <SelectTrigger
                  id="tool-condition"
                  className="w-full"
                  aria-required
                  {...invalidProps("condition", "tool-condition")}
                >
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField
            id="tool-icon"
            label="Icon"
            hint={
              values.icon ? (
                <button
                  type="button"
                  onClick={() => set("icon", undefined)}
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Clear
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">Optional · defaults to the category</span>
              )
            }
          >
            <IconPicker
              id="tool-icon"
              value={values.icon}
              onChange={(icon) => set("icon", icon)}
            />
          </FormField>

          <FormField
            id="tool-description"
            label="Short description"
            hint={
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {values.description.length}/{TOOL_DESCRIPTION_MAX}
              </span>
            }
          >
            <Textarea
              id="tool-description"
              value={values.description}
              maxLength={TOOL_DESCRIPTION_MAX}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What's included, any quirks, pickup notes…"
              rows={4}
            />
          </FormField>

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "List tool"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
