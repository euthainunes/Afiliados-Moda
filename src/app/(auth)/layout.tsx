import Link from "next/link";
import { site } from "@/config/site";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <Link href="/" className="mb-8 font-display text-2xl font-semibold">
        {site.name}
      </Link>
      <main id="conteudo" className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 sm:p-8">
        {children}
      </main>
    </div>
  );
}
