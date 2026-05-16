import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Upload, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const PAGE_KEY = "rastreamento_vtal";
const BUCKET = "html-pages";

const RastreamentoVtal = () => {
  const { isAdmin } = useAuth();
  const [title, setTitle] = useState("Rastreamento de Equipamentos — VTAL / ABILITY");
  const [filePath, setFilePath] = useState<string>("rastreamento_vtal.html");
  const [version, setVersion] = useState<number>(Date.now());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMeta = async () => {
    const { data } = await supabase
      .from("app_html_pages")
      .select("title, html")
      .eq("key", PAGE_KEY)
      .maybeSingle();
    if (data) {
      setTitle(data.title);
      setFilePath(data.html || "rastreamento_vtal.html");
      setVersion(Date.now());
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  const publicUrl = `${supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl}?v=${version}`;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".html")) {
      toast.error("Envie um arquivo .html");
      return;
    }
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { upsert: true, contentType: "text/html" });
      if (error) throw error;
      await supabase
        .from("app_html_pages")
        .update({ updated_at: new Date().toISOString() })
        .eq("key", PAGE_KEY);
      setVersion(Date.now());
      toast.success("Nova versão publicada");
    } catch (err: any) {
      toast.error("Falha no upload: " + (err?.message || ""));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card">
        <h1 className="text-sm font-semibold flex-1 truncate">{title}</h1>
        <Button variant="ghost" size="sm" onClick={() => setVersion(Date.now())} title="Recarregar">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={publicUrl} target="_blank" rel="noreferrer" title="Abrir em nova aba">
            <ExternalLink className="w-4 h-4" />
          </a>
        </Button>
        {isAdmin && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,text/html"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4 mr-1" />
              {uploading ? "Enviando..." : "Atualizar HTML"}
            </Button>
          </>
        )}
      </div>
      <iframe
        key={version}
        src={publicUrl}
        title={title}
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
};

export default RastreamentoVtal;
