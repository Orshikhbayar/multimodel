"use client";

import { cn } from "@/lib/utils";

interface ContentColumnProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Maximum width of the content column.
   * @default "860px"
   */
  maxWidth?: string;
  /**
   * Whether to apply padding.
   * @default true
   */
  withPadding?: boolean;
  /**
   * HTML id for the element.
   */
  id?: string;
  /**
   * Custom inline styles.
   */
  style?: React.CSSProperties;
}

/**
 * A centered, readable content column with consistent max-width and padding.
 * Use this as the standard wrapper for all page content to ensure consistent layout.
 *
 * Default: max-w-[860px] mx-auto px-4 sm:px-6 lg:px-8
 */
export function ContentColumn({
  children,
  className,
  maxWidth = "860px",
  withPadding = true,
  id,
  style,
}: ContentColumnProps) {
  return (
    <div
      id={id}
      className={cn(
        "mx-auto w-full",
        withPadding && "px-4 sm:px-6 lg:px-8",
        className,
      )}
      style={{
        maxWidth,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
