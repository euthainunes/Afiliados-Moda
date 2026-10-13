import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { site } from "@/config/site";
import { getPublicLook } from "@/modules/looks/service";

export const alt = "Look compartilhado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

// Imagens locais (catálogo fictício) são embutidas; imagens remotas são buscadas pelo gerador.
async function imageSrc(src: string | null): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("https://")) return src;
  const file = path.join(process.cwd(), "public", path.normalize(src).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(path.join(process.cwd(), "public"))) return null;
  try {
    const data = await readFile(file);
    const type = src.endsWith(".svg") ? "image/svg+xml" : src.endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${type};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicLook(slug);
  const title = data?.look.title ?? site.name;
  const creator = data?.creator.displayName ?? "";
  const images = data ? (await Promise.all(data.items.slice(0, 4).map((i) => imageSrc(i.imageUrl)))).filter((s): s is string => !!s) : [];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#faf7f4", color: "#1a1a1a" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, width: 560 }}>
          <div style={{ display: "flex", fontSize: 28, color: "#b4475a", fontWeight: 700 }}>{site.name}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
            {creator && <div style={{ display: "flex", fontSize: 30, color: "#6b6560" }}>por {creator}</div>}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#6b6560" }}>
            {data ? `${data.items.length} peças · toque para ver o look` : "Monte e compartilhe looks"}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: 640, height: 630, gap: 6, padding: 6, background: "#e7e1db" }}>
          {images.map((src, i) => (
            <img key={i} src={src} width={311} height={306} style={{ objectFit: "cover", borderRadius: 8 }} alt="" />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
