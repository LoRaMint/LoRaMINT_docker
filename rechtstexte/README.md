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

Impressum: 2. September 2026. Datenschutzerklärung: 2. September 2026.
Beide gegen den Code geprüft — jede genannte Speicherdauer, jedes Cookie und
jedes Datenfeld ist beim Schreiben nachgesehen worden.

**Beides ist nicht juristisch geprüft.** Vor dem öffentlichen Betrieb gegenlesen
lassen.

### Offene Punkte

- **Trägerschaft.** Verantwortlicher ist derzeit Matthias Ruf privat, mit
  Privatanschrift. Sobald das mit dem SFZ geklärt ist, ändern sich Impressum und
  — möglicherweise — die zuständige Aufsichtsbehörde in der
  Datenschutzerklärung.
- **Zweiter Kontaktweg.** § 5 DDG verlangt Angaben für „schnelle elektronische
  Kontaktaufnahme und unmittelbare Kommunikation". Nach EuGH C-298/07 genügt
  E-Mail, wenn ein zweiter zügiger Weg besteht — derzeit gibt es nur die
  E-Mail-Adresse. Telefonnummer oder ein Kontaktformular mit zugesagter
  Antwortzeit würden das schließen.
- **The Things Network.** Der Abschnitt gilt nur bei eingerichteter
  Geräteverwaltung.
- **„Transportverschlüsselt"** setzt ein gültiges Zertifikat voraus.
- **Sitzungsdauer.** Die Erklärung nennt 8 Stunden; das ist der Vorgabewert von
  `SESSION_TTL_HOURS`. Wird er in einer Installation geändert, muss der Text
  nachgezogen werden.

### Was zuletzt geändert wurde

Am 2. September 2026 nachgetragen, weil die Erklärung auf dem Stand vom
9. August stehengeblieben war, während die Anwendung weitergewachsen ist:

- **API-Token** (seit 25. August): Bezeichnung, Streuwert, besitzende Gruppe,
  Ablauf, letzte Verwendung und der Anmeldename der anlegenden, freigebenden und
  bekanntmachenden Person.
- **Öffentliches Dashboard** (seit 18. August): Einträge samt Anmeldename der
  anlegenden Person.
- **Token-Protokoll**: ein Anfüge-Protokoll mit Klarnamen über neun Vorgangsarten
  — es fiel unter keinen der bestehenden Abschnitte.

Im Impressum am selben Tag: `§ 5 TMG` durch `§ 5 DDG` ersetzt (das TMG wurde am
14. Mai 2024 abgelöst), ein aus einem XSS-Test stehengebliebenes
`<script>alert(1)</script>` aus dem Haftungssatz entfernt, die Zeile „Hosting bei
Hetzner" gestrichen (sie steht sachlich richtig in der Datenschutzerklärung
unter *Empfänger*), Haftung für Links und ein Hinweis nach § 36 VSBG ergänzt.
