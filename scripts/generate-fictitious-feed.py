#!/usr/bin/env python3
"""Gera o feed XML FICTÍCIO (formato Google Merchant) e as imagens ilustrativas em SVG.
Uso: python3 scripts/generate-fictitious-feed.py
Nada aqui representa produtos reais de qualquer marca."""
import html, pathlib, unicodedata, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOMAIN = "https://loja-ficticia.example"

def slug(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

# (título, categoria, cor-nome, cor-hex, preço, preço promocional, tamanhos, esgotados, forma)
P = [
    ("Vestido Midi Floral", "Vestidos", "Rosa", "#d98ba0", "259.90", None, "PP P M G", "PP", "dress"),
    ("Vestido Longo Linho", "Vestidos", "Areia", "#d8c3a5", "329.90", "279.90", "P M G", "", "dress"),
    ("Vestido Curto Tricô", "Vestidos", "Preto", "#2b2b2b", "199.90", None, "P M G GG", "", "dress"),
    ("Blusa Seda Decote V", "Blusas", "Off-white", "#f1ebe1", "149.90", None, "P M G", "", "top"),
    ("Camisa Oversized Listrada", "Blusas", "Azul", "#7da2c9", "179.90", "139.90", "P M G", "", "top"),
    ("Regata Canelada", "Blusas", "Verde", "#7f9c84", "79.90", None, "PP P M G", "", "top"),
    ("Cropped Ombro a Ombro", "Blusas", "Terracota", "#c46a4a", "99.90", None, "P M", "P M", "top"),
    ("Calça Pantalona Alfaiataria", "Calças", "Caramelo", "#b07a4f", "289.90", None, "36 38 40 42 44", "", "pants"),
    ("Calça Jeans Reta", "Calças", "Jeans", "#4f6d8f", "239.90", "199.90", "36 38 40 42", "", "pants"),
    ("Calça Wide Leg Linho", "Calças", "Branco", "#efefe9", "259.90", None, "36 38 40", "", "pants"),
    ("Saia Midi Plissada", "Saias", "Lilás", "#b9a3c9", "189.90", None, "P M G", "", "skirt"),
    ("Saia Jeans Curta", "Saias", "Jeans claro", "#8fb0cf", "159.90", None, "36 38 40", "", "skirt"),
    ("Short Alfaiataria", "Shorts", "Bege", "#cdb797", "149.90", None, "36 38 40 42", "", "shorts"),
    ("Macacão Pantacourt", "Macacões", "Verde oliva", "#6b7048", "319.90", "269.90", "P M G", "", "dress"),
    ("Jaqueta Jeans Cropped", "Jaquetas", "Jeans", "#4f6d8f", "279.90", None, "P M G", "", "jacket"),
    ("Blazer Linho Estruturado", "Jaquetas", "Off-white", "#f1ebe1", "399.90", None, "P M G", "", "jacket"),
    ("Bolsa Tiracolo Couro", "Bolsas", "Caramelo", "#b07a4f", "349.90", None, "", "", "bag"),
    ("Bolsa de Palha", "Bolsas", "Natural", "#d8c08a", "189.90", "149.90", "", "", "bag"),
    ("Sandália Tiras Finas", "Calçados", "Nude", "#d9b8a0", "219.90", None, "34 35 36 37 38 39", "34", "shoe"),
    ("Tênis Branco Couro", "Calçados", "Branco", "#efefe9", "299.90", None, "34 35 36 37 38 39", "", "shoe"),
    ("Mule Bico Quadrado", "Calçados", "Preto", "#2b2b2b", "249.90", None, "35 36 37 38", "", "shoe"),
    ("Óculos de Sol Gatinho", "Acessórios", "Tartaruga", "#7a5232", "189.90", None, "", "", "glasses"),
    ("Brinco Argola Dourada", "Acessórios", "Dourado", "#c9a64b", "89.90", None, "", "", "ring"),
    ("Lenço de Seda Estampado", "Acessórios", "Estampado", "#c46a4a", "119.90", None, "", "", "scarf"),
]

SHAPES = {
    "dress": '<path d="M250 170 L350 170 L370 260 L450 640 L150 640 L230 260 Z"/>',
    "top": '<path d="M200 220 L260 190 L340 190 L400 220 L450 320 L400 340 L390 560 L210 560 L200 340 L150 320 Z"/>',
    "pants": '<path d="M210 180 L390 180 L420 660 L320 660 L300 330 L280 660 L180 660 Z"/>',
    "skirt": '<path d="M230 220 L370 220 L440 600 L160 600 Z"/>',
    "shorts": '<path d="M200 240 L400 240 L430 480 L320 480 L300 380 L280 480 L170 480 Z"/>',
    "jacket": '<path d="M210 200 L280 180 L300 260 L320 180 L390 200 L460 330 L410 350 L400 600 L200 600 L190 350 L140 330 Z"/>',
    "bag": '<path d="M220 300 Q300 160 380 300" fill="none" stroke-width="18"/><rect x="170" y="300" width="260" height="260" rx="28"/>',
    "shoe": '<path d="M140 520 Q160 420 260 440 L330 470 Q420 470 460 520 L460 560 L140 560 Z"/>',
    "glasses": '<circle cx="220" cy="400" r="80"/><circle cx="380" cy="400" r="80"/><rect x="290" y="390" width="20" height="14"/>',
    "ring": '<circle cx="300" cy="400" r="130" fill="none" stroke-width="26"/>',
    "scarf": '<path d="M180 220 L420 220 L420 440 L300 600 L180 440 Z"/>',
}

def svg(color, shape, label):
    stroke = "#00000022"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
<rect width="600" height="800" fill="#f4efe9"/>
<g fill="{color}" stroke="{color}" stroke-linejoin="round">{SHAPES[shape]}</g>
<g fill="none" stroke="{stroke}">{SHAPES[shape]}</g>
<text x="300" y="730" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#6b6560">{html.escape(label)}</text>
<text x="300" y="765" text-anchor="middle" font-family="sans-serif" font-size="18" letter-spacing="3" fill="#b4475a">PRODUTO FICTÍCIO</text>
</svg>'''

items = []
for i, (title, cat, color_name, color_hex, price, sale, sizes, sold_out, shape) in enumerate(P, start=1):
    s = slug(title)
    img = f"/ficticio/{s}.svg"
    (ROOT / "public" / "ficticio" / f"{s}.svg").write_text(svg(color_hex, shape, title), encoding="utf-8")
    group = f"FIC-{i:03d}"
    variants = sizes.split() or [None]
    for size in variants:
        sku = f"{group}-{size}" if size else group
        avail = "out of stock" if size and size in sold_out.split() else "in stock"
        t = f"{title} - {size}" if size else title
        sale_tag = f"\n      <g:sale_price>{sale} BRL</g:sale_price>" if sale else ""
        size_tag = f"\n      <g:size>{size}</g:size>" if size else ""
        items.append(f'''    <item>
      <g:id>{sku}</g:id>
      <g:item_group_id>{group}</g:item_group_id>
      <title>{html.escape(t)}</title>
      <description>Produto FICTÍCIO para testes e demonstração. {html.escape(title)} na cor {html.escape(color_name.lower())}.</description>
      <link>{DOMAIN}/{s}/p?sku={sku}</link>
      <g:image_link>{img}</g:image_link>
      <g:price>{price} BRL</g:price>{sale_tag}
      <g:availability>{avail}</g:availability>
      <g:product_type>Feminino &gt; {html.escape(cat)}</g:product_type>
      <g:brand>Marca Fictícia</g:brand>
      <g:color>{html.escape(color_name)}</g:color>{size_tag}
      <g:gender>female</g:gender>
      <g:condition>new</g:condition>
    </item>''')

feed = f'''<?xml version="1.0" encoding="UTF-8"?>
<!-- FEED FICTÍCIO gerado por scripts/generate-fictitious-feed.py. Não representa nenhuma marca real. -->
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Marca Fictícia (dados de teste)</title>
    <link>{DOMAIN}</link>
    <description>Catálogo fictício para desenvolvimento</description>
{chr(10).join(items)}
  </channel>
</rss>
'''
(ROOT / "db" / "fixtures" / "feed-ficticio.xml").write_text(feed, encoding="utf-8")
print(f"{len(P)} produtos, {len(items)} SKUs")
