import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useAccessTracking = (pageName: string, active: boolean = true) => {
    const { user } = useAuth();

    useEffect(() => {
        if (!user || !active) return;

        // Log initial page access
        supabase.from("access_logs").insert({
            user_id: user.id,
            action: "page_view",
            page: pageName
        }).then(() => { });

        // Update presence status
        supabase.from("user_presence").upsert({
            user_id: user.id,
            last_seen_at: new Date().toISOString(),
            current_page: pageName
        }).then(() => { });

        // Optional heartbeat for active pages (e.g. keeps user online on Dashboard)
        // Removed 30s heartbeat from hook and leaving only init to avoid heavy load, 
        // unless explicitly needed. But we'll keep the heartbeat since the Dashboard used it.
        const interval = setInterval(() => {
            supabase.from("user_presence").upsert({
                user_id: user.id,
                last_seen_at: new Date().toISOString(),
                current_page: pageName
            }).then(() => { });
        }, 30000);

        return () => clearInterval(interval);
    }, [user, pageName, active]);

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
