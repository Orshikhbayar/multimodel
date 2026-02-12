import { Sidebar } from "@/components/Sidebar";
import { MobileSidebar } from "@/components/MobileSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SupabaseBootstrap } from "@/components/SupabaseBootstrap";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="flex h-dvh min-h-dvh w-full overflow-hidden bg-[hsl(var(--app-bg))]">
      <SupabaseBootstrap />

      {/* Mobile drawer - visible on small screens */}
      <MobileSidebar />

      {/* Desktop sidebar - hidden on mobile */}
      <ErrorBoundary>
        <div className="hidden md:block">
          <Sidebar />
        </div>
      </ErrorBoundary>

      {/* Main content with mobile top padding for hamburger */}
      <div className="flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden pt-16 md:pt-0">
        {children}
      </div>
    </main>
  );
}
