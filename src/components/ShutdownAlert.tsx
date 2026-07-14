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
const SHUTDOWN_DATE_OBJ = new Date(2026, 7, 2, 0, 0, 0); // 02/08/2026

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

const calcTimeLeft = (): TimeLeft => {
  const now = new Date().getTime();
  const distance = SHUTDOWN_DATE_OBJ.getTime() - now;

  if (distance <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  return {
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((distance % (1000 * 60)) / 1000),
    expired: false,
  };
};

const pad = (n: number) => String(n).padStart(2, "0");

const ShutdownAlert = () => {
  const [open, setOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ack = sessionStorage.getItem(STORAGE_KEY);
    if (!ack) setOpen(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(calcTimeLeft()), 1000);
    return () => clearInterval(timer);
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
        <div className="rounded-lg border bg-warning/10 p-4 text-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Tempo restante até a desativação
          </p>
          {timeLeft.expired ? (
            <p className="text-lg font-bold text-destructive">Site desativado</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold tabular-nums text-foreground">{pad(timeLeft.days)}</span>
                <span className="text-[10px] text-muted-foreground uppercase">Dias</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold tabular-nums text-foreground">{pad(timeLeft.hours)}</span>
                <span className="text-[10px] text-muted-foreground uppercase">Horas</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold tabular-nums text-foreground">{pad(timeLeft.minutes)}</span>
                <span className="text-[10px] text-muted-foreground uppercase">Min</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold tabular-nums text-foreground">{pad(timeLeft.seconds)}</span>
                <span className="text-[10px] text-muted-foreground uppercase">Seg</span>
              </div>
            </div>
          )}
        </div>
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