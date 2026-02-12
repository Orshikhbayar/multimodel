"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { ContentColumn, PageHeader } from "@/components/layout";
import { useChatStore } from "@/lib/store";

export default function ProjectsPage() {
  const { t, formatDate } = useI18n();
  const { projects, addProject } = useChatStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = () => {
    if (!name.trim()) return;
    addProject(name, description);
    setName("");
    setDescription("");
    setOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader
          label={t("projects.label")}
          title={t("projects.title")}
          actions={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("projects.newProject")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("projects.createProject")}</DialogTitle>
                  <DialogDescription>{t("projects.createProjectDescription")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("projects.projectName")}</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t("projects.projectNamePlaceholder")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="description">{t("projects.projectDescription")}</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={t("projects.projectDescriptionPlaceholder")}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button onClick={create}>{t("projects.create")}</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          }
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id} className="h-full">
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>
                  {project.description || t("projects.noDescriptionYet")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {t("projects.createdDate", {
                    date: formatDate(new Date(project.createdAt)),
                  })}
                </p>
              </CardContent>
            </Card>
          ))}
          {projects.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("projects.nothingYet")}</CardTitle>
                <CardDescription>
                  {t("projects.spinUpProject")}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </ContentColumn>
    </div>
  );
}
