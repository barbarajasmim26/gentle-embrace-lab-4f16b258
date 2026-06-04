
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants, public.properties, public.payments, public.documents, public.app_settings, public.ai_conversations, public.ai_messages, public.whatsapp_config, public.whatsapp_messages, public.whatsapp_pending_actions TO anon;

CREATE POLICY "Anon manage tenants" ON public.tenants FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage properties" ON public.properties FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage payments" ON public.payments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage documents" ON public.documents FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage app_settings" ON public.app_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage ai_conversations" ON public.ai_conversations FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage ai_messages" ON public.ai_messages FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage whatsapp_config" ON public.whatsapp_config FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage whatsapp_messages" ON public.whatsapp_messages FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon manage whatsapp_pending_actions" ON public.whatsapp_pending_actions FOR ALL TO anon USING (true) WITH CHECK (true);
