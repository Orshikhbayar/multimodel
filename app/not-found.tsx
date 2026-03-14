import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/12">
          <FileQuestion className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-foreground">
          404
        </h1>
        <p className="mb-1 text-lg font-medium text-foreground">
          Page not found
        </p>
        <p className="mb-8 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
