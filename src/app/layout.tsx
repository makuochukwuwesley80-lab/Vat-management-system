import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";

export const metadata: Metadata = {
  title: "VAT Management System",
  description:
    "VAT Portal — centralized management platform for Vacation Adolescent Training centers across Nigeria.",
  icons: { icon: "/icon.svg" },
};

// Applied before paint so the saved theme is used with no flash.
const themeInit = `(function(){try{var t=localStorage.getItem('vat-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
