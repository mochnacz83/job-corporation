## Diagnóstico

O único erro real captado no preview agora é:

```
POST /auth/v1/token?grant_type=refresh_token  → 400
{"code":"refresh_token_not_found","message":"Invalid Refresh Token: Refresh Token Not Found"}
```

Isso significa que o navegador guardou uma sessão antiga (token de atualização que o servidor já invalidou — comum depois de redeploy, troca de senha pelo admin, ou sessão muito antiga). Quando o app tenta renovar essa sessão, recebe 400 e, em seguida, **qualquer chamada autenticada falha** (salvar coleta, abrir Vistoria, exportar, listar usuários, etc.). É exatamente o sintoma de "alguns comandos estão dando erro".

Hoje, em `src/hooks/useAuth.tsx`:
- `getSession()` no boot não trata o caso de refresh inválido — fica com `session = null` mas o cliente Supabase continua tentando renovar em loop.
- `onAuthStateChange` não trata o evento `TOKEN_REFRESHED` com `session === null` nem força logout/limpeza local quando o refresh falha.
- Não há redirecionamento para `/auth` quando a sessão cai durante o uso, então telas internas tentam consultar o banco com token morto e mostram erro genérico.

## O que vou corrigir (apenas frontend / auth)

1. **Tratar refresh inválido no boot** em `useAuth.tsx`
   - Envolver `supabase.auth.getSession()` para detectar erro `refresh_token_not_found` / `Invalid Refresh Token`.
   - Quando ocorrer: chamar `supabase.auth.signOut({ scope: 'local' })` para limpar o storage local, sem chamar a API (evita novo 400), e seguir como deslogado.

2. **Reagir a falha de renovação durante o uso**
   - No `onAuthStateChange`, quando o evento for `SIGNED_OUT` ou `TOKEN_REFRESHED` com `session === null`, limpar estado e redirecionar para `/auth` (somente se o usuário estiver em rota protegida).

3. **Wrapper leve para erros 401/refresh em queries**
   - Pequeno helper que, ao detectar `refresh_token_not_found` em qualquer resposta, dispara o mesmo signOut local + redirect, em vez de mostrar erro técnico.

4. **Mensagem amigável**
   - Toast: "Sua sessão expirou. Faça login novamente." (em vez do erro cru atual).

5. **Verificação**
   - Abrir o preview, validar que não aparece mais 400 em loop e que ao expirar a sessão o usuário é levado a `/auth` limpo.

## O que NÃO vou mexer

- Banco, RLS, edge functions, regras de negócio, layout, permissões — nada disso muda.
- Fluxo de login por matrícula, troca obrigatória de senha e ativação por admin permanecem iguais.

## Observação

Se o erro que você está vendo for **outro** (ex.: falha específica em "Material Coleta", "Vistoria", upload de planilha, criar usuário), me diga qual módulo + a mensagem que aparece — eu ajusto o plano antes de implementar. O conserto acima resolve a causa visível agora; outros bugs pontuais precisam do sintoma exato para serem reproduzidos.
