#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const workspaceId = process.argv[2];
const actorUserId = process.argv[3];

if (!workspaceId || !actorUserId) {
  console.error(
    "Usage: node scripts/seed-system-templates.mjs <workspaceId> <actorUserId>",
  );
  process.exit(1);
}

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const WORKFLOW_PACKS = [
  {
    id: "importer-solo-seller",
    title: "Importer / Solo Seller",
    starterTemplateTitle: "Importer Weekly Margin + Reorder Review",
  },
  {
    id: "online-seller",
    title: "Online Seller",
    starterTemplateTitle: "Online Seller Reply Bank Refresh",
  },
  {
    id: "procurement-tender",
    title: "Procurement / Tender",
    starterTemplateTitle: "Tender Response Checklist + Draft",
  },
];

const rows = WORKFLOW_PACKS.flatMap((pack) => [
  {
    workspace_id: workspaceId,
    created_by: actorUserId,
    workflow_pack_id: pack.id,
    title: pack.starterTemplateTitle,
    description: `${pack.title} starter template`,
    body_md: `Starter template for ${pack.title}.`,
    input_schema: [],
    is_system: true,
    system_key: `${pack.id}:starter`,
  },
  {
    workspace_id: workspaceId,
    created_by: actorUserId,
    workflow_pack_id: pack.id,
    title: `${pack.title} Safe Template`,
    description: "Safe fallback template suggested by guardrail checks",
    body_md:
      "Use fact-based language. Avoid unverifiable claims. Provide assumptions, risks, and next actions.",
    input_schema: [],
    is_system: true,
    system_key: `${pack.id}:safe`,
  },
]);

const { data: templates, error: upsertError } = await client
  .from("templates")
  .upsert(rows, { onConflict: "workspace_id,system_key" })
  .select("id,workspace_id,title,body_md,input_schema");

if (upsertError) {
  console.error("Failed to upsert templates:", upsertError.message);
  process.exit(1);
}

const versionRows = (templates ?? []).map((template) => ({
  template_id: template.id,
  workspace_id: template.workspace_id,
  version_number: 1,
  title: template.title,
  description: "Seeded system template",
  body_md: template.body_md,
  input_schema: template.input_schema ?? [],
  change_note: "Seeded system template",
  created_by: actorUserId,
}));

if (versionRows.length > 0) {
  const { error: versionError } = await client
    .from("template_versions")
    .upsert(versionRows, { onConflict: "template_id,version_number" });
  if (versionError) {
    console.error("Failed to seed versions:", versionError.message);
    process.exit(1);
  }
}

console.log(
  `Seeded ${templates?.length ?? 0} templates for workspace ${workspaceId}`,
);
