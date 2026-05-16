
INSERT INTO storage.buckets (id, name, public) VALUES ('html-pages', 'html-pages', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read html-pages"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'html-pages');

CREATE POLICY "Admins can upload html-pages"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'html-pages' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update html-pages"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'html-pages' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete html-pages"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'html-pages' AND has_role(auth.uid(), 'admin'::app_role));
