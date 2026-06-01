/**
 * Bases compartilhadas do módulo Rastreabilidade ONT.
 *
 * As bases ficam num bucket privado do Supabase Storage (`ont-bases`) como JSON.
 * - Qualquer usuário autenticado consegue LER as bases.
 * - Apenas administradores conseguem GRAVAR / SOBRESCREVER / APAGAR (RLS no storage).
 *
 * Local IndexedDB continua sendo usado APENAS como cache de leitura,
 * para acelerar o carregamento subsequente.
 */
import { supabase } from "@/integrations/supabase/client";
import { ontGet, ontSet } from "@/lib/ontStorage";

const BUCKET = "ont-bases";

export type OntBaseType =
  | "presenca"
  | "gestech"
  | "sap"
  | "cruzamento"
  | "aplicados";

const filePath = (type: OntBaseType) => `${type}.json`;

/** Baixa a base do bucket. Retorna null se ainda não existe. */
export async function fetchSharedBase<T = any>(type: OntBaseType): Promise<T[] | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(filePath(type));
    if (error || !data) return null;
    const text = await data.text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

/** Sobrepõe a base no bucket (admin). Falha se a RLS bloquear. */
export async function uploadSharedBase(type: OntBaseType, data: any[]): Promise<void> {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath(type), blob, { upsert: true, contentType: "application/json" });
  if (error) throw new Error(error.message);
}

/** Remove a base do bucket (admin). */
export async function deleteSharedBase(type: OntBaseType): Promise<void> {
  await supabase.storage.from(BUCKET).remove([filePath(type)]);
}

export interface OntBaseMeta {
  base_type: string;
  row_count: number;
  updated_at: string;
  updated_by_email: string | null;
}

export async function fetchAllMeta(): Promise<Record<string, OntBaseMeta>> {
  const { data, error } = await (supabase.from("ont_bases_meta" as any) as any)
    .select("*");
  if (error || !data) return {};
  const out: Record<string, OntBaseMeta> = {};
  (data as OntBaseMeta[]).forEach((r) => { out[r.base_type] = r; });
  return out;
}

export async function upsertMeta(type: OntBaseType, rowCount: number, email: string | null) {
  await (supabase.from("ont_bases_meta" as any) as any).upsert(
    { base_type: type, row_count: rowCount, updated_at: new Date().toISOString(), updated_by_email: email },
    { onConflict: "base_type" },
  );
}

/** Cache local apenas para acelerar leitura subsequente. */
export async function cacheLocal(type: OntBaseType, data: any[]) {
  try { await ontSet(`ont_shared_${type}`, data); } catch { /* ignora quota */ }
}
export async function readLocalCache<T = any>(type: OntBaseType): Promise<T[] | null> {
  try { return (await ontGet<T[]>(`ont_shared_${type}`)) ?? null; } catch { return null; }
}