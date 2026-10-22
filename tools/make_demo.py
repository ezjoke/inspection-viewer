#!/usr/bin/env python3
"""Generate demo/demo-site.inspection.json: a fictional house, no real data.

    python3 tools/make_demo.py

Everything here is invented: the lot, the dimensions, the findings.
"""

import base64
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "demo" / "demo-site.inspection.json"

PLAN_W, PLAN_H = 800, 600

PLAN_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{PLAN_W}" height="{PLAN_H}" viewBox="0 0 {PLAN_W} {PLAN_H}">
<rect width="{PLAN_W}" height="{PLAN_H}" fill="#fafaf5"/>
<rect x="20" y="20" width="760" height="560" fill="#eef5e6" stroke="#333" stroke-width="3"/>
<rect x="30" y="30" width="170" height="250" fill="#ddd" stroke="#666"/>
<text x="115" y="150" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#444">Entrée</text>
<text x="115" y="172" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#444">(gravier)</text>
<rect x="260" y="200" width="250" height="260" fill="#f4e3c8" stroke="#333" stroke-width="3"/>
<text x="385" y="320" font-family="sans-serif" font-size="26" text-anchor="middle" fill="#333">Maison</text>
<text x="385" y="346" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#555">exemple fictif</text>
<rect x="520" y="250" width="150" height="150" fill="#e0d2bd" stroke="#555"/>
<text x="595" y="330" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#444">Terrasse</text>
<rect x="600" y="50" width="150" height="110" fill="#ccc" stroke="#555"/>
<text x="675" y="110" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#444">Cabanon</text>
<rect x="260" y="470" width="410" height="14" fill="#9bc17c" stroke="#5a8a3c"/>
<text x="465" y="510" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#444">Haie</text>
</svg>"""


def item(id_, zone, article, color, status, urgency, trade, cost, bullets, page, exterior=False):
    raw = "\n".join(("  • " if lvl else "• ") + txt for txt, lvl in bullets)
    return {
        "id": id_,
        "zone": zone,
        "article": article,
        "colorKey": color,
        "status": status,
        "urgency": urgency,
        "trade": trade,
        "costEstimate": cost,
        "rawObservation": raw,
        "page": page,
        "isExterior": exterior,
    }


ITEMS = [
    item("toiture__bardeaux", "Toiture", "Revêtement en bardeaux", "orange", "À corriger — préventif", "1 à 3 ans",
         "Couvreur", "800 $ – 2 000 $", [("Bardeaux usés près du faîte", 0), ("Remplacer les bardeaux soulevés", 1)], 5, True),
    item("toiture__gouttieres", "Toiture", "Gouttières", "rouge", "À corriger — prioritaire", "Immédiat",
         "Couvreur", "300 $ – 700 $", [("Gouttière affaissée côté nord", 0), ("Risque d’infiltration à la fondation", 1)], 6, True),
    item("exterieur__terrasse", "Extérieur", "Terrasse", "orange", "À corriger — préventif", "1 à 3 ans",
         "Menuisier", "500 $ – 1 500 $", [("Planches fendillées", 0), ("Garde-corps à resserrer", 0)], 7, True),
    item("exterieur__entree", "Extérieur", "Entrée de stationnement", "vert", "Conforme", "—",
         "—", "—", [("Gravier en bon état", 0)], 7, True),
    item("exterieur__cabanon", "Extérieur", "Cabanon", "vert", "Conforme", "—",
         "—", "—", [("Aucune déficience observable", 0)], 8, True),
    item("fondation__murs", "Sous-sol", "Murs de fondation", "orange", "À corriger — préventif", "1 à 3 ans",
         "Expert en fondations", "1 000 $ – 3 000 $", [("Fissure verticale fine, à surveiller", 0)], 10),
    item("fondation__drain", "Sous-sol", "Drain de plancher", "bleu", "Requis — non inspecté", "À vérifier",
         "Plombier", "200 $ – 500 $", [("Accès obstrué lors de la visite", 0), ("Faire inspecter par caméra", 1)], 11),
    item("plomberie__chauffe-eau", "Plomberie", "Chauffe-eau", "orange", "À corriger — préventif", "1 à 3 ans",
         "Plombier", "1 200 $ – 2 000 $", [("Appareil en fin de vie utile", 0)], 14),
    item("plomberie__cuisine", "Plomberie", "Évier de cuisine", "vert", "Conforme", "—",
         "—", "—", [("Débit normal, aucune fuite", 0)], 14),
    item("plomberie__salle-de-bain", "Plomberie", "Salle de bain", "orange", "À corriger — préventif", "1 à 3 ans",
         "Plombier", "150 $ – 400 $", [("Joint de baignoire à refaire", 0)], 15),
    item("electricite__panneau", "Électricité", "Panneau de distribution", "violet", "Non conforme BNQ", "À planifier",
         "Électricien", "500 $ – 1 200 $", [("Disjoncteur double mal identifié", 0)], 18),
    item("electricite__prises", "Électricité", "Prises intérieures", "vert", "Conforme", "—",
         "—", "—", [("Polarité correcte", 0)], 19),
    item("chauffage__fournaise", "Chauffage", "Fournaise", "orange", "À corriger — préventif", "Entretien annuel",
         "Technicien en chauffage", "150 $ – 300 $", [("Filtre encrassé", 0), ("Entretien annuel recommandé", 0)], 22),
    item("isolation__comble", "Isolation", "Isolation du comble", "orange", "À corriger — préventif", "1 à 3 ans",
         "Isolation", "1 000 $ – 2 500 $", [("Épaisseur inférieure à la valeur recommandée", 0)], 24),
    item("interieur__fenetres", "Intérieur", "Fenêtres", "rouge", "À corriger — prioritaire", "Immédiat",
         "Vitrier", "400 $ – 900 $", [("Fenêtre de la chambre ne se verrouille pas", 0)], 26),
    item("interieur__avertisseurs", "Intérieur", "Avertisseurs de fumée", "inconnu", "Information", "—",
         "—", "—", [("Appareils présents; vérifier la date de fabrication", 0)], 27),
]

LEGEND = [
    ("Rouge", "rouge", "Déficience à corriger sans tarder", "Immédiat", "À corriger — prioritaire"),
    ("Violet", "violet", "Non conforme à une norme", "À planifier", "Non conforme BNQ"),
    ("Bleu", "bleu", "Requis, non inspecté", "À vérifier", "Requis — non inspecté"),
    ("Orange", "orange", "Entretien préventif", "1 à 3 ans", "À corriger — préventif"),
    ("Vert", "vert", "Aucune déficience observable", "—", "Conforme"),
    ("Sans symbole", "inconnu", "Information", "—", "Information"),
]


def main():
    counts = {}
    for it in ITEMS:
        counts[it["colorKey"]] = counts.get(it["colorKey"], 0) + 1

    legend = {
        "entries": [
            {"symbol": sym, "colorKey": key, "description": desc, "urgency": urg, "status": stat,
             "baseCost": "—", "count": counts.get(key, 0)}
            for sym, key, desc, urg, stat in LEGEND
        ],
        "totalArticles": len(ITEMS),
    }

    levels = [
        {"id": "rdc", "name": "Rez-de-chaussée", "footprint": {"width": 8, "height": 10}, "rooms": [
            {"id": "salon", "name": "Salon", "x": 0.4, "y": 0.4, "w": 4, "h": 4.2,
             "itemIds": ["electricite__prises", "interieur__fenetres", "interieur__avertisseurs"]},
            {"id": "cuisine", "name": "Cuisine", "x": 4.6, "y": 0.4, "w": 3, "h": 4.2,
             "itemIds": ["plomberie__cuisine"]},
            {"id": "sdb", "name": "Salle de bain", "x": 4.6, "y": 4.8, "w": 3, "h": 2.6,
             "itemIds": ["plomberie__salle-de-bain"]},
            {"id": "chambre", "name": "Chambre", "x": 0.4, "y": 4.8, "w": 4, "h": 4.8, "itemIds": []},
        ]},
        {"id": "sous-sol", "name": "Sous-sol", "footprint": {"width": 8, "height": 10}, "rooms": [
            {"id": "mecanique", "name": "Salle mécanique", "x": 0.4, "y": 0.4, "w": 3.6, "h": 3.6,
             "itemIds": ["chauffage__fournaise", "plomberie__chauffe-eau", "electricite__panneau"]},
            {"id": "fondation", "name": "Aire ouverte", "x": 4.2, "y": 0.4, "w": 3.4, "h": 6,
             "itemIds": ["fondation__murs", "fondation__drain"]},
        ]},
        {"id": "comble", "name": "Comble", "footprint": {"width": 8, "height": 10}, "rooms": [
            {"id": "entretoit", "name": "Entretoit", "x": 0.5, "y": 0.5, "w": 7, "h": 9,
             "itemIds": ["isolation__comble"]},
        ]},
    ]

    hotspots = [
        {"id": "spot-maison", "name": "Bâtiment principal", "x": 260, "y": 200, "w": 250, "h": 260,
         "itemIds": ["toiture__bardeaux", "toiture__gouttieres"]},
        {"id": "spot-terrasse", "name": "Terrasse", "x": 520, "y": 250, "w": 150, "h": 150,
         "itemIds": ["exterieur__terrasse"]},
        {"id": "spot-entree", "name": "Entrée de stationnement", "x": 30, "y": 30, "w": 170, "h": 250,
         "itemIds": ["exterieur__entree"]},
        {"id": "spot-cabanon", "name": "Cabanon", "x": 600, "y": 50, "w": 150, "h": 110,
         "itemIds": ["exterieur__cabanon"]},
    ]

    pkg = {
        "schema": 1,
        "site": {"name": "Maison exemple (fictive)"},
        "items": ITEMS,
        "adminItems": [{
            "id": "documents__note", "zone": "Documents", "article": "À propos de cet exemple",
            "colorKey": "inconnu", "status": "Information", "trade": "—", "urgency": "—", "costEstimate": "—",
            "rawObservation": "• Ce site est entièrement fictif.\n• Les coûts et constats sont inventés.",
            "page": 1,
        }],
        "legend": legend,
        "levels": levels,
        "sitePlan": {
            "imageDataUrl": "data:image/svg+xml;base64," + base64.b64encode(PLAN_SVG.encode()).decode(),
            "width": PLAN_W,
            "height": PLAN_H,
            "hotspots": hotspots,
        },
        "userState": {"userProgress": {}, "deletedItemIds": []},
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(pkg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Written {OUT} ({OUT.stat().st_size} bytes): {len(ITEMS)} items")


if __name__ == "__main__":
    main()
