import * as React from "react";
import { FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { invokeTauri } from "@/shared/api/tauri";
import { cn } from "@/shared/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Markdown } from "@/shared/ui/markdown";

type LocalMarkdownPreview = {
  content: string;
  filename: string;
  path: string;
};

export function LocalMarkdownPath({
  inlineCode = false,
  path,
}: {
  inlineCode?: boolean;
  path: string;
}) {
  const [loading, setLoading] = React.useState(false);
  const [preview, setPreview] = React.useState<LocalMarkdownPreview | null>(
    null,
  );

  const openPreview = React.useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      setPreview(
        await invokeTauri<LocalMarkdownPreview>("read_local_markdown_preview", {
          path,
        }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to preview Markdown file",
      );
    } finally {
      setLoading(false);
    }
  }, [loading, path]);

  return (
    <>
      <button
        aria-busy={loading}
        aria-label={`Preview Markdown file ${path}`}
        className={cn(
          "inline-flex max-w-full cursor-pointer items-baseline gap-1 font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/70",
          inlineCode &&
            "rounded bg-muted px-1.5 py-0.5 font-mono text-xs no-underline",
        )}
        data-local-markdown-path=""
        disabled={loading}
        title="Preview Markdown file"
        type="button"
        onClick={() => void openPreview()}
      >
        {loading ? (
          <LoaderCircle
            aria-hidden="true"
            className="h-3 w-3 shrink-0 animate-spin"
          />
        ) : (
          <FileText aria-hidden="true" className="h-3 w-3 shrink-0" />
        )}
        <span className="wrap-anywhere text-left">{path}</span>
      </button>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
            <DialogTitle className="truncate text-lg">
              {preview?.filename ?? "Markdown preview"}
            </DialogTitle>
            <DialogDescription
              className="truncate font-mono text-xs"
              title={preview?.path}
            >
              {preview?.path}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {preview?.content ? (
              <Markdown content={preview.content} interactive={false} />
            ) : (
              <p className="text-sm text-muted-foreground">
                This Markdown file is empty.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
