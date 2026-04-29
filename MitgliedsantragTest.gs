// ============================================================
// DIAGNOSE: Debitor-Anlage isoliert testen
// ============================================================
// testDebitor() legt einen frischen Test-Kontakt
// "Max Mustermann-Test" mit eindeutiger Test-Email an und ruft
// createDebitor() darauf auf. HTTP-Code + API-Antwort gehen ins Log.
//
// Aufruf:
//   1. Apps-Script-Editor → diese Datei
//   2. testDebitor im Dropdown waehlen, ▶ Ausfuehren
//   3. "Ausfuehrungsprotokoll" oeffnen, gesamten Log kopieren
//
// IBAN-Wahl: Frankfurter Sparkasse — eine beliebige formatvalide
// Test-IBAN. createDebitor schickt KEINEN BIC mit; Campai leitet
// ihn aus der IBAN selbst ab.
//
// Aufraeumen: Der Test-Kontakt bleibt in Campai stehen und muss
// manuell geloescht werden. Die Contact-ID steht am Ende des Logs.
// Email-Pattern: test-mustermann-<timestamp>@basketball-loewen.com
// ============================================================

function testDebitor() {
  const cfg = getCFG();

  const testD = {
    vorname:      'Max',
    nachname:     'Mustermann-Test',
    email:        'test-mustermann-' + Date.now() + '@basketball-loewen.com',
    geburtsdatum: '1990-01-01',
    geschlecht:   'malePerson',
    telefon:      '036112345678',
    strasse:      'Teststraße 1',
    plz:          '99084',
    ort:          'Erfurt',
    iban:         'DE02500105170137075030',  // Frankfurter Sparkasse-Test-IBAN
    kontoinhaber: 'Max Mustermann-Test',
  };

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ TEST: Debitor-Anlage');
  Logger.log('  IBAN: ' + testD.iban + ' (Frankfurter Sparkasse — Test-IBAN)');
  Logger.log('  Test-Email: ' + testD.email);
  Logger.log('  cfg.orgId: ' + cfg.orgId);
  Logger.log('  cfg.mandantenId: ' + cfg.mandantenId);
  Logger.log('  cfg.finApiKey gesetzt? ' + (!!cfg.finApiKey));
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Test-Kontakt anlegen
  const built = buildPersonPayload(
    testD,
    ['Test', 'Diagnose'],
    [],
    'Test-Kontakt für Debitor-Diagnose – kann manuell geloescht werden',
    cfg
  );
  const c = createContact(built.payload, cfg);

  if (!c.success) {
    Logger.log('❌ Schritt 1 (Kontakt anlegen) fehlgeschlagen — Diagnose abgebrochen');
    Logger.log('   ' + JSON.stringify(c));
    return;
  }

  Logger.log('✅ Schritt 1: Test-Kontakt angelegt — ID: ' + c.contactId);
  Logger.log('   Mandate-Ref: ' + built._mandateRef);

  // 2. Debitor anlegen
  Logger.log('▶ Schritt 2: createDebitor wird aufgerufen ...');
  const ok = createDebitor(c.contactId, testD, cfg);

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log(ok ? '✅ Debitor-Anlage erfolgreich' : '❌ Debitor-Anlage fehlgeschlagen — siehe API-Antwort oben');
  Logger.log('  Test-Kontakt-ID zum Aufraeumen in Campai: ' + c.contactId);
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================================
// REPAIR: Debitor fuer Frau Herbig nachziehen
// ============================================================
// Frau Herbig hat im Mai-Antrag einen Kontakt bekommen, aber kein
// Debitor (wegen damals noch kaputter Finance-API + falscher Auth).
// Diese Funktion zieht den Debitor auf ihrer existierenden Contact-ID
// nach. Einmaliger Aufruf, dann kann diese Funktion weg.
// ============================================================
function repairDebitorHerbig() {
  const cfg = getCFG();
  const contactId = '69f06ee68c52248dfc4515c6';

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ REPAIR: createDebitor fuer Frau Herbig nachziehen');
  Logger.log('  contactId: ' + contactId);
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const ok = createDebitor(contactId, {}, cfg);

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log(ok ? '✅ Debitor erfolgreich nachgezogen' : '❌ Debitor-Anlage fehlgeschlagen — siehe API-Antwort oben');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
