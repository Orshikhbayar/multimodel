import { Sidebar } from "@/components/Sidebar";
import { MobileSidebar } from "@/components/MobileSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SupabaseBootstrap } from "@/components/SupabaseBootstrap";
import { DashboardSubnav } from "@/components/dashboard/DashboardSubnav";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="app-shell relative h-dvh min-h-dvh w-full overflow-hidden bg-[hsl(var(--app-bg))]">
      <SupabaseBootstrap />
      <div className="relative z-10 flex h-full w-full gap-2 p-2 md:gap-3 md:p-3">
        <MobileSidebar />

        <ErrorBoundary>
          <div className="hidden md:block">
            <Sidebar />
          </div>
        </ErrorBoundary>

        <div className="surface-enter flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] bg-[hsl(var(--app-panel)/0.82)] pt-16 shadow-[0_18px_48px_-34px_hsl(var(--foreground)/0.45)] backdrop-blur-md md:pt-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
            <DashboardSubnav />
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
