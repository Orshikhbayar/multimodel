"use client";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export default function AboutPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader label={t("legal.learnMore")} title={t("legal.about")} />
        <Card>
          <CardContent className="space-y-3 py-6 text-sm text-muted-foreground">
            <p>{t("legal.aboutP1")}</p>
            <p>{t("legal.aboutP2")}</p>
          </CardContent>
        </Card>
      </ContentColumn>
    </div>
  );
}
