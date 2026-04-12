CREATE TABLE module_ideas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_name TEXT NOT NULL,
    idea_type TEXT NOT NULL CHECK (idea_type IN ('Ideia Nova', 'Ajuste')),
    status TEXT NOT NULL CHECK (status IN ('Concluído', 'Em análise', 'Coletando mais informações')),
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE module_ideas ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for authenticated users" 
ON module_ideas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" 
ON module_ideas FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Enable update for owner" 
ON module_ideas FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Enable delete for owner" 
ON module_ideas FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_module_ideas_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_module_ideas_modtime
    BEFORE UPDATE ON module_ideas
    FOR EACH ROW
    EXECUTE FUNCTION update_module_ideas_updated_at_column();
