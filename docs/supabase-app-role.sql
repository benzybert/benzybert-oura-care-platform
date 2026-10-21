-- One-off setup for a Supabase project (run per project, e.g. via the SQL editor).
-- Creates the least-privilege role the app connects with. Replace <PASSWORD> with a long
-- random value (openssl rand -hex 24) and put the resulting URL in Vercel as DATABASE_URL.
-- The password must never be committed.
--
-- Why a separate role: the built-in `postgres` role owns the tables and bypasses RLS; the app
-- should not run with it. This role is subject to RLS, and only the policies below let it in.
-- `anon` and `authenticated` (the public REST/GraphQL API) get nothing: see 0001_lock_down_public_api.sql.
--
-- Connection string (Vercel is IPv4-only, so use the shared pooler in transaction mode):
--   postgres://oura_app.<PROJECT_REF>@<POOLER_HOST>:6543/postgres   (password after the colon)
-- The pooler host is shown under "Connect" in the Supabase dashboard (aws-0-... or aws-1-...).

CREATE ROLE oura_app LOGIN PASSWORD '<PASSWORD>' NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO oura_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oura_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oura_app;

-- The app enforces consent and roles itself, so it gets full access to every table.
-- NOTE: every new table needs `ENABLE ROW LEVEL SECURITY` and a policy like these.
CREATE POLICY "oura_app full access" ON public.alerts FOR ALL TO oura_app USING (true) WITH CHECK (true);
CREATE POLICY "oura_app full access" ON public.audit_log FOR ALL TO oura_app USING (true) WITH CHECK (true);
CREATE POLICY "oura_app full access" ON public.care_assignments FOR ALL TO oura_app USING (true) WITH CHECK (true);
CREATE POLICY "oura_app full access" ON public.consents FOR ALL TO oura_app USING (true) WITH CHECK (true);
CREATE POLICY "oura_app full access" ON public.daily_metrics FOR ALL TO oura_app USING (true) WITH CHECK (true);
CREATE POLICY "oura_app full access" ON public.members FOR ALL TO oura_app USING (true) WITH CHECK (true);
CREATE POLICY "oura_app full access" ON public.organizations FOR ALL TO oura_app USING (true) WITH CHECK (true);
CREATE POLICY "oura_app full access" ON public.oura_connections FOR ALL TO oura_app USING (true) WITH CHECK (true);
CREATE POLICY "oura_app full access" ON public.reward_events FOR ALL TO oura_app USING (true) WITH CHECK (true);
CREATE POLICY "oura_app full access" ON public.users FOR ALL TO oura_app USING (true) WITH CHECK (true);
