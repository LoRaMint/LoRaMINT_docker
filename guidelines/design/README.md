# Corporate Design

| | |
|---|---|
| **Status** | Verbindlich |
| **Stand** | 2026-09-03 |
| **Geltung** | Alle Medien: Web-Anwendung, Druck, Folien, Workshop-Materialien |

## Was hier liegt

| Datei | Zweck |
|---|---|
| `design-system.md` | Das Regelwerk. 90 nummerierte Regeln, jede begründet. |
| `tokens.json` | Die Werte, maschinenlesbar. **Einzige Quelle.** |
| `pruefung.ts` | Vergleicht das Frontend gegen `tokens.json`. |

## Das Prinzip in einem Satz

> Marke färbt die Oberfläche, Signal färbt Zustände, Daten färben Messwerte —
> und keine Ebene borgt sich Farben aus einer anderen.

## Rangfolge bei Widersprüchen

`tokens.json` → `design-system.md` → alles andere.

Wer einen Wert ändert, ändert ihn in `tokens.json` zuerst und lässt danach die
Prüfung laufen:

```bash
bun guidelines/design/pruefung.ts
```

Sie beendet sich mit 1, sobald etwas abweicht, und taugt damit für CI.

## Warum es die Prüfung gibt

Die Regeln standen eine Weile nur im Text, und geprüft wurde von Hand. Dabei
rutschte eine zweite Schattenstufe durch, weil die Suche nur nach `shadow-lg`
sah und die betroffene Datei `shadow-2xl` benutzte. Eine Regel, die niemand
nachrechnen kann, ist eine Absichtserklärung.

Die Prüfung liest Dateien als Text statt sie zu parsen. Das ist grob, überlebt
aber Formatierungsänderungen. Was sie nicht sehen kann, nennt sie am Ende
selbst — etwa ob Farbe allein eine Information trägt.

## Was nicht hier liegt

Die **Umsetzung für Druck und Folien** — LaTeX-Pakete, Beamer-Theme,
Arbeitsblätter — liegt im FDPi-Projekt unter `ma-fdpi/design/latex/`, zusammen
mit dem visuellen Handbuch und der Entscheidungsgeschichte des Designs.

Verbindlich sind die Regeln hier. Ein Corporate Design, das nur den Bildschirm
kennt, ist keins, deshalb stehen auch die Regeln zu Druck und Satz in
`design-system.md` — nur eben nicht ihre Umsetzung.

Die **Marken-Assets** der Anwendung liegen dort, wo sie ausgeliefert werden:
`packages/api/public/` (Logo in vier Fassungen, Rubik samt `OFL.txt`).
