import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, CheckCircle, XCircle, Shield, Users, KeyRound, Trash2, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UserProfile {
  id: string;
  user_id: string;
  matricula: string;
  nome: string;
  cargo: string | null;
  status: string;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: string;
}

const validatePassword = (password: string): string | null => {
  if (password.length < 6) return "A senha deve ter no mínimo 6 caracteres.";
  if (!/[a-z]/.test(password)) return "A senha deve conter pelo menos uma letra minúscula.";
  if (!/[A-Z]/.test(password)) return "A senha deve conter pelo menos uma letra maiúscula.";
  if (!/\d/.test(password)) return "A senha deve conter pelo menos um número.";
  if (!/[^a-zA-Z0-9]/.test(password)) return "A senha deve conter pelo menos um caractere especial.";
  return null;
};

const AdminUsers = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUser, setResetUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    checkAdminAndLoad();
  }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      navigate("/dashboard");
      return;
    }

    setIsAdmin(true);
    await loadUsers();
    setLoading(false);
  };

  const loadUsers = async () => {
    const [{ data: profilesData }, { data: rolesData }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
    ]);

    if (profilesData) setUsers(profilesData as UserProfile[]);
    if (rolesData) {
      setAdminUserIds(new Set(rolesData.map((r: any) => r.user_id)));
    }
  };

  const updateUserStatus = async (userId: string, newStatus: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Erro", description: "Não foi possível atualizar o status.", variant: "destructive" });
      return;
    }

    toast({
      title: "Sucesso",
      description: `Usuário ${newStatus === "ativo" ? "ativado" : "bloqueado"} com sucesso.`,
    });
    await loadUsers();
  };

  const toggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    if (isCurrentlyAdmin) {
      // Remove admin role
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");

      if (error) {
        toast({ title: "Erro", description: "Não foi possível remover o admin.", variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso", description: "Permissão de administrador removida." });
    } else {
      // Add admin role
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });

      if (error) {
        toast({ title: "Erro", description: "Não foi possível promover a admin.", variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso", description: "Usuário promovido a administrador." });
    }
    await loadUsers();
  };

  const openResetDialog = (u: UserProfile) => {
    setResetUser(u);
    setNewPassword("");
    setPasswordError(null);
    setResetDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    const error = validatePassword(newPassword);
    if (error) { setPasswordError(error); return; }

    setResetting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("admin-actions", {
        body: { action: "reset-password", userId: resetUser.user_id, newPassword },
      });
      if (fnError || data?.error) throw new Error(data?.error || fnError?.message);
      toast({ title: "Senha redefinida", description: `A senha de ${resetUser.nome} foi redefinida.` });
      setResetDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const openDeleteDialog = (u: UserProfile) => {
    setDeleteUserTarget(u);
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setDeleting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("admin-actions", {
        body: { action: "delete-user", userId: deleteUserTarget.user_id },
      });
      if (fnError || data?.error) throw new Error(data?.error || fnError?.message);
      toast({ title: "Usuário excluído", description: `A conta de ${deleteUserTarget.nome} foi excluída.` });
      setDeleteDialogOpen(false);
      await loadUsers();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ativo":
        return <Badge className="bg-green-600 hover:bg-green-700">Ativo</Badge>;
      case "bloqueado":
        return <Badge variant="destructive">Bloqueado</Badge>;
      case "pendente":
        return <Badge variant="secondary">Pendente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Gerenciar Usuários</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <CardTitle>Usuários Cadastrados</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isUserAdmin = adminUserIds.has(u.user_id);
                  const isSelf = u.user_id === user?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono">{u.matricula}</TableCell>
                      <TableCell>{u.nome}</TableCell>
                      <TableCell>{u.cargo || "—"}</TableCell>
                      <TableCell>{getStatusBadge(u.status)}</TableCell>
                      <TableCell>
                        {isUserAdmin ? (
                          <Badge className="bg-amber-600 hover:bg-amber-700">
                            <Crown className="w-3 h-3 mr-1" /> Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline">Usuário</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {u.status !== "ativo" && (
                            <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50"
                              onClick={() => updateUserStatus(u.user_id, "ativo")}>
                              <CheckCircle className="w-4 h-4 mr-1" /> Ativar
                            </Button>
                          )}
                          {u.status !== "bloqueado" && (
                            <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10"
                              onClick={() => updateUserStatus(u.user_id, "bloqueado")}>
                              <XCircle className="w-4 h-4 mr-1" /> Bloquear
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => openResetDialog(u)}>
                            <KeyRound className="w-4 h-4 mr-1" /> Resetar Senha
                          </Button>
                          {!isSelf && (
                            <>
                              <Button size="sm" variant="outline"
                                className={isUserAdmin ? "text-amber-600 border-amber-600" : "text-primary border-primary"}
                                onClick={() => toggleAdmin(u.user_id, isUserAdmin)}>
                                <Crown className="w-4 h-4 mr-1" />
                                {isUserAdmin ? "Remover Admin" : "Promover Admin"}
                              </Button>
                              <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10"
                                onClick={() => openDeleteDialog(u)}>
                                <Trash2 className="w-4 h-4 mr-1" /> Excluir
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum usuário cadastrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>
              Informe a nova senha para <strong>{resetUser?.nome}</strong> (Matrícula: {resetUser?.matricula}).
              O usuário será obrigado a trocar a senha no próximo login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input type="password" placeholder="Nova senha" value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }} />
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>A senha deve conter:</p>
              <ul className="list-disc list-inside">
                <li>No mínimo 6 caracteres</li>
                <li>Pelo menos uma letra maiúscula</li>
                <li>Pelo menos uma letra minúscula</li>
                <li>Pelo menos um número</li>
                <li>Pelo menos um caractere especial (!@#$%...)</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={resetting || !newPassword}>
              {resetting ? "Redefinindo..." : "Redefinir Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir permanentemente a conta de{" "}
              <strong>{deleteUserTarget?.nome}</strong> (Matrícula: {deleteUserTarget?.matricula})?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Excluir Permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsers;
