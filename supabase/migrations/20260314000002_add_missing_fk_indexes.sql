-- Add indexes for all unindexed foreign keys
-- Prevents full table scans on FK joins as data grows.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

-- artifacts
CREATE INDEX IF NOT EXISTS idx_artifacts_conversation_id ON public.artifacts (conversation_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_by ON public.artifacts (created_by);
CREATE INDEX IF NOT EXISTS idx_artifacts_message_id ON public.artifacts (message_id);

-- autopilot_runs
CREATE INDEX IF NOT EXISTS idx_autopilot_runs_asset_template_id ON public.autopilot_runs (asset_template_id);

-- autopilot_schedules
CREATE INDEX IF NOT EXISTS idx_autopilot_schedules_created_by ON public.autopilot_schedules (created_by);
CREATE INDEX IF NOT EXISTS idx_autopilot_schedules_template_id ON public.autopilot_schedules (template_id);

-- credit_ledger_events
CREATE INDEX IF NOT EXISTS idx_credit_ledger_events_usage_run_id ON public.credit_ledger_events (usage_run_id);

-- file_chunks
CREATE INDEX IF NOT EXISTS idx_file_chunks_workspace_id ON public.file_chunks (workspace_id);

-- file_embeddings
CREATE INDEX IF NOT EXISTS idx_file_embeddings_workspace_id ON public.file_embeddings (workspace_id);

-- files
CREATE INDEX IF NOT EXISTS idx_files_conversation_id ON public.files (conversation_id);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON public.files (uploaded_by);

-- integrations
CREATE INDEX IF NOT EXISTS idx_integrations_created_by ON public.integrations (created_by);
CREATE INDEX IF NOT EXISTS idx_integrations_project_id ON public.integrations (project_id);

-- repo_embeddings
CREATE INDEX IF NOT EXISTS idx_repo_embeddings_workspace_id ON public.repo_embeddings (workspace_id);

-- repo_files_cache
CREATE INDEX IF NOT EXISTS idx_repo_files_cache_project_id ON public.repo_files_cache (project_id);
CREATE INDEX IF NOT EXISTS idx_repo_files_cache_workspace_id ON public.repo_files_cache (workspace_id);

-- repo_index_jobs
CREATE INDEX IF NOT EXISTS idx_repo_index_jobs_project_id ON public.repo_index_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_repo_index_jobs_requested_by ON public.repo_index_jobs (requested_by);
CREATE INDEX IF NOT EXISTS idx_repo_index_jobs_workspace_id ON public.repo_index_jobs (workspace_id);

-- repos
CREATE INDEX IF NOT EXISTS idx_repos_created_by ON public.repos (created_by);
CREATE INDEX IF NOT EXISTS idx_repos_integration_id ON public.repos (integration_id);
CREATE INDEX IF NOT EXISTS idx_repos_project_id ON public.repos (project_id);

-- research_reports
CREATE INDEX IF NOT EXISTS idx_research_reports_conversation_id ON public.research_reports (conversation_id);
CREATE INDEX IF NOT EXISTS idx_research_reports_created_by ON public.research_reports (created_by);
CREATE INDEX IF NOT EXISTS idx_research_reports_message_id ON public.research_reports (message_id);
CREATE INDEX IF NOT EXISTS idx_research_reports_workspace_id ON public.research_reports (workspace_id);

-- research_sources
CREATE INDEX IF NOT EXISTS idx_research_sources_project_id ON public.research_sources (project_id);
CREATE INDEX IF NOT EXISTS idx_research_sources_workspace_id ON public.research_sources (workspace_id);

-- research_traces
CREATE INDEX IF NOT EXISTS idx_research_traces_project_id ON public.research_traces (project_id);
CREATE INDEX IF NOT EXISTS idx_research_traces_workspace_id ON public.research_traces (workspace_id);

-- stripe_webhook_events
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_user_id ON public.stripe_webhook_events (user_id);

-- template_favorites
CREATE INDEX IF NOT EXISTS idx_template_favorites_template_id ON public.template_favorites (template_id);
CREATE INDEX IF NOT EXISTS idx_template_favorites_user_id ON public.template_favorites (user_id);

-- template_versions
CREATE INDEX IF NOT EXISTS idx_template_versions_created_by ON public.template_versions (created_by);

-- templates
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON public.templates (created_by);

-- tool_runs
CREATE INDEX IF NOT EXISTS idx_tool_runs_conversation_id ON public.tool_runs (conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_runs_message_id ON public.tool_runs (message_id);
CREATE INDEX IF NOT EXISTS idx_tool_runs_workspace_id ON public.tool_runs (workspace_id);

-- usage_runs
CREATE INDEX IF NOT EXISTS idx_usage_runs_hold_id ON public.usage_runs (hold_id);
CREATE INDEX IF NOT EXISTS idx_usage_runs_team_id ON public.usage_runs (team_id);

-- web_pages_cache
CREATE INDEX IF NOT EXISTS idx_web_pages_cache_project_id ON public.web_pages_cache (project_id);

-- web_search_cache
CREATE INDEX IF NOT EXISTS idx_web_search_cache_project_id ON public.web_search_cache (project_id);

-- workspace_members
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members (user_id);

-- workspaces
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces (owner_id);
