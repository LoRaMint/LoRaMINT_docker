# Rechtstexte

Die Quellfassungen von Impressum und Datenschutzerklärung, als Markdown in dem
Dialekt, den `packages/api/lib/markdown.ts` versteht: Überschriften mit `##`,
Listen mit `-`, `**fett**`, `*kursiv*`, `[Text](Ziel)`, `---`. **Keine Tabellen**
— die kann der Renderer nicht.

## Wohin sie gehören

Die Anwendung liest sie **aus der Datenbank**, nicht aus einer Datei und nicht
aus der Umgebung. Eingetragen werden sie unter Verwaltung → Konfiguration →
Rechtsseiten.

Diese Dateien sind also nicht die laufende Fassung, sondern die versionierte
Quelle: sie belegen, welcher Wortlaut wann galt. Wer den Text über die
Oberfläche ändert, sollte ihn hier nachziehen, sonst laufen beide auseinander.

## Einzeilige Fassung für eine .env

`matthias_1_7.env` führt dieselben Texte als eine Zeile mit literalem `\n`.
Umwandeln:

    python3 -c "import sys;print(open(sys.argv[1]).read().rstrip().replace(chr(10),'\\\\n'))" rechtstexte/datenschutz.md

## Stand

Datenschutzerklärung: 9. August 2026. Gegen den Code geprüft — jede genannte
Speicherdauer, jedes Cookie und jedes Datenfeld ist beim Schreiben nachgesehen
worden.

**Beides ist nicht juristisch geprüft.** Vor dem öffentlichen Betrieb gegenlesen
lassen. Offene Punkte in der Datenschutzerklärung: die zuständige
Aufsichtsbehörde hängt daran, wer Verantwortlicher ist; der Abschnitt zu The
Things Network gilt nur bei eingerichteter Geräteverwaltung; „transportver-
schlüsselt" setzt ein gültiges Zertifikat voraus.
