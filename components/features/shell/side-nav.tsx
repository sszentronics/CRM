"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccess } from "@/lib/auth/access";
import type { Role } from "@/lib/auth/roles";
import { activeHref, NAV_GROUPS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

/** The grouped menu, filtered to what `role` may open. Shown in the sidebar and in the narrow-window drawer. */
export function NavLinks({ role, platform, onNavigate }: { role: Role; platform: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const visible = (href: string) => (href === "/platform" ? platform : canAccess(role, href));
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => visible(i.href)) })).filter(
    (g) => g.items.length > 0,
  );
  const current = activeHref(pathname, groups.flatMap((g) => g.items.map((i) => i.href)));
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-small font-semibold text-white">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = item.href === current;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-3 rounded-control px-3 text-body font-medium transition-colors",
                      active
                        ? "bg-white text-tl-brand"
                        : "text-white hover:bg-tl-brand-raised",
                    )}
                  >
                    <NavIcon name={item.icon} className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** What the sidebar shows for the workspace: its logo when it has one, otherwise an initial tile. */
export type WorkspaceBrand = { name: string; logoPath: string | null };

export function BrandMark({ brand, size = 28 }: { brand: WorkspaceBrand; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {brand.logoPath ? (
        <Image src={brand.logoPath} alt={brand.name} width={Math.round(size * 0.96)} height={size} priority />
      ) : (
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center rounded-control bg-tl-primary text-label font-semibold text-white"
          style={{ width: size, height: size }}
        >
          {brand.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="tl-display truncate text-title text-tl-brand-text">{brand.name}</span>
    </span>
  );
}

/** Brand-coloured sidebar, 248 px, always visible on laptop screens. */
export function SideNav({ role, brand, platform }: { role: Role; brand: WorkspaceBrand; platform: boolean }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[var(--tl-sidebar-w)] shrink-0 flex-col bg-tl-brand lg:flex">
      <Link href="/" className="flex h-[var(--tl-topbar-h)] shrink-0 items-center px-5" aria-label={`${brand.name} home`}>
        <BrandMark brand={brand} />
      </Link>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pt-2 pb-6 [scrollbar-color:rgb(255_255_255/0.18)_transparent] [scrollbar-width:thin]">
        <NavLinks role={role} platform={platform} />
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-small text-tl-brand-muted">Powered by QuantraPro</div>
    </aside>
  );
}
