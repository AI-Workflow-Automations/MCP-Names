# namelex

Aufbau eines Nachnamen-Lexikons für Deutschland aus offenen Quellen, als
Datengrundlage für lexikalische Ähnlichkeit und Namens-Wahrscheinlichkeit im
MCP-Server.

Ergebnis ist eine SQLite-Datei mit rund 100.000 bis 200.000 Nachnamen (je nach
aktivierten Quellen), Häufigkeits-Prior, phonetischen Blocking-Keys und echten
Schreibvarianten.

## Quellen und Lizenzen

| Quelle | Lizenz | Beitrag | Anmerkung |
|---|---|---|---|
| Wikidata | CC0 1.0 | Lexikon (Recall) + Häufigkeit aus Personendaten | via SPARQL, keyset-paginiert |
| GND (DNB) | CC0 1.0 | Häufigkeit + Schreibvarianten | Bulk-Dump, siehe unten |
| Onomaverse | CC BY 4.0 | Rang-Anker für die häufigsten Namen | nur ca. 390 DE-Namen |
| beliebige Wortlisten | je nach Liste | reiner Recall | jede `.txt` im Datenverzeichnis |

Attribution für Onomaverse ist Pflicht und steht in der `meta`-Tabelle der
gebauten Datenbank:
"Names data from Onomaverse (https://onomaverse.com/datasets), licensed CC BY 4.0."

## Ablauf

```bash
pip install -e .

# 1. Quellen holen
namelex fetch --sources onomaverse wikidata

# GND separat: Dump von https://data.dnb.de/GND/ laden (mehrere GB),
# der Dateiname aendert sich mit jedem Release
namelex fetch --sources gnd --gnd-dump /pfad/authorities-person.nt.gz

# 2. Datenbank bauen
namelex build

# 3. Struktur pruefen
namelex verify

# 4. Aehnlichkeitsschwelle aus den GND-Varianten ableiten
namelex calibrate

# 5. Abfragen
namelex query "Schmit"
```

Für einen schnellen Rauchtest ohne den vollen Wikidata-Durchlauf:
`namelex fetch --sources wikidata --max-pages 3`.

## Was die Datenbank enthält

`surname`
: Anzeigeform, Vergleichsform (`norm`), Skelett-Key, Kölner-Phonetik-Code,
  Herkunfts-Präfix, Quell-Counts, `prob` (Wahrscheinlichkeit), `plausibility`
  (wie namensartig der String ist), `rank_de`.

`variant`
: Schreibvarianten aus GND-Verweisformen und Wikidata-Aliasen. Das ist
  gleichzeitig das Gold-Set für `namelex calibrate`.

`ngram`
: Zeichen-n-Gramm-Modell über das Lexikon. Damit bekommen auch Namen ohne
  jede Häufigkeit einen sinnvollen Score - wichtig, weil ein erheblicher Teil
  der Nachnamen in Deutschland nicht deutschen Ursprungs ist.

## Wie die Wahrscheinlichkeit zustande kommt

Es gibt in Deutschland keine amtliche Nachnamen-Statistik. Der Prior ist
deshalb eine Mischung:

- Onomaverse verankert den Kopf der Verteilung mit einer festen Zielmasse
  (`build.HEAD_MASS`, Standard 0,25), weil die häufigsten rund 400 Nachnamen
  real etwa ein Viertel der Bevölkerung abdecken.
- Wikidata-Personen und GND liefern den Rumpf, gewichtet nach `DEFAULT_WEIGHTS`.
- Jede Quelle wird an ihrer Evidenzmenge skaliert (`MIN_OBSERVATIONS`). Eine
  Quelle, deren Download abgebrochen ist, verzerrt damit nicht die ganze
  Tabelle, sondern gibt ihre Masse an das n-Gramm-Modell ab.
- Der Rest (`UNKNOWN_MASS`) verteilt sich über das n-Gramm-Modell auf alle
  Namen ohne Häufigkeit.

`namelex verify` prüft das Ergebnis gegen Größenordnungen aus veröffentlichten
Telefonbuch-Auswertungen. Erwartet werden: Masse exakt 1,0, keine doppelten
Normalformen, Rangkorrelation über 0,8, `top400_mass` um 0,25 und
`observed_over_expected` nahe 1,0.

## Ähnlichkeit

Blocking über drei Keys (Normalform, Skelett, Kölner Phonetik), dann
gewichtete Damerau-Levenshtein-Distanz plus Jaro-Winkler. Die
Substitutionskosten berücksichtigen QWERTZ-Nachbarschaft und typische
deutsche Verwechslungspaare (i/y, c/k, d/t, f/v, s/z).

`match()` gibt alle Kandidaten oberhalb eines weichen Floors zurück und
markiert sie mit `confident`, statt sie zu verwerfen. Der MCP-Server bekommt
damit auch die knappen Fälle zu sehen und kann selbst entscheiden.

## Grenzen, die man kennen sollte

- Onomaverse hat für Deutschland nur 393 Namen, und die Reihenfolge ist
  erkennbar verrauscht ("Bruder" auf Platz 6 ist nicht plausibel). Nur als
  Rang-Anker verwenden.
- `pct_in_country` bei Onomaverse ist der Anteil innerhalb des Datensatzes,
  nicht innerhalb der Bevölkerung. Wird hier renormiert.
- Die GND ist bibliographisch und historisch verzerrt.
- Wikidata-Personen sind prominenz-verzerrt.
- Nicht verwendet: `philipperemy/name-dataset`. Technisch passend, aber die
  Daten stammen aus dem Facebook-Leak von 2021. Für ein Produkt im
  Kundenkontext nicht tragbar.
- Nicht verwendet: DFD / namenforschung.net. Keine offene Lizenz, kein
  Bulk-Zugang, Datenbankherstellerrecht nach Paragraph 87a UrhG.

## Tests

```bash
python -m pytest tests -q
```

Abgedeckt sind Normalisierung, Kölner Phonetik gegen die kanonischen
Referenzwerte, der GND-Parser, die Wikidata-Paginierung inklusive des
Randfalls am Seitenübergang, sowie Build und Abfrage.
