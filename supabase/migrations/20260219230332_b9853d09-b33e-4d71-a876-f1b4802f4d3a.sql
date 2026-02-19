
-- Profiles table for employee data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  matricula TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  cargo TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Allow insert on signup" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup (matricula from metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, matricula, nome, must_change_password)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'matricula', ''),
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Supervisor visits table
CREATE TABLE public.visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID REFERENCES auth.users(id) NOT NULL,
  local TEXT NOT NULL,
  observacoes TEXT,
  data_visita DATE NOT NULL DEFAULT CURRENT_DATE,
  assinatura_digital TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own visits" ON public.visitas FOR SELECT USING (auth.uid() = supervisor_id);
CREATE POLICY "Users can create visits" ON public.visitas FOR INSERT WITH CHECK (auth.uid() = supervisor_id);
CREATE POLICY "Users can update own visits" ON public.visitas FOR UPDATE USING (auth.uid() = supervisor_id);
CREATE POLICY "Users can delete own visits" ON public.visitas FOR DELETE USING (auth.uid() = supervisor_id);

CREATE TRIGGER update_visitas_updated_at
BEFORE UPDATE ON public.visitas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PowerBI links table
CREATE TABLE public.powerbi_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  url TEXT NOT NULL,
  icone TEXT DEFAULT 'bar-chart',
  ordem INT DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.powerbi_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active links" ON public.powerbi_links FOR SELECT TO authenticated USING (ativo = true);
