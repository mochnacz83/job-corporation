import { Loader2 } from "lucide-react";

const PageLoader = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full min-h-[400px] animate-in fade-in duration-500">
      <div className="relative">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full -z-10 animate-pulse" />
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">
        Carregando módulo...
      </p>
    </div>
  );
};

export default PageLoader;
