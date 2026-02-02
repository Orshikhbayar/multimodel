"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

export type ExpandableMessageProps = {
    id: string;
    children: React.ReactNode;
    align?: "start" | "end";
    containerClassName?: string;
    contentClassName?: string;
    fadeFromClassName?: string;
    collapsedLinesDesktop?: number;
    collapsedLinesMobile?: number;
    contentLength?: number;
    contentLineCount?: number;
    longTextLabel?: string;
    showLongHint?: boolean;
};

/**
 * A message container that collapses long content with a "Show more" button.
 * Uses CSS line-clamp for reliable text truncation without JS height calculations.
 */
export function ExpandableMessage({
    id,
    children,
    align = "start",
    containerClassName,
    contentClassName,
    fadeFromClassName = "from-[hsl(var(--app-panel))]",
    collapsedLinesDesktop = 12,
    collapsedLinesMobile = 10,
    contentLength = 0,
    contentLineCount = 0,
    longTextLabel = "Show full text",
    showLongHint = true,
}: ExpandableMessageProps) {
    const [expanded, setExpanded] = useState(false);

    // Determine if content should be collapsible based on content metrics
    const shouldCollapse = contentLength > 400 || contentLineCount > 8;
    const isVeryLong = contentLength > 4000 || contentLineCount > 40;

    const contentId = `${id}-content`;

    // CSS custom properties for line clamping
    const clampStyle = !expanded && shouldCollapse
        ? {
            "--clamp-lines-desktop": collapsedLinesDesktop,
            "--clamp-lines-mobile": collapsedLinesMobile,
        } as React.CSSProperties
        : undefined;

    return (
        <div
            className={cn(
                "flex w-full flex-col",
                align === "end" ? "items-end" : "items-start",
            )}
        >
            <div className={cn("flex w-full flex-col", containerClassName)}>
                {/* Content container */}
                <div
                    id={contentId}
                    className={cn(
                        "relative w-full",
                        !expanded && shouldCollapse && "expandable-content",
                        contentClassName,
                    )}
                    style={clampStyle}
                >
                    {children}

                    {/* Gradient fade overlay when collapsed */}
                    {!expanded && shouldCollapse && (
                        <div
                            className={cn(
                                "pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent",
                                fadeFromClassName,
                            )}
                            aria-hidden="true"
                        />
                    )}
                </div>

                {/* Expand/Collapse button */}
                {shouldCollapse && (
                    <div className="mt-2 flex flex-col items-start">
                        <button
                            type="button"
                            onClick={() => setExpanded((v) => !v)}
                            aria-expanded={expanded}
                            aria-controls={contentId}
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                        >
                            {expanded ? (
                                <>
                                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                                    Show less
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                                    {isVeryLong ? longTextLabel : "Show more"}
                                </>
                            )}
                        </button>

                        {/* Hint for very long content */}
                        {!expanded && isVeryLong && showLongHint && (
                            <span className="mt-1 text-xs text-muted-foreground">
                                Long paste collapsed
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
