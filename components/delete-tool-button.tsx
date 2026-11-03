"use client";

import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/icon-button";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";

export function DeleteToolButton({ toolId, toolName }: { toolId: Id<"tools">; toolName: string }) {
  const removeTool = useMutation(api.tools.remove);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await removeTool({ toolId });
      toast.success(`“${toolName}” deleted`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <IconButton icon={Trash2} label={`Delete “${toolName}”`} tone="danger" disabled={deleting} />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{toolName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It will disappear from the board. Past loans stay in your history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
