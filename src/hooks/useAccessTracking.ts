import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const getFriendlyName = (path: string) => {
    const mapping: Record<string, string> = {
        "/dashboard": "Início / Dashboard",
        "/powerbi": "Relatórios Power BI",
        "/reagenda": "Sistema de Reagendamento / Antecipar Agenda",
        "/material-coleta": "Controle Materiais Dados",
        "/admin/usuarios": "Gerenciar Usuários",
        "/admin/analytics": "Monitoramento de Acessos",
        "/admin/perfis": "Gerenciar Perfis",
        "/alterar-senha": "Alterar Senha"
    };
    return mapping[path] || path;
};

export const useAccessTracking = (pageName: string, active: boolean = true, displayName?: string) => {
    const { user } = useAuth();
    const friendlyPage = displayName || getFriendlyName(pageName);

    useEffect(() => {
        if (!user || !active) return;

        // Log initial page access
        supabase.from("access_logs").insert({
            user_id: user.id,
            action: `Acessou ${friendlyPage}`,
            page: friendlyPage
        }).then(() => { });

        // Update presence status
        supabase.from("user_presence").upsert({
            user_id: user.id,
            last_seen_at: new Date().toISOString(),
            current_page: friendlyPage
        }).then(() => { });

        // Update heartbeat
        const interval = setInterval(async () => {
            // First check if the admin kicked this user
            const { data: presence } = await supabase
                .from("user_presence")
                .select("current_page")
                .eq("user_id", user.id)
                .maybeSingle();

            if (presence?.current_page === 'FORCED_DISCONNECT') {
                // Remove heartbeat
                clearInterval(interval);
                // Actually signOut on the client
                await supabase.auth.signOut();
                window.location.href = '/';
                return;
            }

            // Normal presence update
            supabase.from("user_presence").upsert({
                user_id: user.id,
                last_seen_at: new Date().toISOString(),
                current_page: friendlyPage
            }).then(() => { });
        }, 15000); // Check every 15s instead of 30s to respond faster to kicks

        return () => clearInterval(interval);
    }, [user, pageName, active, friendlyPage]);

    // Utility to manually track specific actions on the page
    const trackAction = async (actionDesc: string) => {
        if (!user) return;
        try {
            await supabase.from("access_logs").insert({
                user_id: user.id,
                action: actionDesc,
                page: pageName
            });
        } catch (e) {
            console.error("Access tracking error", e);
        }
    };

    return { trackAction };
};
