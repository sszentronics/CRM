import type { Metadata, Viewport } from "next";
import { Archivo, Figtree } from "next/font/google";
import { ServiceWorker } from "@/components/features/shell/service-worker";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Trading Labs", template: "%s | Trading Labs" },
  description: "Trading Labs CRM",
  applicationName: "Trading Labs",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#220B47",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${figtree.variable} antialiased`}>
      <body className="min-h-dvh bg-tl-bg text-tl-text-2">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
