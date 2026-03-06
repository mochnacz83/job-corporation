
-- Add new columns to material_coletas
ALTER TABLE public.material_coletas 
  ADD COLUMN IF NOT EXISTS data_execucao date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS assinatura_colaborador text,
  ADD COLUMN IF NOT EXISTS assinatura_almoxarifado text,
  ADD COLUMN IF NOT EXISTS foto_url text;

-- Create storage bucket for material photos
INSERT INTO storage.buckets (id, name, public) VALUES ('material-fotos', 'material-fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload material photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'material-fotos');

CREATE POLICY "Anyone can view material photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'material-fotos');

CREATE POLICY "Users can delete own material photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'material-fotos' AND (storage.foldername(name))[1] = auth.uid()::text);
