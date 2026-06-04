import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Upload, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PAGE_KEY = "rastreamento_vtal";
const BUCKET = "html-pages";

const RastreamentoVtal = () => {
  const { isAdmin } = useAuth();
  const [title, setTitle] = useState("Rastreamento de Equipamentos — VTAL / ABILITY");
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<number>(Date.now());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("app_html_pages")
        .select("title, html")
        .eq("key", PAGE_KEY)
        .maybeSingle();

      if (data) {
        setTitle(data.title);
        const content = data.html || "";
        
        // If content looks like HTML, use it directly
        if (content.trim().startsWith("<!DOCTYPE") || content.trim().startsWith("<html")) {
          setHtmlContent(content);
        } else if (content.trim().length > 0) {
          // It's a path, fetch it from storage
          try {
            const { data: fileData, error } = await supabase.storage
              .from(BUCKET)
              .download(content);
            
            if (!error && fileData) {
              const text = await fileData.text();
              setHtmlContent(text);
            } else {
              // Fallback to public URL via fetch
              const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(content).data.publicUrl;
              const res = await fetch(publicUrl);
              if (res.ok) {
                setHtmlContent(await res.text());
              }
            }
          } catch (err) {
            console.error("Error fetching storage file:", err);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".html")) {
      toast.error("Envie um arquivo .html");
      return;
    }
    setUploading(true);
    try {
      const uploadPath = `${PAGE_KEY}.html`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(uploadPath, file, { upsert: true, contentType: "text/html" });
      
      if (error) throw error;

      await supabase
        .from("app_html_pages")
        .update({ 
          html: uploadPath,
          updated_at: new Date().toISOString() 
        })
        .eq("key", PAGE_KEY);

      const text = await file.text();
      setHtmlContent(text);
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
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card">
        <h1 className="text-sm font-semibold flex-1 truncate">{title}</h1>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => loadData()} 
          title="Recarregar"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
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
      <div className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : htmlContent ? (
          <iframe
            key={version}
            srcDoc={htmlContent}
            title={title}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-popups allow-forms allow-downloads"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
            <p>Nenhum conteúdo disponível.</p>
            {isAdmin && <p className="text-xs mt-2 text-primary">Clique em "Atualizar HTML" para enviar o dashboard.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default RastreamentoVtal;

