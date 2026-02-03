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
import { ContentColumn, PageHeader } from "@/components/layout";
import { useChatStore } from "@/lib/store";

export default function ProjectsPage() {
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
          label="Workspace"
          title="Projects"
          actions={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  New project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create project</DialogTitle>
                  <DialogDescription>
                    Organize chats by initiative. This data persists in
                    localStorage only.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Growth research"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="What does this project track?"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={create}>Create</Button>
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
                  {project.description || "No description yet."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
          {projects.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Nothing here yet</CardTitle>
                <CardDescription>
                  Spin up a project to collect related chats.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </ContentColumn>
    </div>
  );
}
