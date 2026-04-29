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
// REPAIR: Debitoren fuer Antraege nachziehen, bei denen die
// Debitor-Anlage urspruenglich fehlgeschlagen ist
// ============================================================
// Anlass: In der Uebergangsphase (kaputte Finance-API, BIC-Hardcode,
// falsche Auth) sind mehrere Mitgliedsantraege mit Kontakt+billing
// in Campai gelandet, aber ohne Debitor. Diese Funktion ruft die
// jetzt funktionierende createDebitor()-Logik fuer jede betroffene
// Contact-ID nach.
//
// Bei Bedarf einfach das FEHLEND-Array unten erweitern und nochmal
// laufen lassen. Schon angelegte Debitoren werden von Campai mit
// einem Fehler quittiert (kein Schaden, im Log sichtbar).
// ============================================================
function repairFehlendeDebitoren() {
  const cfg = getCFG();

  const FEHLEND = [
    // Janneke Susann Herbig (69f06ee68c52248dfc4515c6) — am 29.04. nachgezogen
    { name: 'Leni Amarell', contactId: '69f10bce0027e63b43e876b0' },
  ];

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ REPAIR: ' + FEHLEND.length + ' Debitoren nachziehen');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let okCount = 0;
  FEHLEND.forEach(function(entry, i) {
    Logger.log('━━━ [' + (i+1) + '/' + FEHLEND.length + '] ' + entry.name + ' ━━━');
    Logger.log('  contactId: ' + entry.contactId);
    const ok = createDebitor(entry.contactId, {}, cfg);
    if (ok) okCount++;
    Logger.log(ok ? '✅ Debitor angelegt' : '❌ Fehlgeschlagen — siehe API-Antwort oben');
  });

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('Fertig: ' + okCount + ' von ' + FEHLEND.length + ' erfolgreich');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================================
// DIAGNOSE: Campai Groups inspizieren
// ============================================================
// Probiert mehrere wahrscheinliche Endpoints, um die echten
// Campai-Group-Object-IDs herauszufinden, plus liest einen
// existierenden Kontakt aus, um zu sehen, was Campai aktuell
// als groups-Wert speichert (nach unserem fehlerhaften
// String-Eintrag).
//
// Ziel: Aus den Logs ableiten, welche ObjectIDs in der GROUPS-
// Konstante stehen muessen, damit Mitglieder kuenftig korrekt
// ihrer Gruppe zugeordnet werden.
// ============================================================
function inspectCampaiGroups() {
  const cfg = getCFG();

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ INSPEKTION: Campai Groups');
  Logger.log('  cfg.orgId: ' + cfg.orgId);
  Logger.log('  cfg.baseUrl: ' + cfg.baseUrl);
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Existierenden Kontakt holen, um den aktuellen groups-Wert zu sehen
  const sampleContactId = '69f06ee68c52248dfc4515c6';  // Frau Herbig
  Logger.log('▶ Schritt 1: GET /contacts/' + sampleContactId);
  const r1 = apiCall('get', '/contacts/' + sampleContactId, undefined, cfg);
  Logger.log('  HTTP ' + r1.code);
  if (r1.json) {
    Logger.log('  groups (Antwort): ' + JSON.stringify(r1.json.groups));
    Logger.log('  tags (Antwort):   ' + JSON.stringify(r1.json.tags));
  }

  // 2. Group-Liste vollstaendig auflisten (Endpoint /contactGroups ist
  //    der bestaetigte Treffer; nutzt 'number' als groups[]-Wert)
  const path = '/contactGroups?organisation=' + cfg.orgId;
  Logger.log('▶ Schritt 2: GET ' + path);
  const r = apiCall('get', path, undefined, cfg);
  Logger.log('  HTTP ' + r.code);

  if (r.code === 200 && Array.isArray(r.json)) {
    Logger.log('  Anzahl Gruppen: ' + r.json.length);
    Logger.log('  ─────────────────────────────────────────────');
    Logger.log('  number  |  name                                |  _id');
    Logger.log('  ─────────────────────────────────────────────');
    r.json.forEach(function(g) {
      const num  = (g.number || '').padEnd(7);
      const name = (g.name   || '').padEnd(36);
      Logger.log('  ' + num + ' |  ' + name + ' |  ' + g._id);
    });
  } else if (r.json) {
    Logger.log('  Fehler: ' + JSON.stringify(r.json).substring(0, 300));
  }

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('Inspektion fertig. Die "number"-Werte sind die richtigen');
  Logger.log('Eintraege fuer das groups[]-Feld im Kontakt-Payload.');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================================
// REPAIR: groups-Feld eines Kontakts setzen
// ============================================================
// In der Uebergangsphase wurden Kontakte mit String-Werten in
// groups[] angelegt (z.B. ['FM - Fanmitglieder']) statt mit
// Campai-number-Codes ('FM', 'SP', 'SM', 'FÖ'). Das macht den
// Kontakt in der Campai-UI nicht oeffenbar.
//
// Diese Funktion patcht groups[] auf den im Eintrag hinterlegten
// Code (groups: ['SP'] etc.). Wenn ein Eintrag KEIN groups-Feld
// hat, wird auf [] gepatcht (= keine Gruppe).
//
// Hinweis: Der Patch ueberschreibt die bestehende groups-Liste.
// Wer in der Campai-UI manuell zusaetzliche Gruppen pflegt
// (z.B. 'OM' als Sammelkategorie), muss diese danach manuell
// wieder zuweisen — oder hier mit reinnehmen.
// ============================================================
function repairKaputteGroups() {
  const cfg = getCFG();

  const KAPUTT = [
    { name: 'Janneke Susann Herbig', contactId: '69f06ee68c52248dfc4515c6', groups: ['SP'] },
    { name: 'Leni Amarell',          contactId: '69f10bce0027e63b43e876b0', groups: ['SP'] },
  ];

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ REPAIR: groups setzen (' + KAPUTT.length + ' Kontakte)');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let okCount = 0;
  KAPUTT.forEach(function(entry, i) {
    const groups = entry.groups || [];
    Logger.log('━━━ [' + (i+1) + '/' + KAPUTT.length + '] ' + entry.name + ' → groups: ' + JSON.stringify(groups) + ' ━━━');
    const r = apiCall('patch', '/contacts/' + entry.contactId, { groups: groups }, cfg);
    const ok = (r.code === 200 || r.code === 204);
    Logger.log('  HTTP ' + r.code + (ok ? ' ✅' : ' ❌'));
    if (!ok && r.json) Logger.log('  Antwort: ' + JSON.stringify(r.json));
    if (ok) okCount++;
  });

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('Fertig: ' + okCount + ' von ' + KAPUTT.length + ' erfolgreich');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
