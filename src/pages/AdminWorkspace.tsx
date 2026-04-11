import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const WORKSPACE_URL = "https://app.powerbi.com";

const AdminWorkspace = () => {
  const [iframeKey, setIframeKey] = useState(0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b bg-card/60 backdrop-blur-sm shrink-0">
        <div className="px-4 h-11 flex items-center gap-3">
          <div className="p-0.5 bg-transparent w-7 h-7 flex items-center justify-center overflow-hidden shrink-0">
            <img src="/ability-logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-sm font-semibold text-foreground truncate">
            Workspace Power BI
          </h1>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8"
            onClick={() => setIframeKey((k) => k + 1)}
            title="Recarregar"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          key={iframeKey}
          src={WORKSPACE_URL}
          title="Power BI Workspace"
          className="w-full h-full border-0"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
};

export default AdminWorkspace;
