"use client";

import { ReactNode } from "react";

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  return <>{children}</>;
}
