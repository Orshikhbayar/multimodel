"use client";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader label="Learn more" title="About" />
        <Card>
          <CardContent className="space-y-3 py-6 text-sm text-muted-foreground">
            <p>
              Multi-Model AI is a front-end prototype that lets you explore how
              teams might orchestrate multiple models in one workspace.
            </p>
            <p>
              This build is fully local, so you can experiment with the UX
              without needing a backend integration.
            </p>
          </CardContent>
        </Card>
      </ContentColumn>
    </div>
  );
}
