-- Fix RLS auth init plan issues: replace auth.uid() with (select auth.uid())
-- This prevents per-row re-evaluation of auth functions, which kills performance at scale.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

-- profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING ((select auth.uid()) = id);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK ((select auth.uid()) = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

-- workspaces
DROP POLICY IF EXISTS workspaces_insert_owner ON public.workspaces;
DROP POLICY IF EXISTS workspaces_update_owner ON public.workspaces;
DROP POLICY IF EXISTS workspaces_delete_owner ON public.workspaces;
CREATE POLICY workspaces_insert_owner ON public.workspaces FOR INSERT WITH CHECK (owner_id = (select auth.uid()));
CREATE POLICY workspaces_update_owner ON public.workspaces FOR UPDATE USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));
CREATE POLICY workspaces_delete_owner ON public.workspaces FOR DELETE USING (owner_id = (select auth.uid()));

-- workspace_members
DROP POLICY IF EXISTS workspace_members_insert_owner ON public.workspace_members;
DROP POLICY IF EXISTS workspace_members_update_owner ON public.workspace_members;
DROP POLICY IF EXISTS workspace_members_delete_owner ON public.workspace_members;
CREATE POLICY workspace_members_insert_owner ON public.workspace_members FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = (select auth.uid())));
CREATE POLICY workspace_members_update_owner ON public.workspace_members FOR UPDATE USING (EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = (select auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = (select auth.uid())));
CREATE POLICY workspace_members_delete_owner ON public.workspace_members FOR DELETE USING (EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.owner_id = (select auth.uid())));

-- usage_runs
DROP POLICY IF EXISTS usage_runs_read_own ON public.usage_runs;
CREATE POLICY usage_runs_read_own ON public.usage_runs FOR SELECT USING (user_id = (select auth.uid()));

-- usage_holds
DROP POLICY IF EXISTS usage_holds_read_own ON public.usage_holds;
CREATE POLICY usage_holds_read_own ON public.usage_holds FOR SELECT USING (user_id = (select auth.uid()));

-- subscription_allowances
DROP POLICY IF EXISTS subscription_allowances_read_own ON public.subscription_allowances;
CREATE POLICY subscription_allowances_read_own ON public.subscription_allowances FOR SELECT USING ((subject_type = 'user'::text) AND (subject_id = (select auth.uid())));

-- credit_ledger_events
DROP POLICY IF EXISTS credit_ledger_events_read_own ON public.credit_ledger_events;
CREATE POLICY credit_ledger_events_read_own ON public.credit_ledger_events FOR SELECT USING (subject_id = (select auth.uid()));

-- tool_runs
DROP POLICY IF EXISTS tool_runs_insert_accessible ON public.tool_runs;
DROP POLICY IF EXISTS tool_runs_update_accessible ON public.tool_runs;
DROP POLICY IF EXISTS tool_runs_delete_accessible ON public.tool_runs;
CREATE POLICY tool_runs_insert_accessible ON public.tool_runs FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND caller_user_id = (select auth.uid()));
CREATE POLICY tool_runs_update_accessible ON public.tool_runs FOR UPDATE USING (user_has_workspace_access(workspace_id) AND caller_user_id = (select auth.uid())) WITH CHECK (user_has_workspace_access(workspace_id) AND caller_user_id = (select auth.uid()));
CREATE POLICY tool_runs_delete_accessible ON public.tool_runs FOR DELETE USING (user_has_workspace_access(workspace_id) AND caller_user_id = (select auth.uid()));

-- research_reports
DROP POLICY IF EXISTS research_reports_insert_accessible ON public.research_reports;
DROP POLICY IF EXISTS research_reports_update_accessible ON public.research_reports;
DROP POLICY IF EXISTS research_reports_delete_accessible ON public.research_reports;
CREATE POLICY research_reports_insert_accessible ON public.research_reports FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));
CREATE POLICY research_reports_update_accessible ON public.research_reports FOR UPDATE USING (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid())) WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));
CREATE POLICY research_reports_delete_accessible ON public.research_reports FOR DELETE USING (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));

-- files
DROP POLICY IF EXISTS files_insert_accessible ON public.files;
DROP POLICY IF EXISTS files_update_accessible ON public.files;
DROP POLICY IF EXISTS files_delete_accessible ON public.files;
CREATE POLICY files_insert_accessible ON public.files FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND uploaded_by = (select auth.uid()));
CREATE POLICY files_update_accessible ON public.files FOR UPDATE USING (user_has_workspace_access(workspace_id) AND uploaded_by = (select auth.uid())) WITH CHECK (user_has_workspace_access(workspace_id) AND uploaded_by = (select auth.uid()));
CREATE POLICY files_delete_accessible ON public.files FOR DELETE USING (user_has_workspace_access(workspace_id) AND uploaded_by = (select auth.uid()));

-- artifacts
DROP POLICY IF EXISTS artifacts_insert_accessible ON public.artifacts;
DROP POLICY IF EXISTS artifacts_update_accessible ON public.artifacts;
DROP POLICY IF EXISTS artifacts_delete_accessible ON public.artifacts;
CREATE POLICY artifacts_insert_accessible ON public.artifacts FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));
CREATE POLICY artifacts_update_accessible ON public.artifacts FOR UPDATE USING (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid())) WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));
CREATE POLICY artifacts_delete_accessible ON public.artifacts FOR DELETE USING (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));

-- integrations
DROP POLICY IF EXISTS integrations_select_own ON public.integrations;
DROP POLICY IF EXISTS integrations_insert_own ON public.integrations;
DROP POLICY IF EXISTS integrations_update_own ON public.integrations;
DROP POLICY IF EXISTS integrations_delete_own ON public.integrations;
CREATE POLICY integrations_select_own ON public.integrations FOR SELECT USING (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));
CREATE POLICY integrations_insert_own ON public.integrations FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));
CREATE POLICY integrations_update_own ON public.integrations FOR UPDATE USING (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid())) WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));
CREATE POLICY integrations_delete_own ON public.integrations FOR DELETE USING (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));

-- repos
DROP POLICY IF EXISTS repos_insert_accessible ON public.repos;
DROP POLICY IF EXISTS repos_delete_accessible ON public.repos;
CREATE POLICY repos_insert_accessible ON public.repos FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));
CREATE POLICY repos_delete_accessible ON public.repos FOR DELETE USING (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));

-- repo_index_jobs
DROP POLICY IF EXISTS repo_index_jobs_insert_accessible ON public.repo_index_jobs;
DROP POLICY IF EXISTS repo_index_jobs_delete_accessible ON public.repo_index_jobs;
CREATE POLICY repo_index_jobs_insert_accessible ON public.repo_index_jobs FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND requested_by = (select auth.uid()));
CREATE POLICY repo_index_jobs_delete_accessible ON public.repo_index_jobs FOR DELETE USING (user_has_workspace_access(workspace_id) AND requested_by = (select auth.uid()));

-- templates
DROP POLICY IF EXISTS templates_insert_accessible ON public.templates;
CREATE POLICY templates_insert_accessible ON public.templates FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));

-- template_versions
DROP POLICY IF EXISTS template_versions_insert_accessible ON public.template_versions;
CREATE POLICY template_versions_insert_accessible ON public.template_versions FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));

-- template_favorites
DROP POLICY IF EXISTS template_favorites_select_accessible ON public.template_favorites;
DROP POLICY IF EXISTS template_favorites_insert_own ON public.template_favorites;
DROP POLICY IF EXISTS template_favorites_delete_own ON public.template_favorites;
CREATE POLICY template_favorites_select_accessible ON public.template_favorites FOR SELECT USING (user_has_workspace_access(workspace_id) AND user_id = (select auth.uid()));
CREATE POLICY template_favorites_insert_own ON public.template_favorites FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND user_id = (select auth.uid()));
CREATE POLICY template_favorites_delete_own ON public.template_favorites FOR DELETE USING (user_has_workspace_access(workspace_id) AND user_id = (select auth.uid()));

-- autopilot_schedules
DROP POLICY IF EXISTS autopilot_schedules_insert_accessible ON public.autopilot_schedules;
CREATE POLICY autopilot_schedules_insert_accessible ON public.autopilot_schedules FOR INSERT WITH CHECK (user_has_workspace_access(workspace_id) AND created_by = (select auth.uid()));

-- product_events
DROP POLICY IF EXISTS product_events_insert_authenticated ON public.product_events;
CREATE POLICY product_events_insert_authenticated ON public.product_events FOR INSERT WITH CHECK (((workspace_id IS NULL) OR user_has_workspace_access(workspace_id)) AND ((user_id IS NULL) OR (user_id = (select auth.uid()))));
