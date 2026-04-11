import { ExternalLink, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const WORKSPACE_URL = "https://app.powerbi.com/home?noSignUpCheck=1";

const AdminWorkspace = () => {
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
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 flex flex-col items-center text-center space-y-6">
            <div className="p-5 bg-primary/10 rounded-full">
              <BarChart3 className="w-12 h-12 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Workspace Power BI
              </h2>
              <p className="text-sm text-muted-foreground">
                O portal do Power BI não permite incorporação direta. Clique no botão abaixo para acessar o Workspace em uma nova aba.
              </p>
            </div>
            <Button
              size="lg"
              className="gap-2 w-full"
              onClick={() => window.open(WORKSPACE_URL, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Workspace Power BI
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminWorkspace;
