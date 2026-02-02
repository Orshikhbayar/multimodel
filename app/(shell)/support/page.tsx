"use client";

import { useState } from "react";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function SupportPage() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
        <ContentColumn className="space-y-6">
          <PageHeader label="Support" title="Thanks for the report" />
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              We saved your report locally. A backend submission flow will arrive soon.
            </CardContent>
          </Card>
        </ContentColumn>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader label="Support" title="Report a bug" />
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="summary">Summary</Label>
              <Input id="summary" placeholder="Briefly describe the issue" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="details">Details</Label>
              <Textarea id="details" rows={5} placeholder="Steps to reproduce, expected behavior..." />
            </div>
            <Button onClick={() => setSubmitted(true)}>Submit report</Button>
          </CardContent>
        </Card>
      </ContentColumn>
    </div>
  );
}
