# Redmine

Die Tickets deines [Redmine](https://www.redmine.org) in Gladys: wie viele offen
sind, dir zugewiesen, überfällig, heute fällig, heute aktualisiert. Eine Szene
reagiert auf ein neues Ticket, auf ein dir zugewiesenes Ticket, auf ein Ticket,
das überfällig wird, oder auf ein geschlossenes Ticket, und Gladys kann **selbst
ein Ticket erstellen**, wenn es etwas zu tun erkennt: ein Wasserleck, einen zu
wechselnden Filter, einen Drucker, der nicht mehr antwortet.

> **Feedback welcome – Rückmeldungen willkommen.** Diese Integration wurde gegen
> ein echtes Redmine getestet (das offizielle Docker-Image `redmine` 6.1, Oktober
> 2026), aber noch nicht im Alltag auf einem echten Tracker. Wenn etwas nicht wie
> beschrieben funktioniert, sag es im [Gladys-Forum](https://community.gladysassistant.com)
> oder in den [Issues](https://github.com/guim31/gladys-redmine/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- **Redmine 4.2 oder neuer**, selbst gehostet oder gehostet (Planio, ein eigener
  Server im Internet), von Gladys aus erreichbar.
- Einen **Redmine-Benutzer**, in dessen Namen Gladys die Tickets liest und
  erstellt: deinen oder einen eigens angelegten (`gladys`), Mitglied der zu
  verfolgenden Projekte mit einer Rolle, die Tickets sehen, anlegen und Notizen
  hinzufügen darf (die Standardrolle **Entwickler** darf das). Die Integration
  sieht genau das, was dieser Benutzer in Redmine sieht.

## Installation

### In Redmine

1. **Administration** → **Konfiguration** → Reiter **API**: Aktiviere
   **REST-Schnittstelle aktivieren** und speichere.
2. Melde dich als Benutzer von Gladys an, öffne **Mein Konto** und klicke in der
   rechten Spalte unter **API-Zugriffsschlüssel** auf **Anzeigen**: Kopiere den
   Schlüssel.

### In Gladys

1. **Integrationen** → installiere **Redmine**.
2. Fülle im Bildschirm **Konfiguration** aus:
   - **Adresse**: die Adresse von Redmine wie im Browser, z. B.
     `https://redmine.example.org` oder `http://192.168.1.30:3000` (ein Ordner
     `/redmine` bleibt, `/issues/…` oder `/projects/…` werden entfernt);
   - **API-Schlüssel**: der in Schritt 2 kopierte Schlüssel;
   - **Projekte mit eigenem Gerät** (optional): Kennungen oder Namen von
     Projekten, durch Kommas getrennt, z. B. `haus, buero` (höchstens 10);
   - **Selbstsignierte Zertifikate akzeptieren**: für ein Redmine unter
     `https://` mit selbstsigniertem Zertifikat;
   - **Aktualisierungsintervall**: 1, 2, 5 (Standard) oder 10 Minuten;
   - **Sprache der Funktionsnamen**: die Sprache der Namen der Funktionen der
     Geräte.
3. **Verbindung testen** nennt den Benutzer und die Zahl der offenen, ihm
   zugewiesenen und überfälligen Tickets, sowie die nicht gefundenen Projekte.
4. Reiter **Entdecken**: Füge das Gerät **Redmine** hinzu, und das Gerät jedes
   verfolgten Projekts (zum Beispiel **Redmine Haus**).

## Geräte

Ein Gerät **Redmine** für alle Tickets, die der Benutzer sieht, und ein Gerät pro
verfolgtem Projekt, mit fünf Zählern, die bei jedem Lesen aktualisiert werden:

| Funktion                    | Was sie zählt                                                              |
| --------------------------- | -------------------------------------------------------------------------- |
| Offene Tickets              | Tickets, deren Status nicht geschlossen ist                                |
| Mir zugewiesene Tickets     | offene Tickets, die dem Benutzer oder einer seiner Gruppen zugewiesen sind |
| Überfällige Tickets         | offene Tickets, deren Fälligkeit vor heute liegt                           |
| Heute fällige Tickets       | offene Tickets, die heute fällig sind                                      |
| Heute aktualisierte Tickets | seit Mitternacht geänderte Tickets, offen oder geschlossen                 |

„Heute“ ist der Tag in der Zeitzone von Gladys. Ein Ticket ohne Fälligkeit ist nie
überfällig. Die Zähler behalten ihren Verlauf und dienen als Bedingungen in
Szenen („wenn Überfällige Tickets größer als 0 ist“). Ein Projektgerät zählt nur
die Tickets dieses Projekts, nicht die seiner Unterprojekte.

## Dashboard

Das Widget **Meine Redmine-Tickets** zeigt drei Kacheln (mir zugewiesen,
überfällig, heute fällig) und die acht dringendsten offenen Tickets des Benutzers:
zuerst die überfälligen (rotes Abzeichen „Überfällig“), dann die heute fälligen
(oranges Abzeichen „Heute“), dann nach Fälligkeit. Jede Zeile nennt Projekt,
Status und Priorität. Ist Redmine unter `https://` erreichbar, bietet jedes Ticket
einen Link **In Redmine öffnen**.

## Szenen

### Auslöser

Die vier Auslöser filtern nach **Projektname**, **Tracker** und **Priorität**,
geschrieben wie in Redmine (mit Großbuchstaben; leer: beliebig).

- **Neues Redmine-Ticket**: Ein Ticket wurde in Redmine erstellt, von einem
  Benutzer, per E-Mail oder von einem anderen Werkzeug. Von Gladys selbst
  erstellte Tickets lösen nichts aus (keine Schleife).
- **Redmine-Ticket mir zugewiesen**: Ein offenes Ticket ist jetzt dem Benutzer
  des Schlüssels (oder einer seiner Gruppen) zugewiesen: so erstellt oder neu
  zugewiesen.
- **Redmine-Ticket überfällig**: Ein offenes Ticket hat gerade seine Fälligkeit
  überschritten. Bei jedem Lesen geprüft: Das erste Lesen nach Mitternacht löst
  ihn für die am Vortag fälligen Tickets aus.
- **Redmine-Ticket geschlossen**: Ein beim vorigen Lesen offenes Ticket hat jetzt
  einen geschlossenen Status (Erledigt, Abgewiesen …).

An die Aktionen übergebene Variablen: Ticketnummer, Betreff, Projekt, Tracker,
Status, Priorität, Autor, zugewiesen an, Fälligkeit und Link zum Ticket. Die Namen
sind die, die Redmine in seiner Sprache anzeigt.

Die Ereignisse werden bei jedem Lesen erkannt und kommen höchstens ein
Aktualisierungsintervall nach den Tatsachen an. Beim allerersten Lesen (oder nach
einem Wechsel von Server oder Benutzer) nimmt die Integration den Bestand zur
Kenntnis, ohne etwas auszulösen. Ein Lesen löst höchstens 30 Ereignisse aus (ein
Massenimport überflutet Gladys nicht).

### Aktionen

- **Redmine-Ticket erstellen**: erstellt ein Ticket im Namen des Benutzers des
  Schlüssels, der sein Autor ist. Felder: **Projekt** (Kennung, Name oder Nummer,
  Pflicht), **Betreff** (Pflicht), **Beschreibung** (optional; Szenenvariablen
  sind willkommen), **Priorität** (Name, leer: die Standardpriorität), **Tracker**
  (Name, leer: der erste des Projekts) und **Mir zuweisen**. Ausgaben: die
  Ticketnummer und ihr Link.
- **Notiz zu einem Redmine-Ticket hinzufügen**: fügt dem durch seine Nummer
  (`125` oder `#125`) angegebenen Ticket eine Notiz im Namen des Benutzers des
  Schlüssels hinzu. Die Nummer kann von einem „Redmine-Ticket erstellen“ weiter
  oben in der Szene oder vom Auslöser kommen. Ausgaben: Nummer und Betreff des
  Tickets.

Ein Projekt, eine Priorität oder ein Tracker wird über Nummer oder Namen
angegeben, ohne Rücksicht auf Groß- und Kleinschreibung oder Akzente; ein Projekt
auch über seine Kennung (`haus`).

### Szenenideen

- **Wasserleck**: Der Wassermelder im Keller meldet ein Leck → **Redmine-Ticket
  erstellen** „Wasserleck im Keller“ im Projekt `haus`, Priorität Dringend, mir
  zugewiesen, Beschreibung mit der Uhrzeit; dann eine Gladys-Nachricht mit dem
  Link zum Ticket.
- **Morgenrunde**: An jedem Wochentag um 8:00 Uhr, wenn **Heute fällige Tickets**
  des Geräts Redmine größer als 0 ist, sagt Gladys, wie viele Tickets heute fällig
  sind.
- **Bereitschaft**: **Neues Redmine-Ticket** gefiltert auf die Priorität Sofort →
  eine Telegram-Nachricht mit Betreff, Autor und Link; **Redmine-Ticket
  überfällig** → die Bürolampe wird rot; **Redmine-Ticket geschlossen** → zurück
  zu Weiß.

## Fehlerbehebung

- **„keine Redmine-API unter dieser Adresse“**: Prüfe die Adresse (mit dem Ordner
  `/redmine`, falls vorhanden), indem du `…/issues.json` im Browser öffnest:
  Redmine antwortet in JSON.
- **„die REST-API ist aus“**: siehe Schritt 1 in Redmine. Bei ausgeschalteter API
  ignoriert Redmine den Schlüssel und würde nur die öffentlichen Projekte zeigen:
  Die Integration prüft das zuerst.
- **„API-Schlüssel abgelehnt“**: Der Schlüssel wurde inzwischen zurückgesetzt
  (Mein Konto, Zurücksetzen), oder der Benutzer ist gesperrt.
- **„dem Redmine-Benutzer fehlt eine Berechtigung in diesem Projekt“**: Seine
  Rolle im Projekt darf keine Tickets anlegen oder keine Notizen hinzufügen.
- **„Projekte nicht gefunden“** (Verbindung testen): Der Benutzer ist kein
  Mitglied des Projekts, oder die Kennung ist falsch geschrieben.
- **Die Zähler bleiben bei null**: Der Benutzer ist Mitglied keines Projekts, oder
  seine Rolle darf die Tickets nicht sehen.

## Einschränkungen

- Ein Redmine pro Installation, höchstens 10 verfolgte Projekte.
- Die 1.000 neuesten offenen Tickets werden im Detail gelesen (überfällig, heute
  fällig, Projektgeräte); darüber hinaus bleiben die Zähler „Offene Tickets“ und
  „Mir zugewiesene Tickets“ genau.
- Ein Unterprojekt wird nicht im Gerät seines Elternprojekts gezählt: Verfolge es
  als Projekt.
- Ein zwischen zwei Lesevorgängen erstelltes und geschlossenes Ticket löst „Neues
  Redmine-Ticket“ aus, aber nicht „geschlossen“.
- Benutzerdefinierte Felder, Zeiterfassung und Versionen werden nicht gelesen.

Diese Integration ist nicht mit Redmine oder seinen Autoren verbunden.
