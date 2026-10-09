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
export function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canAccess(role, i.href)) })).filter(
    (g) => g.items.length > 0,
  );
  const current = activeHref(pathname, groups.flatMap((g) => g.items.map((i) => i.href)));
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-small font-semibold text-tl-brand-muted">{group.label}</p>
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
                        : "text-tl-brand-muted hover:bg-tl-brand-raised hover:text-tl-brand-text",
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

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-3">
      <Image src="/brand/tl-logo.png" alt="Trading Labs" width={Math.round(size * 0.96)} height={size} priority />
      <span className="tl-display text-title text-tl-brand-text">Trading Labs</span>
    </span>
  );
}

/** Purple sidebar, 248 px, always visible on laptop screens. */
export function SideNav({ role }: { role: Role }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[var(--tl-sidebar-w)] shrink-0 flex-col bg-tl-brand lg:flex">
      <Link href="/" className="flex h-[var(--tl-topbar-h)] shrink-0 items-center px-5" aria-label="Trading Labs home">
        <BrandMark />
      </Link>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pt-2 pb-6 [scrollbar-color:rgb(255_255_255/0.18)_transparent] [scrollbar-width:thin]">
        <NavLinks role={role} />
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-small text-tl-brand-muted">Trading Labs CRM</div>
    </aside>
  );
}
