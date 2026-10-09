"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "@/components/features/notifications/bell";
import { GlobalSearch } from "@/components/features/search/global-search";
import { Avatar } from "@/components/ui/avatar";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { BrandMark, NavLinks } from "./side-nav";

export type ShellUser = { id: string; fullName: string; role: Role; photoUrl: string | null; unread: number };

/** White top bar: lead search, the notifications bell and the signed-in user. */
export function TopBar({ user }: { user: ShellUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = menuRef.current;
    if (!d) return;
    if (menuOpen && !d.open) d.showModal();
    if (!menuOpen && d.open) d.close();
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-[var(--tl-topbar-h)] shrink-0 items-center gap-4 border-b border-tl-line bg-tl-surface/95 px-4 backdrop-blur lg:px-8">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setMenuOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-control bg-tl-brand text-tl-brand-text lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        <Bell userId={user.id} initialUnread={user.unread} />
        <span aria-hidden className="mx-1 h-6 w-px bg-tl-line" />
        <Link
          href="/profile"
          aria-label="My profile"
          className="flex items-center gap-3 rounded-control py-1 pr-2 pl-1 hover:bg-tl-raised"
        >
          <Avatar name={user.fullName} src={user.photoUrl} size={28} />
          <span className="hidden flex-col leading-tight xl:flex">
            <span className="text-label font-semibold text-tl-text">{user.fullName}</span>
            <span className="text-small text-tl-muted">{ROLE_LABEL[user.role]}</span>
          </span>
        </Link>
        <a
          href="/auth/signout?reason=signed-out"
          aria-label="Sign out"
          title="Sign out"
          className="inline-flex size-10 items-center justify-center rounded-control text-tl-text-2 hover:bg-tl-raised hover:text-tl-text"
        >
          <LogOut aria-hidden className="size-5" />
        </a>
      </div>

      <dialog
        ref={menuRef}
        aria-label="Menu"
        onCancel={(e) => {
          e.preventDefault();
          setMenuOpen(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setMenuOpen(false);
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[280px] max-w-[85vw] border-0 bg-tl-brand p-0 backdrop:bg-[rgb(27_16_48/0.35)]"
      >
        <div className="flex h-[var(--tl-topbar-h)] items-center justify-between px-5">
          <BrandMark />
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="inline-flex size-9 items-center justify-center rounded-control text-tl-brand-muted hover:bg-tl-brand-raised hover:text-white"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <nav aria-label="Main" className="px-3 pb-6">
          <NavLinks role={user.role} onNavigate={() => setMenuOpen(false)} />
        </nav>
      </dialog>
    </header>
  );
}
