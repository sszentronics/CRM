import Image from "next/image";

/** Sign-in screens: purple brand panel on the left (the logo lives there), white form on the right. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-[44%] max-w-[640px] flex-col justify-between bg-tl-brand p-12 lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/brand/tl-logo.png" alt="Trading Labs" width={46} height={48} priority />
          <span className="tl-display text-title text-tl-brand-text">Trading Labs</span>
        </div>
        <div className="flex max-w-md flex-col gap-3">
          <p className="tl-display text-display-l text-tl-brand-text">From first call to verified deposit.</p>
          <p className="text-body text-tl-brand-muted">
            The sales workspace for the Trading Labs team. Staff accounts only.
          </p>
        </div>
        <p className="text-small text-tl-brand-muted">Trading Labs, Islamabad</p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex size-12 items-center justify-center rounded-control bg-tl-brand">
              <Image src="/brand/tl-logo.png" alt="Trading Labs" width={28} height={29} priority />
            </span>
            <span className="tl-display text-title text-tl-text">Trading Labs</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
