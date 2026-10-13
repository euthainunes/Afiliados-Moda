"use client";

import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";

export function ShareBox({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${title} — monte o look comigo: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
      } catch {
        // compartilhamento cancelado pela usuária
      }
    } else {
      await copy();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="link-look" className="text-sm font-medium">Link do look</label>
      <input id="link-look" readOnly value={url} className="h-11 rounded-lg border border-line bg-canvas px-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={copy}>{copied ? "Link copiado!" : "Copiar link"}</Button>
        <a className={buttonClasses("secondary", "sm")} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
        <Button type="button" size="sm" variant="secondary" onClick={share}>Mais opções</Button>
      </div>
      <p className="sr-only" aria-live="polite">{copied ? "Link copiado para a área de transferência." : ""}</p>
    </div>
  );
}
