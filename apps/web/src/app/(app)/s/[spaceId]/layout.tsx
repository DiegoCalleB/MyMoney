import type { ReactNode } from "react";
import { z } from "zod";
import { SpaceSubnav, SpaceTabs } from "@/components/space-nav";
import { t } from "@/lib/i18n";
import { SECTIONS, SUBNAV, type SectionId } from "@/lib/space-nav";
import styles from "./space-shell.module.css";

/**
 * Marco del hogar: barra de secciones (abajo en el móvil, arriba en pantallas anchas) y, dentro
 * de Gastos e Inversión, un sub-menú. Las pantallas siguen siendo las mismas.
 */
export default async function SpaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ spaceId: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) return children;
  const tabs = SECTIONS.map((s) => ({ id: s.id, label: t(`nav.tab.${s.id}`), path: s.landing }));
  const items = Object.fromEntries(
    Object.entries(SUBNAV).map(([section, links]) => [
      section,
      links.map((l) => ({ key: l.key, label: t(`nav.sub.${l.key}`), path: l.path })),
    ]),
  ) as Partial<Record<SectionId, { key: string; label: string; path: string }[]>>;
  return (
    <div className={styles.shell}>
      <SpaceSubnav spaceId={parsed.data} label={t("nav.sub.label")} items={items} />
      {children}
      <SpaceTabs spaceId={parsed.data} label={t("nav.tabs")} tabs={tabs} />
    </div>
  );
}
