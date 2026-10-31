"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent, sectionOf, type SectionId } from "@/lib/space-nav";
import styles from "./space-nav.module.css";

export interface TabItem {
  readonly id: SectionId;
  readonly label: string;
  readonly path: string;
}

export interface SubLink {
  readonly key: string;
  readonly label: string;
  readonly path: string;
}

const ICONS: Record<SectionId, string> = {
  home: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10",
  spend: "M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2",
  invest: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  assistant: "M4 5h16v11H9l-5 4zM8 10h8M8 13h5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

/** Barra de secciones: abajo en el móvil y arriba en pantallas anchas. */
export function SpaceTabs({
  spaceId,
  label,
  tabs,
}: {
  readonly spaceId: string;
  readonly label: string;
  readonly tabs: readonly TabItem[];
}) {
  const pathname = usePathname();
  const current = sectionOf(pathname, spaceId);
  return (
    <nav className={styles.tabs} aria-label={label}>
      <ul className={styles.tabList}>
        {tabs.map((tab) => (
          <li key={tab.id} className={styles.tabItem}>
            <Link
              className={styles.tab}
              href={`/s/${spaceId}/${tab.path}`}
              aria-current={current === tab.id ? "page" : undefined}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d={ICONS[tab.id]} />
              </svg>
              <span>{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Apartados de la sección actual (solo en las que agrupan varias pantallas). */
export function SpaceSubnav({
  spaceId,
  label,
  items,
}: {
  readonly spaceId: string;
  readonly label: string;
  readonly items: Readonly<Partial<Record<SectionId, readonly SubLink[]>>>;
}) {
  const pathname = usePathname();
  const section = sectionOf(pathname, spaceId);
  const links = section ? items[section] : undefined;
  if (!links) return null;
  return (
    <nav className={styles.sub} aria-label={label}>
      <ul className={styles.subList}>
        {links.map((link) => (
          <li key={link.key}>
            <Link
              className={styles.chip}
              href={`/s/${spaceId}/${link.path}`}
              aria-current={isCurrent(pathname, spaceId, link.path) ? "page" : undefined}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
