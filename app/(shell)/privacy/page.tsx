"use client";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader label="Learn more" title="Privacy policy" />
        <Card>
          <CardContent className="space-y-3 py-6 text-sm text-muted-foreground">
            <p>
              This prototype stores data locally in your browser (localStorage).
              No information is sent to external services.
            </p>
            <p>
              Clear your local storage to remove any saved conversations,
              settings, or profile details.
            </p>
          </CardContent>
        </Card>
      </ContentColumn>
    </div>
  );
}
