"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ConfirmWriteModalProps {
  open: boolean;
  toolName: string;
  warningText: string;
  expiresAt?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const CONFIRM_PHRASE = "CONFIRM";

export function ConfirmWriteModal({
  open,
  toolName,
  warningText,
  expiresAt,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmWriteModalProps) {
  const [phrase, setPhrase] = useState("");

  const isValid = useMemo(
    () => phrase.trim().toUpperCase() === CONFIRM_PHRASE,
    [phrase],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) {
          setPhrase("");
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TriangleAlert className="h-4 w-4 text-amber-500" />
            Confirm write action
          </DialogTitle>
          <DialogDescription>
            `{toolName}` is a write tool and requires explicit confirmation from
            the server challenge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100">
          <p>{warningText}</p>
          {expiresAt ? (
            <p className="text-[11px] opacity-80">
              Confirmation token expires at{" "}
              {new Date(expiresAt).toLocaleString()}.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm-phrase" className="text-xs font-medium">
            Type {CONFIRM_PHRASE} to continue
          </label>
          <Input
            id="confirm-phrase"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder={CONFIRM_PHRASE}
            disabled={loading}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (!isValid || loading) return;
              onConfirm();
            }}
            disabled={!isValid || loading}
          >
            {loading ? "Confirming..." : "Confirm and execute"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
