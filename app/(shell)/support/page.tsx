"use client";

import { useState } from "react";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";

export default function SupportPage() {
  const { t } = useI18n();
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
        <ContentColumn className="space-y-6">
          <PageHeader
            label={t("support.label")}
            title={t("support.thanksTitle")}
          />
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("support.savedLocally")}
            </CardContent>
          </Card>
        </ContentColumn>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader
          label={t("support.label")}
          title={t("support.reportTitle")}
        />
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="summary">{t("support.summary")}</Label>
              <Input
                id="summary"
                placeholder={t("support.summaryPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="details">{t("support.details")}</Label>
              <Textarea
                id="details"
                rows={5}
                placeholder={t("support.detailsPlaceholder")}
              />
            </div>
            <Button onClick={() => setSubmitted(true)}>
              {t("support.submitReport")}
            </Button>
          </CardContent>
        </Card>
      </ContentColumn>
    </div>
  );
}
