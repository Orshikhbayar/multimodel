import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/chat");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight">MultiModel AI</span>
        <div className="flex items-center gap-4">
          <Link
            href="/auth/login"
            className="text-sm text-muted-foreground transition hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/auth/login"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            Try Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center">
        <div className="mb-4 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
          Compare AI Models Instantly
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
          One Prompt.{" "}
          <span className="text-primary">Multiple AI Models.</span>
          <br />
          Compare Instantly.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          See how GPT-5.4, Claude Opus, Gemini, Grok, and more answer the same
          question. Pick the best. Stop guessing which AI to use.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/auth/login"
            className="w-full rounded-2xl bg-amber-500 px-8 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-600 sm:w-auto"
          >
            Try Free — No Credit Card
          </Link>
          <Link
            href="#how-it-works"
            className="w-full rounded-2xl border border-border/80 px-8 py-3.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted/40 sm:w-auto"
          >
            See how it works
          </Link>
        </div>

        {/* Hero visual — multi-model comparison demo */}
        <div className="mt-14 overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-xl backdrop-blur">
          {/* Simulated query bar */}
          <div className="border-b border-border/50 bg-muted/30 px-4 py-3 text-left text-xs font-medium text-muted-foreground">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
              Compare mode
            </span>{" "}
            · &quot;What makes a great software engineer?&quot;
          </div>

          {/* Model icons streaming indicator */}
          <div className="flex items-center justify-center gap-6 border-b border-border/30 bg-muted/10 px-4 py-3">
            {[
              { name: "GPT-5.4", color: "bg-emerald-500" },
              { name: "Claude Opus 4.6", color: "bg-violet-500" },
              { name: "Gemini 3.1 Pro", color: "bg-blue-500" },
            ].map((m) => (
              <div
                key={m.name}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span className={`h-2 w-2 rounded-full ${m.color}`} />
                {m.name}
              </div>
            ))}
          </div>

          {/* Side-by-side responses */}
          <div className="grid grid-cols-1 divide-y divide-border/40 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              {
                model: "GPT-5.4",
                color: "text-emerald-500",
                text: "The best engineers combine deep technical skill with systems thinking. They write clear, maintainable code and communicate complex ideas simply...",
              },
              {
                model: "Claude Opus 4.6",
                color: "text-violet-500",
                text: "Great software engineers are distinguished by their ability to manage complexity. They choose simplicity over cleverness and invest in understanding problems before writing code...",
              },
              {
                model: "Gemini 3.1 Pro",
                color: "text-blue-500",
                text: "Technical excellence, strong collaboration, and a growth mindset. The best engineers build systems that others can understand, maintain, and extend...",
              },
            ].map((item) => (
              <div key={item.model} className="px-4 py-4 text-left">
                <div
                  className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${item.color}`}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {item.model}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {item.text}
                </p>
              </div>
            ))}
          </div>

          {/* Unified synthesis preview */}
          <div className="border-t border-border/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-left">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-600">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Team Synthesis
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              All three models agree: great engineers blend technical depth with
              communication skills and a bias toward simplicity...
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-muted/30 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-12 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Type your question",
                desc: "Ask anything — a question, a task, a code problem. One prompt is all you need.",
              },
              {
                step: "2",
                title: "AI models respond simultaneously",
                desc: "GPT-5.4, Claude, Gemini, Grok, and more all answer at the same time. Watch responses stream in.",
              },
              {
                step: "3",
                title: "Compare or get a unified answer",
                desc: "See responses side-by-side in Compare mode, or let Team mode synthesize the best answer from all models.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-xl font-bold text-primary">
                  {item.step}
                </div>
                <h3 className="mb-2 font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats section */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid gap-8 sm:grid-cols-3 text-center">
            {[
              { value: "18+", label: "AI models compared" },
              { value: "3", label: "Interaction modes" },
              { value: "5", label: "AI providers" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-primary">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Model showcase */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-4 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            All the best AI models, in one place
          </h2>
          <p className="mb-12 text-center text-sm text-muted-foreground">
            Compare responses from the world&apos;s leading AI models instantly
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: "GPT-5.4",
                tag: "Latest frontier all-rounder",
                badge: "Pro",
              },
              {
                name: "Claude Opus 4.6",
                tag: "Top-tier coding and reasoning",
                badge: "Premium",
              },
              {
                name: "Gemini 3.1 Pro",
                tag: "Leading benchmarks, multimodal",
                badge: "Pro",
              },
              {
                name: "Grok 4",
                tag: "Real-time knowledge, frontier coding",
                badge: "Pro",
              },
              {
                name: "GPT-4o mini",
                tag: "Lowest-cost, fast responses",
                badge: "Free",
              },
              {
                name: "Gemini 2.5 Flash",
                tag: "Speed and efficiency leader",
                badge: "Free",
              },
              {
                name: "DeepSeek Chat",
                tag: "Efficient general-purpose chat",
                badge: "Free",
              },
              {
                name: "Claude Sonnet 4.6",
                tag: "Strong all-round assistant",
                badge: "Pro",
              },
              {
                name: "o3",
                tag: "Reasoning model, maximum accuracy",
                badge: "Premium",
              },
            ].map((model) => (
              <div
                key={model.name}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3"
              >
                <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/15" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{model.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {model.tag}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    model.badge === "Free"
                      ? "bg-emerald-500/15 text-emerald-600"
                      : model.badge === "Premium"
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-primary/15 text-primary"
                  }`}
                >
                  {model.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-muted/30 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="mb-4 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Simple, honest pricing
          </h2>
          <p className="mb-12 text-center text-sm text-muted-foreground">
            No hidden fees. No fake discounts.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Free */}
            <div className="rounded-2xl border border-border/70 bg-card/80 p-6">
              <h3 className="text-lg font-bold">Free</h3>
              <p className="mt-1 text-3xl font-bold">$0</p>
              <p className="text-sm text-muted-foreground">forever</p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                {[
                  "20 comparisons per day",
                  "4 free AI models",
                  "File upload",
                  "30-day history",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-emerald-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/login"
                className="mt-6 block rounded-xl border border-border/80 py-2.5 text-center text-sm font-medium text-muted-foreground transition hover:bg-muted/40"
              >
                Get started free
              </Link>
            </div>

            {/* Pro */}
            <div className="relative rounded-2xl border border-primary/40 bg-primary/5 p-6 ring-1 ring-primary/20">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                Most popular
              </div>
              <h3 className="text-lg font-bold">Pro</h3>
              <div className="flex items-baseline gap-1">
                <p className="mt-1 text-3xl font-bold">$12</p>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="text-xs text-muted-foreground">
                ≈ ₮41,400 MNT/month
              </p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                {[
                  "Unlimited comparisons",
                  "All AI models (GPT-5.4, Claude Opus 4.6, Grok 4...)",
                  "Web search augmentation",
                  "Team mode with unified synthesis",
                  "File upload",
                  "Unlimited history",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-primary">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/login"
                className="mt-6 block rounded-xl bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                Start free trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">
          Ready to compare?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Free to start. No credit card required.
        </p>
        <Link
          href="/auth/login"
          className="mt-8 inline-block rounded-2xl bg-amber-500 px-8 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-600"
        >
          Try MultiModel AI Free
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Built in Mongolia 🇲🇳 · © {new Date().getFullYear()} MultiModel AI
          </p>
          <div className="flex gap-6 text-xs text-muted-foreground">
            <Link href="/auth/login" className="hover:text-foreground transition">
              Sign in
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
