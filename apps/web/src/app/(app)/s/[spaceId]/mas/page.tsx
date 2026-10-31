import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadSpace } from "@/server/queries/home";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("more.title") };

export default async function MorePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const { supabase } = await requireReadyUser();
  const space = await loadSpace(supabase, parsed.data);
  if (!space) notFound();
  const base = `/s/${space.id}`;
  const items = [
    {
      key: "values",
      href: `${base}/valores`,
      label: t("values.link"),
      hint: t("more.values.hint"),
    },
    {
      key: "account",
      href: `${base}/cuentas/nueva`,
      label: t("home.add_account"),
      hint: t("more.account.hint"),
    },
    {
      key: "connections",
      href: `${base}/conexiones`,
      label: t("connections.link"),
      hint: t("more.connections.hint"),
    },
    {
      key: "assumptions",
      href: `${base}/supuestos`,
      label: t("assumptions.title"),
      hint: t("more.assumptions.hint"),
    },
    {
      key: "security",
      href: "/seguridad/mfa",
      label: t("more.security"),
      hint: t("more.security.hint"),
    },
    { key: "spaces", href: "/hogares", label: t("nav.spaces"), hint: t("more.spaces.hint") },
  ];
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("more.title")}</h1>
      <p className={styles.lead}>{t("more.intro")}</p>
      <ul className={shell.list}>
        {items.map((item) => (
          <li key={item.key}>
            <Link className={shell.item} href={item.href}>
              <span>
                <strong>{item.label}</strong>
                <br />
                <span className={shell.muted}>{item.hint}</span>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
