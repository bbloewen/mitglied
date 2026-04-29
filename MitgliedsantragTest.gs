// ============================================================
// DIAGNOSE: Debitor-Anlage für Frau Herbig isoliert testen
// ============================================================
// Aufruf:
//   1. Im Apps-Script-Editor diese Funktion auswählen
//   2. ▶ Ausführen
//   3. Reiter "Ausführungsprotokoll" öffnen → kompletten Log kopieren
//
// Voraussetzung: IBAN unten eintragen (steht in der Eingangsmail
// an mitgliederverwaltung@basketball-loewen.com — Frau Herbigs
// Antrag, Feld "IBAN").
//
// Was passiert: Es wird KEIN neuer Kontakt angelegt — die Funktion
// ruft nur createDebitor() für die existierende Contact-ID
// 69f06ee68c52248dfc4515c6 (Frau Herbig) auf. Wenn der Test grün
// wird, ist ihr Debitor live — Antrag damit komplett.
// Wenn nicht, sehen wir HTTP-Code + API-Antwort im Log.
//
// Diese Datei ist eine Diagnose-Hilfe und kann nach erfolgreicher
// Analyse wieder entfernt werden.
// ============================================================
function testCreateDebitorHerbig() {
  const cfg = getCFG();
  const contactId = '69f06ee68c52248dfc4515c6';  // Frau Herbig (aus Fehlermail)

  const d = {
    vorname:      'Janneke Susann',
    nachname:     'Herbig',
    email:        'susanne.herbig@posteo.de',
    iban:         'DE__BITTE_ECHTE_IBAN_HIER_EINTRAGEN__',
    kontoinhaber: 'Janneke Susann Herbig',  // ggf. anpassen falls abweichend
    strasse:      '',   // optional, aus Antrag — wenn leer, schickt createDebitor "-"
    plz:          '',
    ort:          '',
    geburtsdatum: '',   // YYYY-MM-DD, optional
  };

  if (d.iban.indexOf('BITTE_ECHTE_IBAN') >= 0) {
    Logger.log('❌ Bitte erst d.iban mit der echten IBAN aus dem Antrag ersetzen, dann erneut ausführen.');
    return;
  }

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ TEST: createDebitor für Frau Herbig');
  Logger.log('  contactId: ' + contactId);
  Logger.log('  cfg.orgId: ' + cfg.orgId);
  Logger.log('  cfg.mandantenId: ' + cfg.mandantenId);
  Logger.log('  cfg.finApiKey gesetzt? ' + (!!cfg.finApiKey));
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const ok = createDebitor(contactId, d, cfg);

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log(ok ? '✅ Test erfolgreich — Debitor wurde angelegt' : '❌ Test fehlgeschlagen — siehe API-Antwort oben');
}
