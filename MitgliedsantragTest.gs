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

// ============================================================
// DIAGNOSE: Kontakt per Name finden + Struktur ausgeben
// ============================================================
// Probiert mehrere Such-Endpoints, listet Treffer und gibt den
// ersten Treffer im Detail aus — speziell die Felder, die fuer
// "Kontakt-nicht-oeffenbar"-Diagnose relevant sind:
//   alternateContacts, groups, tags, notes, communication.
//
// Suchbegriff unten anpassen (vorbefuellt: "Willi Ganzmann").
// ============================================================
function inspectContactByName() {
  const cfg = getCFG();
  const searchTerm = 'Willi Ganzmann';  // ← hier ggf. anpassen

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ Suche nach: "' + searchTerm + '"');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const params = [
    'search=' + encodeURIComponent(searchTerm),
    'q='      + encodeURIComponent(searchTerm),
    'name='   + encodeURIComponent(searchTerm),
    'personal.personLastName=' + encodeURIComponent('Ganzmann'),
  ];

  let foundContact = null;

  params.forEach(function(p) {
    const path = '/contacts?organisation=' + cfg.orgId + '&' + p;
    Logger.log('▶ Versuch: ' + path);
    const r = apiCall('get', path, undefined, cfg);
    Logger.log('  HTTP ' + r.code);

    if (r.code !== 200) {
      if (r.json) Logger.log('  Fehler: ' + JSON.stringify(r.json).substring(0, 200));
      return;
    }

    const arr = Array.isArray(r.json) ? r.json : (r.json && r.json.data) || [];
    Logger.log('  Treffer: ' + arr.length);
    arr.forEach(function(c) {
      const p   = c.personal || {};
      const com = c.communication || {};
      const name = (p.personFirstName || p.organisationName || '') + ' ' + (p.personLastName || '');
      Logger.log('    - ' + c._id + ' | ' + name.trim() + ' | ' + (com.email || ''));
      if (!foundContact) foundContact = c;
    });
  });

  if (!foundContact) {
    Logger.log('⚠️ Kein Treffer. Bitte Contact-ID manuell holen und inspectContactById verwenden.');
    return;
  }

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ DETAILS des ersten Treffers (' + foundContact._id + ')');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('  groups:            ' + JSON.stringify(foundContact.groups));
  Logger.log('  alternateContacts: ' + JSON.stringify(foundContact.alternateContacts));
  Logger.log('  tags:              ' + JSON.stringify(foundContact.tags));
  Logger.log('  notes:             ' + JSON.stringify(foundContact.notes));
  Logger.log('  communication:     ' + JSON.stringify(foundContact.communication));
  Logger.log('  billing:           ' + JSON.stringify(foundContact.billing));
  Logger.log('  voller JSON (1800 Zeichen): ' + JSON.stringify(foundContact).substring(0, 1800));
}

// ============================================================
// REPAIR: alternateContacts in korrekte Objekt-Form bringen
// ============================================================
// Familienmitglieder wurden mit alternateContacts: [<string-id>]
// gepatcht — Campai speichert das als {description:null, contact:null}-
// Skelett, was die Detail-Ansicht bricht. Diese Funktion patcht die
// betroffenen Kontakte auf [{description: null, contact: <id>}].
//
// FAMILIE-Array bei Bedarf erweitern.
// ============================================================
function repairAlternateContacts() {
  const cfg = getCFG();

  const FAMILIE = [
    { name: 'Willi Ganzmann', contactId: '6a1d38c94543260750492af9', hauptId: '6a1d38ae9ecaf4e4ac566540' },
    { name: 'Emil Ganzmann',  contactId: '6a1d38b9f10900b3e2742d4d', hauptId: '6a1d38ae9ecaf4e4ac566540' },
  ];

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ REPAIR: alternateContacts auf Objekt-Form (' + FAMILIE.length + ' Kontakte)');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let okCount = 0;
  FAMILIE.forEach(function(entry, i) {
    Logger.log('━━━ [' + (i+1) + '/' + FAMILIE.length + '] ' + entry.name + ' → contact: ' + entry.hauptId + ' ━━━');
    const r = apiCall('patch', '/contacts/' + entry.contactId,
      { alternateContacts: [{ description: null, contact: entry.hauptId }] }, cfg);
    const ok = (r.code === 200 || r.code === 204);
    Logger.log('  HTTP ' + r.code + (ok ? ' ✅' : ' ❌'));
    if (!ok && r.json) Logger.log('  Antwort: ' + JSON.stringify(r.json));
    if (ok) okCount++;
  });

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('Fertig: ' + okCount + ' von ' + FAMILIE.length + ' erfolgreich');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================================
// REPAIR: tags-Liste fuer Fankinder setzen
// ============================================================
// Bestehende Familienmitglieder (Kinder) haben das Tag 'Fankind'
// nicht bekommen, weil der Code es bisher nicht setzte. Diese
// Funktion patcht die tags-Liste komplett auf
// ['Neu', 'Fan', 'Fankind'] fuer die angegebenen Contact-IDs.
//
// ACHTUNG: PATCH ueberschreibt die tags-Liste komplett. Wer in
// der Campai-UI manuell zusaetzliche Tags angelegt hat, muss sie
// hier mit aufnehmen oder nachtraeglich wieder zuweisen.
// ============================================================
function repairFankindTags() {
  const cfg = getCFG();

  const FANKINDER = [
    { name: 'Willi Ganzmann', contactId: '6a1d38c94543260750492af9' },
    { name: 'Emil Ganzmann',  contactId: '6a1d38b9f10900b3e2742d4d' },
  ];

  const TAGS = ['Neu', 'Fan', 'Fankind'];

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ REPAIR: tags-Liste auf ' + JSON.stringify(TAGS) + ' (' + FANKINDER.length + ' Fankinder)');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let okCount = 0;
  FANKINDER.forEach(function(entry, i) {
    Logger.log('━━━ [' + (i+1) + '/' + FANKINDER.length + '] ' + entry.name + ' ━━━');
    const r = apiCall('patch', '/contacts/' + entry.contactId, { tags: TAGS }, cfg);
    const ok = (r.code === 200 || r.code === 204);
    Logger.log('  HTTP ' + r.code + (ok ? ' ✅' : ' ❌'));
    if (!ok && r.json) Logger.log('  Antwort: ' + JSON.stringify(r.json));
    if (ok) okCount++;
  });

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('Fertig: ' + okCount + ' von ' + FANKINDER.length + ' erfolgreich');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================================
// DIAGNOSE: Debitor-Struktur bei geteilter IBAN erforschen
// ============================================================
// Anlass: Matthias Spading hat sich angemeldet, seine Frau wollte
// sich mit der GLEICHEN IBAN als separates Mitglied anmelden —
// Campai lehnte ab. Wir wollen Variante B (Debitor-Sharing) bauen,
// muessen aber erst wissen, ueber welches Feld ein Kontakt einen
// FREMDEN Debitor referenzieren kann.
//
// Was die Funktion macht:
//   1. Findet Matthias per Nachname (personal.personLastName)
//   2. Loggt sein billing-Objekt (sepaIBAN, debtor, payer)
//   3. Probiert IBAN-basierte Contact-Suche (fuer findContactByIban)
//   4. Probiert diverse Debitor-Endpoints (/debtors, /contacts/{id}/debtors)
//   5. Sucht nach Frau Spading (falls der Kontakt trotz Fehler angelegt wurde)
// ============================================================
function inspectDebtorSetup() {
  const cfg = getCFG();

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ INSPEKTION: Debitor-Setup fuer Spading');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Alle Spading-Kontakte finden
  Logger.log('▶ 1. Alle Spading-Kontakte suchen');
  const path = '/contacts?organisation=' + cfg.orgId + '&personal.personLastName=' + encodeURIComponent('Spading');
  const r = apiCall('get', path, undefined, cfg);
  Logger.log('  HTTP ' + r.code);
  const list = Array.isArray(r.json) ? r.json : ((r.json && r.json.data) || []);
  Logger.log('  Treffer: ' + list.length);
  list.forEach(function(c) {
    const p = c.personal || {};
    Logger.log('    - ' + c._id + ' | ' + (p.personFirstName || '') + ' ' + (p.personLastName || '') + ' | type=' + c.type);
  });
  if (list.length === 0) {
    Logger.log('❌ Keine Spading-Kontakte gefunden. Ohne Grundlage kein Diagnose.');
    return;
  }
  const matthias = list[0];  // Annahme: erster Treffer ist Matthias
  const iban = (matthias.billing && matthias.billing.sepaIBAN) || '';
  Logger.log('');
  Logger.log('▶ Referenz-Kontakt: ' + matthias._id + ' (' + (matthias.personal && matthias.personal.personFirstName) + ')');
  Logger.log('  IBAN (aus billing.sepaIBAN): ' + iban);
  Logger.log('  billing:  ' + JSON.stringify(matthias.billing));

  // 2. IBAN-basierte Suche testen
  Logger.log('');
  Logger.log('▶ 2. IBAN-basierte Kontakt-Suche testen');
  const ibanSearches = [
    '/contacts?organisation=' + cfg.orgId + '&billing.sepaIBAN=' + encodeURIComponent(iban),
    '/contacts?organisation=' + cfg.orgId + '&sepaIBAN=' + encodeURIComponent(iban),
  ];
  ibanSearches.forEach(function(p) {
    const rr = apiCall('get', p, undefined, cfg);
    const cnt = Array.isArray(rr.json) ? rr.json.length : ((rr.json && rr.json.data) ? rr.json.data.length : 'n/a');
    Logger.log('  ' + p + ' → HTTP ' + rr.code + ' | Treffer: ' + cnt);
  });

  // 3. Debitor-Endpoints probieren
  Logger.log('');
  Logger.log('▶ 3. Debitor-Endpoints probieren');
  const debtorId = matthias.billing && matthias.billing.debtor;
  const debtorTries = [
    '/debtors?organisation=' + cfg.orgId,
    '/contacts/' + matthias._id + '/debtors',
    debtorId ? '/debtors/' + debtorId : null,
    debtorId ? '/finance/accounts/debtors/' + debtorId : null,
  ].filter(Boolean);
  debtorTries.forEach(function(p) {
    const rr = apiCall('get', p, undefined, cfg);
    Logger.log('  ' + p + ' → HTTP ' + rr.code);
    if (rr.code === 200 && rr.json) {
      Logger.log('    Antwort (600 Zeichen): ' + JSON.stringify(rr.json).substring(0, 600));
    } else if (rr.json) {
      Logger.log('    Fehler: ' + JSON.stringify(rr.json).substring(0, 200));
    }
  });

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('Diagnose fertig. Aus dem Log ableiten:');
  Logger.log('  - Funktioniert billing.sepaIBAN als Suchfilter?');
  Logger.log('  - Welcher Debitor-Endpoint liefert Debitor-Details?');
  Logger.log('  - Wie sieht ein Debitor-Objekt aus (payer, contacts-Liste)?');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================================
// EXPERIMENT: Zweiter Kontakt mit fremder IBAN
// ============================================================
// Zweck: Herausfinden, unter welchen Bedingungen Campai einen
// Kontakt mit einer bereits verwendeten IBAN akzeptiert. Grundlage
// fuer Variante-B-Umsetzung (Debitor-Sharing bei Ehepartner-etc.-
// Faellen).
//
// Testet DREI Payload-Varianten (jede mit eigenem Test-Mustermann,
// alle mit Matthias' IBAN):
//   A) billing.sepaIBAN gesetzt wie normal, alternateContacts im
//      initialen Payload → wie Familienmitglied, aber im gleichen
//      POST statt via separatem PATCH
//   B) OHNE billing.sepaIBAN → nur Kontakt anlegen, spaeter per
//      PATCH billing.payer setzen
//   C) billing.sepaIBAN gesetzt, billing.payer explizit auf
//      Matthias → Payer-Referenz beim Anlegen
//
// KEIN createDebitor-Aufruf bei diesem Test — wir wollen erst wissen,
// welche Kontakt-Anlage Campai akzeptiert.
//
// ACHTUNG: Legt bis zu 3 Test-Kontakte in Campai an. Bitte danach
// manuell aufraeumen (Emails 'test-shared-iban-<n>-<ts>@…').
// ============================================================
function testSharedIbanContact() {
  const cfg = getCFG();
  const IBAN         = 'DE42120965970003627489';   // Matthias' IBAN
  const MATTHIAS_ID  = '6a45499dcd02f771692fcff8'; // Matthias' Contact-ID
  const OWNER_NAME   = 'Matthias Spading';         // Kontoinhaber
  const ts           = Date.now();

  const varianten = [
    {
      label: 'A: billing komplett + alternateContacts im Payload',
      payload: {
        createdAt: new Date().toISOString(),
        type: 'contact',
        enterDate: new Date().toISOString(),
        personal: { type: 'malePerson', isPerson: true, personFirstName: 'MaxA', personLastName: 'Sharing-Test' },
        communication: { email: 'test-shared-iban-A-' + ts + '@basketball-loewen.com', defaultSendMethod: 'email' },
        tags: ['Test', 'IBAN-Share'],
        groups: [],
        notes: [{ content: 'Variante A: billing komplett + alternateContacts inline' }],
        alternateContacts: [{ description: null, contact: MATTHIAS_ID }],
        billing: {
          sepaIBAN: IBAN,
          sepaAccountOwner: OWNER_NAME,
          invoiceSendMethod: 'email',
          billingMethod: 'sepaDirectDebit',
          sepaMandateId: 'BL-TEST-A-' + ts.toString(36).toUpperCase(),
          sepaMandateSignatureDate: new Date().toISOString(),
        },
      }
    },
    {
      label: 'B: OHNE billing (Kontakt ohne SEPA-Info)',
      payload: {
        createdAt: new Date().toISOString(),
        type: 'contact',
        enterDate: new Date().toISOString(),
        personal: { type: 'malePerson', isPerson: true, personFirstName: 'MaxB', personLastName: 'Sharing-Test' },
        communication: { email: 'test-shared-iban-B-' + ts + '@basketball-loewen.com', defaultSendMethod: 'email' },
        tags: ['Test', 'IBAN-Share'],
        groups: [],
        notes: [{ content: 'Variante B: OHNE billing' }],
        alternateContacts: [{ description: null, contact: MATTHIAS_ID }],
      }
    },
    {
      label: 'C: billing komplett + billing.payer auf Matthias',
      payload: {
        createdAt: new Date().toISOString(),
        type: 'contact',
        enterDate: new Date().toISOString(),
        personal: { type: 'malePerson', isPerson: true, personFirstName: 'MaxC', personLastName: 'Sharing-Test' },
        communication: { email: 'test-shared-iban-C-' + ts + '@basketball-loewen.com', defaultSendMethod: 'email' },
        tags: ['Test', 'IBAN-Share'],
        groups: [],
        notes: [{ content: 'Variante C: billing.payer explizit gesetzt' }],
        alternateContacts: [{ description: null, contact: MATTHIAS_ID }],
        billing: {
          sepaIBAN: IBAN,
          sepaAccountOwner: OWNER_NAME,
          invoiceSendMethod: 'email',
          billingMethod: 'sepaDirectDebit',
          sepaMandateId: 'BL-TEST-C-' + ts.toString(36).toUpperCase(),
          sepaMandateSignatureDate: new Date().toISOString(),
          payer: MATTHIAS_ID,
        },
      }
    },
  ];

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('▶ EXPERIMENT: 3 Payload-Varianten mit Matthias\' IBAN');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  varianten.forEach(function(v, i) {
    Logger.log('');
    Logger.log('━━━ [' + (i+1) + '/3] ' + v.label + ' ━━━');
    const r = apiCall('post', '/contacts?organisation=' + cfg.orgId, v.payload, cfg);
    Logger.log('  HTTP ' + r.code);
    if (r.code === 200 || r.code === 201) {
      const id = r.json && r.json._id;
      Logger.log('  ✅ Angelegt: ' + id);
      const billing = r.json && r.json.billing;
      Logger.log('  billing.sepaIBAN:   ' + (billing && billing.sepaIBAN));
      Logger.log('  billing.debtor:     ' + (billing && billing.debtor));
      Logger.log('  billing.debtorName: ' + (billing && billing.debtorName));
      Logger.log('  billing.payer:      ' + (billing && billing.payer));
      Logger.log('  altCntacts:         ' + JSON.stringify(r.json && r.json.alternateContacts));
    } else {
      Logger.log('  ❌ Fehler: ' + JSON.stringify(r.json).substring(0, 500));
    }
  });

  Logger.log('');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('Test-Kontakte ggf. manuell in Campai loeschen.');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Variante mit Contact-ID, falls die Suche nicht klappt
function inspectContactById() {
  const cfg = getCFG();
  const contactId = '6a1d38ae9ecaf4e4ac566540';  // Willi Ganzmann

  if (contactId === 'HIER_CONTACT_ID_EINTRAGEN') {
    Logger.log('❌ Bitte erst contactId in der Funktion eintragen.');
    return;
  }

  Logger.log('▶ GET /contacts/' + contactId);
  const r = apiCall('get', '/contacts/' + contactId, undefined, cfg);
  Logger.log('  HTTP ' + r.code);
  if (r.code !== 200) {
    Logger.log('  Antwort: ' + JSON.stringify(r.json));
    return;
  }
  const c = r.json;
  Logger.log('  groups:            ' + JSON.stringify(c.groups));
  Logger.log('  alternateContacts: ' + JSON.stringify(c.alternateContacts));
  Logger.log('  tags:              ' + JSON.stringify(c.tags));
  Logger.log('  notes:             ' + JSON.stringify(c.notes));
  Logger.log('  communication:     ' + JSON.stringify(c.communication));
  Logger.log('  voller JSON (1800 Zeichen): ' + JSON.stringify(c).substring(0, 1800));
}
