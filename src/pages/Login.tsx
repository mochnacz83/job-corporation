import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MATRICULA_REGEX = /^TT\d{6}$/;
const PHONE_REGEX = /^\d{11}$/;

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
  const [forgotEmail, setForgotEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

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
        toast({ title: "Acesso bloqueado", description: "Sua conta está bloqueada. Contacte o administrador.", variant: "destructive" });
        return;
      }
      if (profileData?.status === "pendente") {
        await supabase.auth.signOut();
        toast({ title: "Aguardando aprovação", description: "Sua conta ainda não foi ativada pelo administrador.", variant: "destructive" });
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
    if (!nome.trim() || !emailContato.trim() || !empresa.trim()) return;
    setLoading(true);
    try {
      const email = `${matricula.trim()}@empresa.local`;
      // Generate a temporary random password
      const tempPassword = Math.random().toString(36).slice(-10) + "A1!";
      const { error } = await supabase.auth.signUp({
        email,
        password: tempPassword,
        options: {
          data: {
            matricula: matricula.trim(),
            nome: nome.trim(),
            email_contato: emailContato.trim(),
            empresa: empresa.trim(),
            telefone: phoneDigits,
            cargo: cargo.trim(),
            area: area.trim(),
          },
        },
      });
      if (error) throw error;

      supabase.functions.invoke("notify-new-user", {
        body: { nome: nome.trim(), matricula: matricula.trim() },
      }).catch((err) => console.error("Notification error:", err));

      toast({ title: "Conta criada!", description: "Aguarde a aprovação do administrador. Você receberá uma senha inicial em seu e-mail após a ativação." });
      setView("login");
      setNome("");
      setEmailContato("");
      setEmpresa("");
      setTelefone("");
      setCargo("");
      setArea("");
      // password state reset removed
      setMatricula("");
    } catch (err: any) {
      toast({ title: "Erro ao cadastrar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("forgot-password", {
        body: { email: forgotEmail.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "E-mail enviado!", description: "Verifique sua caixa de entrada para a nova senha temporária." });
      setView("login");
      setForgotEmail("");
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
              onClick={() => setView("forgot")}
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
                <Label htmlFor="forgot-email">E-mail cadastrado</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Uma nova senha temporária será enviada para o e-mail informado.
              </p>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar nova senha
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
                {/* Senha input removed for signup */}
                <Button type="submit" className="w-full" disabled={loading || !MATRICULA_REGEX.test(matricula)}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cadastrar
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
