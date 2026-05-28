-- Permitir acesso total para usuários anônimos (sem login)
-- Isso é necessário porque o sistema agora opera sem autenticação frontal

-- Tabelas
CREATE POLICY "Anon users can manage properties" ON public.properties FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon users can manage tenants" ON public.tenants FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon users can manage payments" ON public.payments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon users can manage documents" ON public.documents FOR ALL TO anon USING (true) WITH CHECK (true);

-- Storage
CREATE POLICY "Anon users can upload contracts" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'contracts');
CREATE POLICY "Anon users can view contracts" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'contracts');
CREATE POLICY "Anon users can delete contracts" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'contracts');
