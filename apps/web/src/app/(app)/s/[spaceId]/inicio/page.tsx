import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { HomeView } from "@/components/home-view";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadHome } from "@/server/queries/home";
import { loadReview } from "@/server/queries/review";

export const metadata: Metadata = { title: t("home.title") };

export default async function HomePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const spaceId = parsed.data;

  const { supabase } = await requireReadyUser();
  const [data, review] = await Promise.all([
    loadHome(supabase, spaceId),
    // El aviso de cargos por revisar es accesorio: si falla, Inicio sigue funcionando.
    loadReview(supabase, spaceId).catch(() => null),
  ]);
  if (!data) notFound();
  return <HomeView data={data} review={review} />;
}
