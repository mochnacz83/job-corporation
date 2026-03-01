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
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, XCircle, Shield, Users, KeyRound, Trash2, Crown, Pencil, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UserProfile {
  id: string;
  user_id: string;
  matricula: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  empresa: string | null;
  telefone: string | null;
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

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", cargo: "", email: "", empresa: "", telefone: "" });
  const [saving, setSaving] = useState(false);

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

  const openEditDialog = (u: UserProfile) => {
    setEditUser(u);
    setEditForm({
      nome: u.nome || "",
      cargo: u.cargo || "",
      email: u.email || "",
      empresa: u.empresa || "",
      telefone: u.telefone || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditUser = async () => {
    if (!editUser) return;
    if (!editForm.nome.trim()) {
      toast({ title: "Erro", description: "O nome é obrigatório.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("admin-actions", {
        body: {
          action: "update-profile",
          userId: editUser.user_id,
          profileData: {
            nome: editForm.nome.trim(),
            cargo: editForm.cargo.trim() || null,
            email: editForm.email.trim() || null,
            empresa: editForm.empresa.trim() || null,
            telefone: editForm.telefone.replace(/\D/g, "") || null,
          },
        },
      });
      if (fnError || data?.error) throw new Error(data?.error || fnError?.message);
      toast({ title: "Sucesso", description: `Dados de ${editForm.nome} atualizados.` });
      setEditDialogOpen(false);
      await loadUsers();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
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
            <div className="p-1 bg-transparent w-10 h-10 flex items-center justify-center overflow-hidden">
              <img src="/ability-logo.png" alt="Ability Tecnologia Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Gerenciar Usuários</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {users.filter(u => u.status === "pendente").length > 0 && (
          <Alert variant="default" className="bg-amber-50 border-amber-200">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Atenção Adminstrador</AlertTitle>
            <AlertDescription className="text-amber-700">
              Existem {users.filter(u => u.status === "pendente").length} novos usuários aguardando sua validação para acessar o sistema. Revise-os abaixo.
            </AlertDescription>
          </Alert>
        )}

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
                  <TableHead>E-mail</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Controlar Acesso</TableHead>
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
                      <TableCell className="text-sm">{u.email || "—"}</TableCell>
                      <TableCell className="text-sm">{u.empresa || "—"}</TableCell>
                      <TableCell>{u.cargo || "—"}</TableCell>
                      <TableCell>
                        <Select
                          value={isUserAdmin ? "admin" : u.status}
                          onValueChange={(val) => {
                            if (val === "admin" && !isUserAdmin) {
                              toggleAdmin(u.user_id, false);
                              if (u.status !== "ativo") updateUserStatus(u.user_id, "ativo");
                            } else if (val !== "admin") {
                              if (isUserAdmin) toggleAdmin(u.user_id, true);
                              updateUserStatus(u.user_id, val);
                            }
                          }}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ativo">
                              <div className="flex items-center text-green-600"><CheckCircle className="w-3 h-3 mr-2" /> Ativo</div>
                            </SelectItem>
                            <SelectItem value="bloqueado">
                              <div className="flex items-center text-red-600"><XCircle className="w-3 h-3 mr-2" /> Bloqueado</div>
                            </SelectItem>
                            <SelectItem value="admin">
                              <div className="flex items-center text-amber-600"><Crown className="w-3 h-3 mr-2" /> Admin</div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider delayDuration={200}>
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" onClick={() => openEditDialog(u)} className="h-8 w-8 hover:bg-slate-100">
                                  <Pencil className="w-4 h-4 text-slate-700" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar Usuário</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" onClick={() => openResetDialog(u)} className="h-8 w-8 hover:bg-slate-100">
                                  <KeyRound className="w-4 h-4 text-slate-700" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Resetar Senha</TooltipContent>
                            </Tooltip>

                            {!isSelf && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" onClick={() => openDeleteDialog(u)} className="h-8 w-8 hover:bg-red-50 hover:text-red-600">
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Excluir Usuário</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
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

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Dados do Usuário</DialogTitle>
            <DialogDescription>
              Editando dados de <strong>{editUser?.nome}</strong> (Matrícula: {editUser?.matricula}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="edit-nome">Nome</Label>
              <Input id="edit-nome" value={editForm.nome}
                onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-cargo">Cargo</Label>
              <Input id="edit-cargo" value={editForm.cargo}
                onChange={(e) => setEditForm({ ...editForm, cargo: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input id="edit-email" type="email" value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-empresa">Empresa</Label>
              <Input id="edit-empresa" value={editForm.empresa}
                onChange={(e) => setEditForm({ ...editForm, empresa: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-telefone">Telefone</Label>
              <Input id="edit-telefone" value={editForm.telefone}
                onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditUser} disabled={saving || !editForm.nome.trim()}>
              {saving ? "Salvando..." : "Salvar Alterações"}
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
