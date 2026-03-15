"use client";

import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { t } from "@/lib/i18n/translate";
import { useAppSettingsStore } from "@/lib/state/settingsStore";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const locale = useAppSettingsStore.getState().locale;
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              {t(locale, "errors.somethingWentWrong")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {this.state.error?.message || t(locale, "auth.unexpectedError")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {t(locale, "errors.tryAgain")}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Wrapper for chat-specific error handling with recovery options
 */
export function ChatErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold">
              {t("errors.chatFailedLoad")}
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t("errors.chatFailedLoadDescription")}
            </p>
          </div>
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {t("errors.refreshPage")}
          </Button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
