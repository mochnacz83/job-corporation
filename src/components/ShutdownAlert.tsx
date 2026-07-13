import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Phone, Mail } from "lucide-react";

const STORAGE_KEY = "shutdown_alert_ack_v1";
const SHUTDOWN_DATE = "02/08/2026";

const ShutdownAlert = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ack = sessionStorage.getItem(STORAGE_KEY);
    if (!ack) setOpen(true);
  }, []);

  const handleClose = () => {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-warning/15 flex items-center justify-center mb-2">
            <AlertTriangle className="w-6 h-6 text-warning" />
          </div>
          <DialogTitle className="text-center text-lg">
            Aviso Importante — Descontinuação do Site
          </DialogTitle>
          <DialogDescription className="text-center pt-2 text-sm leading-relaxed">
            Este portal será <strong>descontinuado em 20 dias</strong> (previsão: <strong>{SHUTDOWN_DATE}</strong>).
            <br /><br />
            Caso precise realizar <strong>download de arquivos</strong>, exportações ou qualquer outra
            operação antes do encerramento, entre em contato com o administrador:
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
          <p className="font-semibold text-foreground">Juniomar Alex Mochnacz</p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Phone className="w-4 h-4" /> +55 49 98405-5959
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Mail className="w-4 h-4" /> juniomar.alex@gmail.com
          </p>
        </div>
        <DialogFooter>
          <Button onClick={handleClose} className="w-full">
            Entendi, continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShutdownAlert;