"use client";

import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { IconButton } from "@/components/icon-button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function DeleteToolButton({ toolId, toolName }: { toolId: Id<"tools">; toolName: string }) {
  const removeTool = useMutation(api.tools.remove);

  return (
    <ConfirmAction
      trigger={<IconButton icon={Trash2} label={`Delete “${toolName}”`} tone="danger" />}
      title={`Delete “${toolName}”?`}
      description="It will disappear from the board. Past loans stay in your history."
      confirmLabel="Delete"
      destructive
      successMessage={`“${toolName}” deleted`}
      action={() => removeTool({ toolId })}
    />
  );
}
