import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, ArrowLeft, Eye, EyeOff, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

const MATRICULA_REGEX = /^TT\d{6}$/;
const PHONE_REGEX = /^\d{11}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{6,}$/;

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

type View = "login" | "signup" | "forgot";

const Login = () => {
  const [view, setView] = useState<View>("login");
  const [matricula, setMatricula] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [nome, setNome] = useState("");
  const [emailContato, setEmailContato] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cargo, setCargo] = useState("");
  const [area, setArea] = useState("");
  // Signup-specific
  const [forgotMatricula, setForgotMatricula] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotPasswordConfirm, setForgotPasswordConfirm] = useState("");
  const [showForgotPwd, setShowForgotPwd] = useState(false);
  const [showForgotPwdConfirm, setShowForgotPwdConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Ghost reset state
  const [ghostDialogOpen, setGhostDialogOpen] = useState(false);
  const [ghostEmail, setGhostEmail] = useState("");
  const [resettingGhost, setResettingGhost] = useState(false);

  const handleMatriculaChange = (value: string) => {
    // Always start with TT, only allow digits after
    let cleaned = value.toUpperCase();
    if (!cleaned.startsWith("TT")) cleaned = "TT";
    const afterTT = cleaned.slice(2).replace(/\D/g, "").slice(0, 6);
    setMatricula("TT" + afterTT);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!MATRICULA_REGEX.test(matricula) || !password.trim()) return;
    setLoading(true);
    try {
      await signIn(matricula.trim(), password);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("status")
        .eq("matricula", matricula.trim())
        .single();

      if (profileData?.status === "bloqueado") {
        await supabase.auth.signOut();
        toast({ title: "Acesso bloqueado", description: "Sua conta está bloqueada. Entre em contato com o administrador.", variant: "destructive", duration: 8000 });
        return;
      }
      if (profileData?.status === "pendente") {
        await supabase.auth.signOut();
        toast({
          title: "⏳ Aguardando validação do Administrador",
          description: "Sua conta ainda não foi ativada ou a alteração de senha está pendente. Entre em contato:\n📱 Juniomar Alex Mochnacz — (48) 99146-1983\n📧 juniomar.mochnacz@abilitytecnologia.com.br",
          variant: "destructive",
          duration: 12000,
        });
        return;
      }
      navigate("/dashboard");
    } catch {
      toast({ title: "Erro no login", description: "Matrícula ou senha incorretos.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!MATRICULA_REGEX.test(matricula)) {
      toast({ title: "Matrícula inválida", description: "A matrícula deve começar com TT seguido de 6 números.", variant: "destructive" });
      return;
    }
    const phoneDigits = telefone.replace(/\D/g, "");
    if (!PHONE_REGEX.test(phoneDigits)) {
      toast({ title: "Telefone inválido", description: "Informe DDD + 9 dígitos (11 números).", variant: "destructive" });
      return;
    }
    if (!nome.trim()) {
      toast({ title: "Campo obrigatório", description: "Por favor, informe seu nome completo.", variant: "destructive" });
      return;
    }
    if (!emailContato.trim()) {
      toast({ title: "Campo obrigatório", description: "Por favor, informe seu e-mail de contato.", variant: "destructive" });
      return;
    }
    if (!area) {
      toast({ title: "Campo obrigatório", description: "Por favor, selecione sua área.", variant: "destructive" });
      return;
    }
    if (!cargo) {
      toast({ title: "Campo obrigatório", description: "Por favor, selecione seu cargo.", variant: "destructive" });
      return;
    }
    if (!empresa.trim()) {
      toast({ title: "Campo obrigatório", description: "Por favor, informe sua empresa.", variant: "destructive" });
      return;
    }

    const signupPassword = "12346@Ab";


    setLoading(true);
    try {
      // 🕵️ Verificação de Duplicidade (Matrícula, Nome, E-mail ou Telefone)
      const { data: existingProfile, error: checkError } = await supabase
        .from("profiles")
        .select("matricula, nome, email, telefone")
        .or(`matricula.eq."${matricula.trim()}",nome.eq."${nome.trim()}",email.eq."${emailContato.trim()}",telefone.eq."${phoneDigits}"`)
        .maybeSingle();

      if (checkError) {
        console.error("[Signup] Erro ao verificar duplicidade:", checkError);
      }

      if (existingProfile) {
        let duplicatedField = "dados";
        if (existingProfile.matricula === matricula.trim()) duplicatedField = "Matrícula";
        else if (existingProfile.nome === nome.trim()) duplicatedField = "Nome";
        else if (existingProfile.email === emailContato.trim()) duplicatedField = "E-mail";
        else if (existingProfile.telefone === phoneDigits) duplicatedField = "Telefone";

        setLoading(false);
        toast({
          title: "Cadastro já identificado",
          description: `Já existe um usuário com este(a) ${duplicatedField}. Você já possui uma conta? Use a recuperação de senha.`,
          variant: "destructive",
          duration: 8000,
        });

        // Redireciona para recuperação
        setView("forgot");
        setForgotMatricula(matricula.trim());
        return;
      }

      // Check if user already exists in Auth but not in Profiles (Ghost User)
      const signupEmail = `${matricula.trim().toLowerCase()}@corporativo.local`;
      try {
        const { data: statusData } = await supabase.functions.invoke("admin-actions", {
            body: { action: "get-user-status", email: signupEmail }
        });

        if (statusData?.exists && !statusData?.hasProfile) {
            console.log("[Signup] Ghost user detected:", signupEmail);
            setGhostEmail(signupEmail);
            setGhostDialogOpen(true);
            setLoading(false);
            return;
        }
      } catch (err) {
        console.warn("[Signup] Ghost check failed (non-blocking):", err);
      }

      console.log("[Signup] Iniciando cadastro para:", signupEmail);

      const signupMetadata = {
        matricula: matricula.trim(),
        nome: nome.trim(),
        email_contato: emailContato.trim(),
        empresa: empresa.trim(),
        telefone: phoneDigits,
        cargo: cargo.trim(),
        area: area.trim(),
        // Dual keys for extra robustness during transition
        reg_cargo: cargo.trim(),
        reg_area: area.trim()
      };

      console.log("=========================================");
      console.log("[Signup Diagnostic] Full Metadata:", JSON.stringify(signupMetadata, null, 2));
      console.log("[Signup Diagnostic] Area Value:", area.trim(), "| Type:", typeof area);
      console.log("[Signup Diagnostic] Cargo Value:", cargo.trim(), "| Type:", typeof cargo);
      console.log("=========================================");

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: signupMetadata,
        },
      });

      if (signUpError) {
        console.error("[Signup] Erro do Supabase Auth:", signUpError);
        // Translate common Supabase error messages
        let friendlyMsg = signUpError.message;
        if (signUpError.message.toLowerCase().includes("already registered") || signUpError.message.toLowerCase().includes("already exists")) {
          friendlyMsg = "Esta matrícula já foi cadastrada. Tente fazer login ou use a recuperação de senha.";
        } else if (signUpError.message.toLowerCase().includes("password")) {
          friendlyMsg = "A senha temporária padrão não atende aos requisitos internos. Contate o suporte.";
        }
        throw new Error(friendlyMsg);
      }

      if (!signUpData?.user) {
        console.warn("[Signup] Nenhum usuário retornado — possível duplicata silenciosa");
        toast({ title: "Matrícula já cadastrada", description: "Esta matrícula já existe no sistema. Tente fazer login.", variant: "destructive" });
        return;
      }

      console.log("[Signup] Usuário criado com sucesso:", signUpData.user.id);

      // Failsafe: Create/Complete profile via Edge Function to ensure Area and Cargo are saved
      try {
        console.log("[Signup] Criando perfil via Edge Function...");
        const { data: profileRes, error: profileErr } = await supabase.functions.invoke("admin-actions", {
          body: {
            action: "complete-signup",
            userId: signUpData.user.id,
            profileData: signupMetadata
          },
        });

        if (profileErr || profileRes?.error) {
          console.warn("[Signup] Erro não crítico ao criar perfil via function:", profileErr || profileRes?.error);
        } else {
          console.log("[Signup] Perfil criado/atualizado com sucesso via function.");
        }
      } catch (err) {
        console.warn("[Signup] Falha na chamada da Edge Function para perfil:", err);
      }

      // Trigger notification
      try {
        await supabase.functions.invoke("notify-new-user", {
          body: { nome: nome.trim(), matricula: matricula.trim() },
        });
      } catch (notifyErr) {
        console.warn("Notification error (non-blocking):", notifyErr);
      }

      toast({
        title: "✅ Cadastro realizado com sucesso!",
        description: `Sua solicitação foi enviada. Senha Provisória: 12346@Ab. Aguarde a aprovação do administrador para acessar.`,
        duration: 15000
      });
      setView("login");
      setNome(""); setEmailContato(""); setEmpresa(""); setTelefone("");
      setCargo(""); setArea(""); setMatricula("");
    } catch (err: any) {
      console.error("[Signup] Erro final:", err);
      
      const caughtMsg = err.message || "";
      
      // Specifically catch "already registered" and check for ghost status
      if (caughtMsg.toLowerCase().includes("already registered") || caughtMsg.toLowerCase().includes("already exists")) {
        const errorAuthEmail = `${matricula.trim().toLowerCase()}@corporativo.local`;
        try {
            const { data: statusData } = await supabase.functions.invoke("admin-actions", {
                body: { action: "get-user-status", email: errorAuthEmail }
            });

            if (statusData?.exists && !statusData?.hasProfile) {
                setGhostEmail(errorAuthEmail);
                setGhostDialogOpen(true);
                setLoading(false);
                return;
            }
        } catch (e) { }
      }
      
      let finalErrorMessage = caughtMsg || "Não foi possível completar seu cadastro. Tente novamente em instantes.";
      let errorTitle = "Ops! Algo deu errado";

      // Detect "Failed to fetch" (usually network error or CORS issue)
      if (finalErrorMessage.includes("Failed to fetch") || finalErrorMessage.includes("NetworkError")) {
        finalErrorMessage = "Falha de conexão com o servidor. Se você já tentou se cadastrar antes, sua matrícula pode estar em processamento. Tente fazer login ou use a recuperação de senha.";
        errorTitle = "Erro de Conexão";
      }

      toast({ 
        title: errorTitle, 
        description: finalErrorMessage, 
        variant: "destructive", 
        duration: 10000 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotMatricula.trim()) return;
    if (!MATRICULA_REGEX.test(forgotMatricula.trim())) {
      toast({ title: "Matrícula inválida", description: "A matrícula deve começar com TT seguido de 6 números.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("forgot-password", {
        body: { matricula: forgotMatricula.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Solicitação enviada!", description: "Sua solicitação foi enviada ao administrador. Aguarde o contato para receber sua nova senha." });
      setView("login");
      setForgotMatricula("");
    } catch (err: any) {
      const msg = err?.message || "Erro ao recuperar senha.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      <Card className="w-full max-w-md glass-card relative z-10">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-24 h-24 flex items-center justify-center p-2 mb-2 bg-transparent overflow-hidden">
            <img src="/ability-logo.png" alt="Ability Tecnologia Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Portal Corporativo</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {view === "signup" ? "Cadastre sua conta" : view === "forgot" ? "Recuperar senha" : "Acesse com sua matrícula"}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {/* Forgot password link at the top */}
          {view === "login" && (
            <button
              type="button"
              onClick={() => {
                setView("forgot");
                setForgotMatricula(matricula);
              }}
              className="text-sm text-primary hover:underline mb-4 block w-full text-center"
            >
              Esqueci a senha
            </button>
          )}

          {view === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <button
                type="button"
                onClick={() => setView("login")}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-2"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar ao login
              </button>
              <div className="space-y-2">
                <Label htmlFor="forgot-matricula">Matrícula</Label>
                <Input
                  id="forgot-matricula"
                  value={forgotMatricula}
                  onChange={(e) => {
                    let cleaned = e.target.value.toUpperCase();
                    if (!cleaned.startsWith("TT")) cleaned = "TT";
                    const afterTT = cleaned.slice(2).replace(/\D/g, "").slice(0, 6);
                    setForgotMatricula("TT" + afterTT);
                  }}
                  placeholder="TT000000"
                  maxLength={8}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Informe sua matrícula e o administrador será notificado. Ele entrará em contato com sua nova senha.
              </p>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Solicitar nova senha
              </Button>
            </form>
          )}

          {view === "login" && (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="matricula">Matrícula</Label>
                  <Input
                    id="matricula"
                    value={matricula}
                    onChange={(e) => handleMatriculaChange(e.target.value)}
                    placeholder="TT000000"
                    maxLength={8}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading || !MATRICULA_REGEX.test(matricula)}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
              </form>
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setView("signup")}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Primeiro acesso? Cadastre-se
                </button>
              </div>
            </>
          )}

          {view === "signup" && (
            <>
              <form onSubmit={handleSignUp} className="space-y-4">
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar ao login
                </button>
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Completo</Label>
                  <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="matricula-signup">Matrícula</Label>
                  <Input
                    id="matricula-signup"
                    value={matricula}
                    onChange={(e) => handleMatriculaChange(e.target.value)}
                    placeholder="TT000000"
                    maxLength={8}
                    required
                  />
                  {matricula.length > 0 && !MATRICULA_REGEX.test(matricula) && (
                    <p className="text-xs text-destructive">Formato: TT seguido de 6 números</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-contato">E-mail</Label>
                  <Input id="email-contato" type="email" value={emailContato} onChange={(e) => setEmailContato(e.target.value)} placeholder="seu@email.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="area">Área</Label>
                  <Select onValueChange={setArea} value={area} required>
                    <SelectTrigger id="area">
                      <SelectValue placeholder="Selecione a área" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Comunicação de Dados">Comunicação de Dados</SelectItem>
                      <SelectItem value="Home Connect">Home Connect</SelectItem>
                      <SelectItem value="Suporte CL">Suporte CL</SelectItem>
                      <SelectItem value="Gerencia">Gerencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cargo">Cargo</Label>
                  <Select onValueChange={setCargo} value={cargo} required>
                    <SelectTrigger id="cargo">
                      <SelectValue placeholder="Selecione o cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Gerente">Gerente</SelectItem>
                      <SelectItem value="Coordenador">Coordenador</SelectItem>
                      <SelectItem value="Supervisor">Supervisor</SelectItem>
                      <SelectItem value="Apoio CL">Apoio CL</SelectItem>
                      <SelectItem value="Técnico Dados">Técnico Dados</SelectItem>
                      <SelectItem value="Técnico Home">Técnico Home</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone (DDD + 9 dígitos)</Label>
                  <Input
                    id="telefone"
                    value={telefone}
                    onChange={(e) => setTelefone(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="empresa">Empresa</Label>
                  <Input
                    id="empresa"
                    value={empresa}
                    onChange={(e) => setEmpresa(e.target.value)}
                    placeholder="Nome da empresa"
                    required
                  />
                </div>

                <div className="space-y-1 pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Senha Temporária
                  </p>
                  <Alert variant="default" className="bg-blue-50 border-blue-200 py-2">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-700 text-[11px] leading-tight">
                      Sua senha provisória será <strong className="font-bold">12346@Ab</strong>.
                      Após o administrador aprovar seu acesso, você deverá alterá-la no primeiro login.
                    </AlertDescription>
                  </Alert>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cadastrar
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={ghostDialogOpen} onOpenChange={setGhostDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-600" /> Cadastro Incompleto Detectado
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              Identificamos que sua matrícula <strong>{matricula}</strong> possui um cadastro antigo que não foi concluído.
              <br/><br/>
              Para garantir que seus dados atuais sejam salvos corretamente, precisamos <strong>reiniciar seu processo de cadastro</strong>. Isso não afetará seus acessos futuros.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setGhostDialogOpen(false)} disabled={resettingGhost}>
              Cancelar
            </Button>
            <Button 
                onClick={async () => {
                    setResettingGhost(true);
                    try {
                        const { data, error } = await supabase.functions.invoke("admin-actions", {
                            body: { action: "reset-my-ghost", email: ghostEmail }
                        });
                        if (error || data?.error) throw new Error(data?.error || error?.message);
                        
                        toast({ title: "Pronto!", description: "Histórico antigo removido. Você já pode clicar em 'Cadastrar' novamente." });
                        setGhostDialogOpen(false);
                    } catch (err: any) {
                        toast({ title: "Erro ao reiniciar", description: err.message, variant: "destructive" });
                    } finally {
                        setResettingGhost(false);
                    }
                }}
                disabled={resettingGhost}
            >
              {resettingGhost ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Reiniciar cadastro agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
