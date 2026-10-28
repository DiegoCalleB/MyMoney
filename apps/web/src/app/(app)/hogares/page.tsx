import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadSpaces } from "@/server/queries/home";
import styles from "../../page.module.css";
import shell from "../shell.module.css";
import { CreateSpaceForm } from "./create-space-form";

export const metadata: Metadata = { title: t("spaces.title") };

export default async function SpacesPage() {
  const { supabase } = await requireReadyUser();
  const spaces = await loadSpaces(supabase);
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("spaces.title")}</h1>
      {spaces.length === 0 ? (
        <p className={styles.lead}>{t("spaces.empty")}</p>
      ) : (
        <ul className={shell.list}>
          {spaces.map((space) => (
            <li key={space.id} className={shell.item}>
              <span>{space.name}</span>
              <Link className={styles.secondary} href={`/s/${space.id}/inicio`}>
                {t("spaces.open", { name: space.name })}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className={styles.section} aria-labelledby="crear-hogar">
        <h2 id="crear-hogar" className={styles.heading2}>
          {t("spaces.create.title")}
        </h2>
        <CreateSpaceForm />
      </section>
    </main>
  );
}
