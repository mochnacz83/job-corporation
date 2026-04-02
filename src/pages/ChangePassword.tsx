import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { KeyRound, Loader2, Check, X, ShieldAlert, Info, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ChangePassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isFirstRegistration = profile?.status === 'pendente' && profile?.must_change_password;

  const requirements = useMemo(() => [
    { label: "Mínimo 6 caracteres", valid: newPassword.length >= 6 },
    { label: "Pelo menos uma letra maiúscula", valid: /[A-Z]/.test(newPassword) },
    { label: "Pelo menos uma letra minúscula", valid: /[a-z]/.test(newPassword) },
    { label: "Pelo menos um número", valid: /\d/.test(newPassword) },
    { label: "Pelo menos um caractere especial (!@#$%...)", valid: /[^A-Za-z0-9]/.test(newPassword) },
  ], [newPassword]);

  const passwordValid = requirements.every(r => r.valid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      toast({ title: "Senha inválida", description: "A senha não atende a todos os requisitos necessários.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não conferem", description: "As senhas digitadas são diferentes.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // 1. Atualizar a senha no Auth
      const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
      if (pwError) throw pwError;

      // 2. Atualizar perfil
      if (profile) {
        const isFirstRegistration = profile.status === 'pendente';
        const updateData: any = { 
          must_change_password: false,
          reset_password_pending: false,
        };
        
        // Só bloqueia para aprovação no PRIMEIRO cadastro
        if (isFirstRegistration) {
          updateData.status = 'pendente';
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .update(updateData)
          .eq("id", profile.id);
        
        if (profileError) throw profileError;
      }

      if (profile?.status === 'pendente' && profile?.must_change_password) {
        // Primeiro cadastro — precisa aprovação
        setShowSuccessDialog(true);
      } else {
        // Usuário ativo trocando senha — sem aprovação
        toast({ title: "Senha alterada com sucesso!", description: "Sua nova senha já está ativa." });
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast({ title: "Erro ao alterar senha", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      <Card className="w-full max-w-md glass-card relative z-10">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-lg">
            <KeyRound className="w-8 h-8 text-accent-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Alterar Senha</h1>
            <p className="text-muted-foreground text-sm mt-1">{isFirstRegistration ? "Defina sua nova senha definitiva" : "Altere sua senha de acesso"}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isFirstRegistration && (
            <Alert variant="default" className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800 text-sm font-semibold">Validação do Administrador</AlertTitle>
              <AlertDescription className="text-blue-700 text-xs leading-tight mt-1">
                Sua nova senha será salva, mas o acesso completo só será liberado após a validação manual do administrador:
                <div className="mt-2 font-bold text-blue-900">
                  Juniomar Alex Mochnacz<br/>
                  📱 48 99146-1983
                </div>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <div className="relative">
                <Input 
                  id="new-password" 
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="Insira sua nova senha" 
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showNewPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="bg-muted/30 p-3 rounded-lg border border-border/50 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Requisitos da Senha</p>
              {requirements.map((req, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {req.valid ? (
                    <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={req.valid ? "text-foreground" : "text-muted-foreground"}>
                    {req.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Senha</Label>
              <div className="relative">
                <Input 
                  id="confirm-password" 
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  placeholder="Repita a nova senha" 
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading || !passwordValid || newPassword !== confirmPassword}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isFirstRegistration ? "Salvar e Solicitar Ativação" : "Salvar Nova Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md border-t-4 border-t-green-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <Check className="w-5 h-5" /> Senha Salva com Sucesso!
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground space-y-3">
              <p>
                Sua solicitação de nova senha foi registrada e encaminhada para validação.
              </p>
              <div className="bg-amber-50 p-4 rounded-lg flex gap-3 border border-amber-100">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold text-amber-900">Aguardando Aprovação</p>
                  <p className="text-amber-800 mt-1">
                    Seu acesso está temporariamente suspenso até que o administrador confirme a alteração. 
                    Entre em contato para agilizar:
                  </p>
                  <p className="mt-2 font-bold text-amber-900">
                    Juniomar Alex Mochnacz<br/>
                    📱 (48) 99146-1983
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleFinalize} className="w-full">
              Entendi e sair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChangePassword;
