import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { getPublicBrand } from "@/lib/workspace/public";
import { themeCss } from "@/lib/workspace/theme";

export const metadata: Metadata = { title: "Sign in" };

/** A company's own sign-in page: its name, logo and colours, then the same secure sign-in as everyone else. */
export default function CompanyLoginPage({ params }: PageProps<"/c/[slug]">) {
  return (
    <Suspense>
      <CompanyLogin params={params} />
    </Suspense>
  );
}

async function CompanyLogin({ params }: { params: PageProps<"/c/[slug]">["params"] }) {
  const { slug } = await params;
  const brand = await getPublicBrand(slug);
  if (!brand) notFound();
  const css = themeCss(brand.theme);
  const initial = brand.name.charAt(0).toUpperCase();
  return (
    <div className="flex min-h-dvh">
      {css ? <style>{css}</style> : null}
      <aside className="hidden w-[44%] max-w-[640px] flex-col justify-between bg-tl-brand p-12 lg:flex">
        <div className="flex items-center gap-3">
          {brand.logoPath ? (
            <Image src={brand.logoPath} alt={brand.name} width={46} height={48} priority />
          ) : (
            <span aria-hidden className="flex size-11 items-center justify-center rounded-control bg-tl-primary text-title font-semibold text-white">
              {initial}
            </span>
          )}
          <span className="tl-display text-title text-tl-brand-text">{brand.name}</span>
        </div>
        <div className="flex max-w-md flex-col gap-3">
          <p className="tl-display text-display-l text-tl-brand-text">Welcome back to {brand.name}.</p>
          <p className="text-body text-tl-brand-muted">Your leads, follow-ups and results, in one place.</p>
        </div>
        <p className="text-small text-tl-brand-muted">Powered by QuantraPro</p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span aria-hidden className="flex size-12 items-center justify-center rounded-control bg-tl-brand text-title font-semibold text-white">
              {initial}
            </span>
            <span className="tl-display text-title text-tl-text">{brand.name}</span>
          </div>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h1 className="tl-display text-display-m text-tl-text">Sign in to {brand.name}</h1>
              <p className="text-body text-tl-muted">Use your work email and password.</p>
            </div>
            <Suspense>
              <LoginForm />
            </Suspense>
            <p className="text-small text-tl-muted">
              Not with {brand.name}?{" "}
              <Link href="/login" className="font-semibold text-tl-link hover:underline">
                Go to the main sign-in
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
