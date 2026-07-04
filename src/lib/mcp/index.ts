import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import getMyProfileTool from "./tools/get-my-profile";

// Build the OAuth issuer from the Supabase project ref (import-safe: Vite inlines this
// at build time). NEVER use SUPABASE_URL — on Lovable Cloud it is the proxy host and
// the discovery document publishes the direct supabase.co issuer, so tokens would be
// rejected. The fallback keeps the string well-formed during manifest extraction.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ability-portal-mcp",
  title: "Ability Portal MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Ability Tecnologia corporate portal. Use `echo` to verify connectivity and `get_my_profile` to fetch the signed-in user's profile (nome, matricula, setor).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, getMyProfileTool],
});