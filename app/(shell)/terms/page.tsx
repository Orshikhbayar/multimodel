"use client";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader label="Learn more" title="Terms" />
        <Card>
          <CardContent className="space-y-3 py-6 text-sm text-muted-foreground">
            <p>
              This is a demo UI only. Features, pricing, and availability are
              subject to change as the product evolves.
            </p>
            <p>
              By using this prototype, you acknowledge that all data is stored
              locally and may be cleared at any time.
            </p>
          </CardContent>
        </Card>
      </ContentColumn>
    </div>
  );
}
