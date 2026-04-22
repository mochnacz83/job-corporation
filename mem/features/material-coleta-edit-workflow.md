---
name: material-coleta-edit-workflow
description: Material Coleta - serial unique constraint, edit-request workflow with admin unlock and post-edit lock
type: feature
---
Módulo Controle de Materiais (MaterialColeta):
- Seriais devem ser únicos GLOBALMENTE (qualquer coleta). Validação no app (validateSeriaisUnique) + trigger no banco (enforce_unique_serial). Valores ignorados: vazio, "N/A", "-".
- Após salvar um formulário, dono não consegue mais editar materiais/seriais diretamente. Pode clicar em "Solicitar edição" (ícone KeyRound) — abre diálogo com motivo obrigatório (mín 5 chars).
- Admin vê ícone Unlock nas linhas com edit_requested. Ao liberar (handleAdminUnlockEdit), seta edit_unlocked=true.
- Dono então vê um botão de Pencil (primary) que abre o editor completo de materiais (post-unlock dialog), permitindo: alterar serial/qtd, adicionar e remover materiais.
- Ao salvar (handleSavePostUnlockEdit) → post_edit_locked=true e edit_unlocked=false. Registro fica permanentemente travado.
- Colunas em material_coletas: edit_requested, edit_request_reason, edit_requested_at, edit_unlocked, edit_unlocked_at, edit_unlocked_by, post_edit_locked.
- RLS: dono só pode UPDATE em material_coletas se post_edit_locked=false; só pode INSERT/UPDATE/DELETE em material_coleta_items se edit_unlocked=true (exceto no insert original quando ainda não há itens).
