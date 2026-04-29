// ============================================================
// Basketball Löwen Erfurt e.V.
// Mitgliedsantrag – Apps Script Backend  v2.0
// ============================================================

// ============================================================
// FESTE KONFIGURATION
// ============================================================
const SEPA = {
  glaeubigerID: 'DE46ZZZ00002312785',
  mandatstyp:   'CORE',
  intervall:    'RCUR',
};

const GROUPS = {
  FM: 'FM - Fanmitglieder',
  SP: 'SP - Spielerinnen',
  SM: 'SM - Schulmitglieder',
  FO: 'FÖ - Fördermitglieder',
};

const STATIC = {
  adminEmail:       'mitgliederverwaltung@basketball-loewen.com',
  senderName:       'Basketball Löwen Erfurt e.V.',
  nachweisFolder:   '1CYi_yi4rPvjd64hf3aoL3cppaJ4Vy56p',
  baseUrl:          'https://api.campai.com',
  mandatPrefix:     'BL',
};

// ============================================================
// PROPERTIES SERVICE – nur Secrets
// ============================================================
function getCFG() {
  const p = PropertiesService.getScriptProperties();
  return {
    apiKey:      p.getProperty('CAMPAI_API_KEY'),
    orgId:       p.getProperty('CAMPAI_ORG_ID'),
    finApiKey:   p.getProperty('CAMPAI_FINANCE_API_KEY'),
    // Mitgliedsantrag legt nur LEV-Mitglieder an (Basketball Löwen e.V.).
    // FVB/XXL-Mitglieder werden manuell oder über andere Skripte angelegt.
    mandantenId: p.getProperty('CAMPAI_MANDATE_ID_LEV'),
    ...STATIC,
  };
}

// ============================================================
// BOT-SCHUTZ
// ============================================================
const BOT = {
  tokenSalt:   0x4C57E8,
  minFillSec:  8,
  maxFillSec:  1800,
  maxPerEmail: 3,
  maxGlobal:   50,
};

function validateBotToken(d) {
  if (d.faxNummer) { Logger.log('🚫 Honeypot'); return 'Ungültige Anfrage.'; }
  const ts = parseInt(d._ts, 10);
  if (!ts || isNaN(ts)) { Logger.log('🚫 Kein Timestamp'); return 'Ungültige Anfrage.'; }
  try {
    const expected = String(ts * 7 + BOT.tokenSalt);
    const decoded  = Utilities.newBlob(Utilities.base64Decode(d._tk)).getDataAsString();
    if (decoded !== expected) { Logger.log('🚫 Token ungültig'); return 'Ungültige Anfrage.'; }
  } catch(e) { Logger.log('🚫 Token-Fehler: ' + e.message); return 'Ungültige Anfrage.'; }
  const age = Math.floor(Date.now() / 1000) - ts;
  if (age < BOT.minFillSec) return 'Bitte nimm dir etwas mehr Zeit beim Ausfüllen.';
  if (age > BOT.maxFillSec) return 'Das Formular ist abgelaufen. Bitte lade die Seite neu.';
  Logger.log('✅ Bot-Check ok (' + age + 's)');
  return null;
}

function checkRateLimit(email) {
  const props = PropertiesService.getScriptProperties();
  const today = fmtDate(new Date());
  const ek    = 'rl_' + today + '_' + email.toLowerCase().trim();
  const gk    = 'rl_' + today + '_GLOBAL';
  const ec    = parseInt(props.getProperty(ek) || '0', 10);
  const gc    = parseInt(props.getProperty(gk) || '0', 10);
  if (ec >= BOT.maxPerEmail) return 'Für diese E-Mail wurde das Tageslimit erreicht.';
  if (gc >= BOT.maxGlobal)   return 'Das globale Tageslimit wurde erreicht. Bitte versuche es morgen.';
  props.setProperty(ek, String(ec + 1));
  props.setProperty(gk, String(gc + 1));
  Logger.log('✅ Rate ok: ' + email + '=' + (ec+1) + ' global=' + (gc+1));
  return null;
}

function cleanupRateLimitKeys() {
  const props = PropertiesService.getScriptProperties();
  const today = fmtDate(new Date());
  const all   = props.getProperties();
  let del = 0;
  for (const key in all) {
    if (key.indexOf('rl_') === 0 && key.indexOf(today) === -1) {
      props.deleteProperty(key); del++;
    }
  }
  Logger.log('🧹 Cleanup: ' + del + ' Keys gelöscht');
}

// ============================================================
// HILFSFUNKTIONEN
// ============================================================
function fmtDate(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth()+1).padStart(2,'0') + '-'
    + String(d.getDate()).padStart(2,'0');
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildCampaiError(prefix, json) {
  if (!json || typeof json !== 'object') return prefix;
  const map = {
    invalidIBAN:     'Die eingegebene IBAN ist ungültig.',
    duplicateEmail:  'Diese E-Mail-Adresse ist bereits registriert.',
    missingField:    'Ein Pflichtfeld fehlt.',
    invalidEmail:    'Die eingegebene E-Mail-Adresse ist ungültig.',
    invalidBirthday: 'Das eingegebene Geburtsdatum ist ungültig.',
  };
  for (const [field, val] of Object.entries(json)) {
    if (field === 'error') continue;
    const type = val?.type || String(val);
    if (map[type]) return map[type];
  }
  const details = Object.entries(json)
    .filter(([k]) => k !== 'error')
    .map(([k,v]) => k + ': ' + (v?.type || JSON.stringify(v)))
    .join(', ');
  return details ? prefix + ' – ' + details : prefix;
}

function nextMandateRef() {
  return STATIC.mandatPrefix + '-' + Date.now().toString(36).toUpperCase();
}

function calcAge(dateStr) {
  if (!dateStr) return null;
  const bday  = new Date(dateStr);
  const today = new Date();
  let age = today.getFullYear() - bday.getFullYear();
  const m = today.getMonth() - bday.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bday.getDate())) age--;
  return age;
}

// ============================================================
// CAMPAI API
// ============================================================
function apiCall(method, path, body, cfg) {
  const opts = {
    method:             method,
    headers:            { 'Authorization': cfg.apiKey, 'Content-Type': 'application/json' },
    muteHttpExceptions: true,
  };
  if (body !== undefined) opts.payload = JSON.stringify(body);
  const res  = UrlFetchApp.fetch(cfg.baseUrl + path, opts);
  const code = res.getResponseCode();
  let json = {};
  try { json = JSON.parse(res.getContentText()); } catch(e) {}
  Logger.log((code < 300 ? '✅' : '❌') + ' ' + method.toUpperCase()
    + ' ' + path.substring(0,80) + ' → ' + code);
  return { code, json };
}

function findContactByEmail(email, cfg) {
  const res = apiCall('get',
    '/contacts?organisation=' + cfg.orgId + '&email=' + encodeURIComponent(email),
    undefined, cfg);
  if (res.code === 200) {
    const list = Array.isArray(res.json) ? res.json : (res.json.data || []);
    if (list.length > 0) {
      Logger.log('✅ Kontakt gefunden für ' + email + ': ' + list[0]._id);
      return list[0]._id;
    }
  }
  Logger.log('ℹ️ Kein Kontakt gefunden für ' + email);
  return null;
}

function setAlternateContact(contactId, altContactId, cfg) {
  const res = apiCall('patch', '/contacts/' + contactId,
    { alternateContacts: [altContactId] }, cfg);
  if (res.code === 200 || res.code === 204) {
    Logger.log('✅ alternateContacts gesetzt: ' + contactId + ' → ' + altContactId);
  } else {
    Logger.log('⚠️ alternateContacts fehlgeschlagen: ' + JSON.stringify(res.json));
  }
}

function createContact(payload, cfg) {
  Logger.log('📤 Kontakt-Payload: ' + JSON.stringify(payload).substring(0, 800));
  const res = apiCall('post', '/contacts?organisation=' + cfg.orgId, payload, cfg);
  if (res.code !== 200 && res.code !== 201) {
    Logger.log('❌ Kontakt-Fehler: ' + JSON.stringify(res.json));
    return {
      success: false,
      error:   'Kontakt konnte nicht angelegt werden – HTTP ' + res.code + ' – ' + JSON.stringify(res.json).substring(0, 500),
    };
  }
  Logger.log('✅ Kontakt angelegt: ' + res.json._id);
  return { success: true, contactId: res.json._id };
}

// Debitor über die neue Finance API anlegen
function createDebitor(contactId, d, cfg) {
  Utilities.sleep(1000);
  const fullName = ((d.vorname||'') + ' ' + (d.nachname||'')).trim();
  const isFirma  = !!(d.firmenname && d.firmenname.trim());
  const url = 'https://cloud.campai.com/api/'
    + cfg.orgId + '/' + cfg.mandantenId
    + '/finance/accounts/debtors';

  const iban    = (d.iban || '').replace(/\s/g, '').toUpperCase();
  const todayStr = fmtDate(new Date());

  // BIC bewusst NICHT mitgeschickt: Campai leitet ihn aus der IBAN selbst ab.
  // Falls die Finance-API den BIC spaeter doch zwingend erwartet, hier eine
  // echte BLZ→BIC-Lookup-Tabelle anbinden — kein Hardcode-Fallback!

  const payload = {
    type:              isFirma ? 'business' : 'person',
    name:              isFirma ? d.firmenname.trim() : fullName,
    contact:           contactId,
    email:             (d.email || '').trim(),
    receiptSendMethod: d.email ? 'email' : 'none',
    paymentMethodType: iban ? 'sepaDirectDebit' : null,
    sepaDirectDebitMandate: iban ? {
      iban:                     iban,
      sepaMandateId:            STATIC.mandatPrefix + '-' + Date.now().toString(36).toUpperCase(),
      sepaMandateSignatureDate: todayStr,
      accountHolderName:        (d.kontoinhaber || fullName).substring(0, 80),
      accountHolderAddress:     {
        addressLine: (d.strasse || '').trim() || '-',
        zip:         (d.plz     || '').trim(),
        city:        (d.ort     || '').trim(),
        country:     'DE',
      },
    } : null,
    birthdate:         d.geburtsdatum || null,
  };

  Logger.log('📤 Debitor-Payload: ' + JSON.stringify(payload));

  const res = UrlFetchApp.fetch(url, {
    method:  'post',
    headers: {
      'X-API-Key':    cfg.finApiKey,
      'Content-Type': 'application/json',
    },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  let json = {};
  try { json = JSON.parse(res.getContentText()); } catch(e) {}

  if (code === 200 || code === 201) {
    Logger.log('✅ Debitor angelegt: ' + JSON.stringify(json));
    return true;
  }
  Logger.log('⚠️ Debitor-Fehler HTTP ' + code + ': ' + JSON.stringify(json));
  return false;
}

// ============================================================
// DOKUMENT-UPLOAD (Ermäßigungsnachweis)
// ============================================================
function uploadNachweis(contactId, fileName, mimeType, base64Data, cfg) {
  try {
    const bytes    = Utilities.base64Decode(base64Data);
    const boundary = 'BL_' + Date.now();
    const pre      = Utilities.newBlob(
      '--' + boundary + '\r\n'
      + 'Content-Disposition: form-data; name="file"; filename="' + fileName + '"\r\n'
      + 'Content-Type: ' + mimeType + '\r\n\r\n'
    ).getBytes();
    const post = Utilities.newBlob('\r\n--' + boundary + '--').getBytes();
    const body = pre.concat(bytes).concat(post);

    const res = UrlFetchApp.fetch(cfg.baseUrl + '/contacts/' + contactId + '/documents', {
      method:  'post',
      headers: {
        'Authorization': cfg.apiKey,
        'Content-Type':  'multipart/form-data; boundary=' + boundary,
      },
      payload:            Utilities.newBlob(body).getBytes(),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    Logger.log('📎 campai Dokument-Upload → HTTP ' + code);
    if (code === 200 || code === 201) return { success: true, source: 'campai' };
    throw new Error('HTTP ' + code + ': ' + res.getContentText().substring(0, 200));
  } catch(err) {
    Logger.log('⚠️ campai-Upload fehlgeschlagen (' + err.message + ') → Drive-Fallback');
    return uploadNachweisZuDrive(contactId, fileName, mimeType, base64Data, cfg);
  }
}

function uploadNachweisZuDrive(contactId, fileName, mimeType, base64Data, cfg) {
  try {
    const bytes  = Utilities.base64Decode(base64Data);
    const blob   = Utilities.newBlob(bytes, mimeType, fileName);
    const folder = DriveApp.getFolderById(cfg.nachweisFolder);
    const file   = folder.createFile(blob);
    file.setDescription('Nachweis Ermäßigung | campai-ID: ' + contactId
      + ' | ' + new Date().toLocaleDateString('de-DE'));
    const link = file.getUrl();
    Logger.log('✅ Nachweis in Drive abgelegt: ' + link);
    apiCall('patch', '/contacts/' + contactId,
      { notes: [{ content: '📎 Ermäßigungsnachweis (Drive): ' + link }] }, cfg);
    return { success: true, source: 'drive', link };
  } catch(err) {
    Logger.log('❌ Drive-Upload fehlgeschlagen: ' + err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================
// KONTAKT-PAYLOAD BUILDER
// ============================================================
function buildPersonPayload(d, tags, groups, extraNote, cfg) {
  const now        = new Date().toISOString();
  const today      = new Date();
  const geb        = d.geburtsdatum ? new Date(d.geburtsdatum) : null;
  let   alter      = null;
  if (geb) {
    alter = today.getFullYear() - geb.getFullYear();
    const mDiff = today.getMonth() - geb.getMonth();
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < geb.getDate())) alter--;
  }
  const datumStr   = today.toLocaleDateString('de-DE',
    { day: '2-digit', month: '2-digit', year: 'numeric' });
  const mandateRef = nextMandateRef();
  const iban       = (d.iban || '').replace(/\s/g, '').toUpperCase();

  const noteLines = ['Eintrittsdatum: ' + datumStr];
  if (alter !== null) noteLines.push('Alter bei Eintritt: ' + alter);
  if (extraNote) noteLines.push(extraNote);

  // campai erlaubt: malePerson, femalePerson, diversePerson, organisation
  let persType = d.geschlecht || 'malePerson';
  if (persType === 'diverse') persType = 'diversePerson';

  const personal = {
    type:            persType,
    isPerson:        true,
    personFirstName: (d.vorname  || '').trim(),
    personLastName:  (d.nachname || '').trim(),
  };
  if (d.geburtsdatum) {
    personal.personBirthday = d.geburtsdatum;
  }

  return {
    _mandateRef: mandateRef,
    payload: {
      createdAt:    now,
      type:         'contact',
      enterDate:    now,
      personal:     personal,
      communication: {
        email:             (d.email   || '').trim(),
        regularPhone:      (d.telefon || '').trim() || null,
        defaultSendMethod: 'email',
      },
      address: {
        street:  (d.strasse || '').trim(),
        zip:     (d.plz     || '').trim(),
        city:    (d.ort     || '').trim(),
        country: 'DE',
      },
      tags:   tags,
      groups: groups,
      notes:  [{ content: noteLines.join('\n') }],
      billing: iban ? {
        sepaIBAN:                 iban,
        sepaAccountOwner:         (d.kontoinhaber || '').trim(),
        invoiceSendMethod:        'email',
        billingMethod:            'sepaDirectDebit',
        sepaMandateId:            mandateRef,
        sepaMandateSignatureDate: now,
      } : undefined,
    },
  };
}

function buildOrgPayload(d, cfg) {
  const now        = new Date().toISOString();
  const mandateRef = nextMandateRef();
  const iban       = (d.iban || '').replace(/\s/g, '').toUpperCase();
  return {
    _mandateRef: mandateRef,
    payload: {
      createdAt:    now,
      type:         'contact',
      enterDate:    now,
      personal: {
        type:             'organisation',
        isOrganisation:   true,
        organisationName: (d.firmenname || '').trim(),
      },
      communication: {
        email:             (d.email   || '').trim(),
        regularPhone:      (d.telefon || '').trim() || null,
        defaultSendMethod: 'email',
      },
      address: {
        street:  (d.strasse || '').trim(),
        zip:     (d.plz     || '').trim(),
        city:    (d.ort     || '').trim(),
        country: 'DE',
      },
      tags:   ['Neu', 'Förderer'],
      groups: [GROUPS.FO],
      notes:  [{ content: 'Ansprechpartner: '
        + (d.vorname||'').trim() + ' ' + (d.nachname||'').trim() }],
      billing: iban ? {
        sepaIBAN:                 iban,
        sepaAccountOwner:         (d.kontoinhaber || '').trim(),
        invoiceSendMethod:        'email',
        billingMethod:            'sepaDirectDebit',
        sepaMandateId:            mandateRef,
        sepaMandateSignatureDate: now,
      } : undefined,
    },
  };
}

// ============================================================
// HANDLER: FAN-MITGLIED
// ============================================================
function handleFan(d, cfg) {
  const hasErm = !!(d.ermaessigungKategorie);
  const tags   = hasErm ? ['Neu', 'Fan', 'Ermäßigt'] : ['Neu', 'Fan'];
  const note   = hasErm ? 'Ermäßigungskategorie: ' + d.ermaessigungKategorie : null;

  const { _mandateRef, payload } = buildPersonPayload(d, tags, [GROUPS.FM], note, cfg);
  const c = createContact(payload, cfg);
  if (!c.success) return c;

  if (!createDebitor(c.contactId, d, cfg))
    sendAdminWarning(d, c.contactId, 'Debitor konnte nicht angelegt werden', cfg);

  // Nachweis-Upload (optional)
  if (hasErm && d.nachweisBase64 && d.nachweisMimeType) {
    const up = uploadNachweis(c.contactId,
      d.nachweisFileName || 'nachweis.pdf',
      d.nachweisMimeType, d.nachweisBase64, cfg);
    Logger.log('📎 Nachweis-Upload: ' + JSON.stringify(up));
  }

  // Familienmitglieder anlegen
  const familyMembers = d.familyMembers || [];
  for (let i = 0; i < familyMembers.length; i++) {
    const fm = familyMembers[i];
    if (!fm.vorname || !fm.nachname) continue;
    Utilities.sleep(1000);

    const fmAge = calcAge(fm.geburtsdatum);
    const isChild = fmAge !== null && fmAge < 18;
    const fmNote = isChild
      ? 'Familienmitglied (Kind) von ' + d.email
      : 'Familienmitglied von ' + d.email;

    const fmD = {
      vorname:      fm.vorname,
      nachname:     fm.nachname,
      geburtsdatum: fm.geburtsdatum,
      geschlecht:   fm.geschlecht,
      email:        d.email,
      telefon:      d.telefon || '',
      strasse:      d.strasse || '',
      plz:          d.plz     || '',
      ort:          d.ort     || '',
      kontoinhaber: d.kontoinhaber,
      iban:         d.iban,
    };

    const { _mandateRef: fmRef, payload: fmPayload } = buildPersonPayload(
      fmD, ['Neu', 'Fan'], [GROUPS.FM], fmNote, cfg);
    const fc = createContact(fmPayload, cfg);
    if (fc.success) {
      createDebitor(fc.contactId, fmD, cfg);
      setAlternateContact(fc.contactId, c.contactId, cfg);
    } else {
      sendAdminWarning(d, c.contactId,
        'Familienmitglied ' + fm.vorname + ' ' + fm.nachname
        + ' konnte nicht angelegt werden – bitte manuell anlegen.', cfg);
    }
  }

  const typ = hasErm ? 'Fan-Mitglied (ermäßigt)' : 'Fan-Mitglied';
  sendEmails(d, c.contactId, _mandateRef, typ, cfg);
  return { success: true, contactId: c.contactId };
}

// ============================================================
// HANDLER: SPIELER:IN
// ============================================================
function handleSpieler(d, cfg) {
  const age     = calcAge(d.geburtsdatum);
  const isMinor = age !== null && age < 18;
  const note    = isMinor
    ? 'Minderjährig – Erziehungsberechtigte/r: '
      + (d.erziehVorname || '') + ' ' + (d.erziehNachname || '')
    : null;

  const { _mandateRef, payload } = buildPersonPayload(
    d, ['Neu', 'Spieler'], [GROUPS.SP], note, cfg);
  const c = createContact(payload, cfg);
  if (!c.success) return c;

  if (!createDebitor(c.contactId, d, cfg))
    sendAdminWarning(d, c.contactId, 'Debitor konnte nicht angelegt werden', cfg);

  const typ = isMinor ? 'Spieler:in (minderjährig)' : 'Spieler:in';
  sendEmails(d, c.contactId, _mandateRef, typ, cfg);
  return { success: true, contactId: c.contactId };
}

// ============================================================
// HANDLER: SCHULPROGRAMM
// ============================================================
function handleSchule(d, cfg) {
  const note = 'Schule: ' + (d.schule || '–')
    + '\nErziehungsberechtigte/r: '
    + (d.elternVorname || '') + ' ' + (d.elternNachname || '');

  const { _mandateRef, payload } = buildPersonPayload(
    d, ['Neu', 'Schule'], [GROUPS.SM], note, cfg);
  const c = createContact(payload, cfg);
  if (!c.success) return c;

  if (!createDebitor(c.contactId, d, cfg))
    sendAdminWarning(d, c.contactId, 'Debitor konnte nicht angelegt werden', cfg);

  sendEmails(d, c.contactId, _mandateRef, 'Schulprogramm', cfg);
  return { success: true, contactId: c.contactId };
}

// ============================================================
// HANDLER: FÖRDERMITGLIED
// ============================================================
function handleFoerder(d, cfg) {
  const isFirma = !!(d.firmenname && d.firmenname.trim());
  let built, typ;

  if (isFirma) {
    built = buildOrgPayload(d, cfg);
    typ   = 'Fördermitglied (Firma)';
  } else {
    built = buildPersonPayload(
      d, ['Neu', 'Förderer'], [GROUPS.FO],
      'Fördermitglied Einzelperson', cfg);
    typ = 'Fördermitglied';
  }

  const c = createContact(built.payload, cfg);
  if (!c.success) return c;

  if (!createDebitor(c.contactId, d, cfg))
    sendAdminWarning(d, c.contactId, 'Debitor konnte nicht angelegt werden', cfg);

  sendEmails(d, c.contactId, built._mandateRef, typ, cfg);
  return { success: true, contactId: c.contactId };
}

// ============================================================
// E-MAILS
// ============================================================
function sendAdminWarning(d, contactId, message, cfg) {
  try {
    MailApp.sendEmail({
      to:      cfg.adminEmail,
      subject: '⚠️ BL-Mitgliedsantrag: ' + message
        + ' – ' + (d.vorname||'') + ' ' + (d.nachname||''),
      body: 'Kontakt-ID: ' + contactId + '\n'
          + 'Name:       ' + (d.vorname||'') + ' ' + (d.nachname||'') + '\n'
          + 'E-Mail:     ' + (d.email||'') + '\n\n'
          + 'Hinweis: '  + message,
    });
  } catch(e) { Logger.log('⚠️ Admin-Mail Fehler: ' + e.message); }
}

function sendEmails(d, contactId, mandateRef, typ, cfg) {
  try {
    const email      = (d.email || '').trim();
    const fullName   = (d.vorname||'').trim() + ' ' + (d.nachname||'').trim();
    const dateStr    = new Date().toLocaleDateString('de-DE',
      { day: '2-digit', month: '2-digit', year: 'numeric' });
    const ibanMasked = (d.iban||'').replace(/\s/g,'')
      .replace(/^(.{4})(.+)(.{4})$/, '$1 •••• •••• •••• $3');
    const pdfBlob    = buildPdf(d, fullName, mandateRef, dateStr, typ, ibanMasked);
    const anrede     = d.geschlecht === 'femalePerson' ? 'Liebe' : 'Lieber';

    if (email) {
      MailApp.sendEmail({
        to:          email,
        bcc:         cfg.adminEmail,
        subject:     'Dein Mitgliedsantrag bei den Basketball Löwen Erfurt e.V. – Eingangsbestätigung',
        htmlBody:    buildMemberEmail(d, fullName, dateStr, typ, anrede, cfg),
        name:        cfg.senderName,
        replyTo:     cfg.adminEmail,
        attachments: [pdfBlob],
      });
    }
    MailApp.sendEmail({
      to:          cfg.adminEmail,
      subject:     'Neuer Mitgliedsantrag (' + typ + '): ' + fullName,
      htmlBody:    buildAdminEmail(d, fullName, mandateRef, dateStr, typ, ibanMasked, contactId, cfg),
      name:        cfg.senderName,
      attachments: [pdfBlob],
    });
    Logger.log('✅ E-Mails versendet → ' + email + ' + ' + cfg.adminEmail);
  } catch(e) { Logger.log('⚠️ E-Mail-Fehler: ' + e.message); }
}

// ============================================================
// PDF
// ============================================================
function buildPdf(d, fullName, mandateRef, dateStr, typ, ibanMasked) {
  const html     = buildPdfHtml(d, fullName, mandateRef, dateStr, typ, ibanMasked);
  const fileName = 'Mitgliedsantrag_BL_' + fullName.replace(/\s/g, '_') + '_' + dateStr.replace(/\./g,'-');
  const tmp      = DriveApp.getRootFolder().createFile(
    Utilities.newBlob(html, 'text/html', 'antrag.html'));
  const conv     = Drive.Files.copy(
    { title: fileName, mimeType: MimeType.GOOGLE_DOCS },
    tmp.getId(), { convert: true });
  const pdf = DriveApp.getFileById(conv.id)
    .getAs(MimeType.PDF).setName(fileName + '.pdf');
  tmp.setTrashed(true);
  DriveApp.getFileById(conv.id).setTrashed(true);
  return pdf;
}

function buildPdfHtml(d, fullName, mandateRef, dateStr, typ, ibanMasked) {
  const gebDatum = (d.geburtsdatum || '').split('-').reverse().join('.');
  const r = (l, v) => v
    ? '<tr><td style="width:42%;color:#555;font-weight:bold;padding:4px 6px">'
      + l + '</td><td style="padding:4px 6px">' + v + '</td></tr>'
    : '';
  return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>'
    + 'body{font-family:Arial,sans-serif;font-size:11pt;color:#111;margin:2cm}'
    + 'h1{font-size:16pt;border-bottom:2px solid #1B2D5E;padding-bottom:6px}'
    + 'h2{font-size:10pt;text-transform:uppercase;letter-spacing:.06em;'
    + 'border-bottom:1px solid #ccc;padding-bottom:3px;margin:18px 0 8px;color:#1B2D5E}'
    + 'table{width:100%;border-collapse:collapse}'
    + '.logo{font-size:13pt;font-weight:bold;color:#1B2D5E}'
    + '.meta{font-size:9pt;color:#666;margin-bottom:20px}'
    + '.footer{margin-top:40px;font-size:9pt;color:#888;'
    + 'border-top:1px solid #ddd;padding-top:8px}'
    + '</style></head><body>'
    + '<p class="logo">Basketball Löwen Erfurt e.V.</p>'
    + '<h1>Mitgliedsantrag</h1>'
    + '<p class="meta">Antragsdatum: ' + dateStr
    + ' &nbsp;|&nbsp; Typ: ' + typ
    + ' &nbsp;|&nbsp; Mandatsreferenz: ' + mandateRef + '</p>'
    + '<h2>Persönliche Daten</h2>'
    + '<table>' + r('Vorname', d.vorname) + r('Nachname', d.nachname)
    + r('Geburtsdatum', gebDatum) + '</table>'
    + '<h2>Kontaktdaten</h2>'
    + '<table>' + r('E-Mail', d.email) + r('Telefon', d.telefon)
    + r('Adresse', (d.strasse ? d.strasse + ', ' : '') + (d.plz||'') + ' ' + (d.ort||''))
    + '</table>'
    + '<h2>Bankverbindung</h2>'
    + '<table>' + r('Kontoinhaber', d.kontoinhaber) + r('IBAN', ibanMasked)
    + r('Gläubiger-ID', SEPA.glaeubigerID)
    + r('Mandatstyp', SEPA.mandatstyp)
    + r('Zahlungsintervall', SEPA.intervall)
    + r('Mandatsreferenz', mandateRef)
    + r('Mandatsdatum', dateStr) + '</table>'
    + '<h2>Einwilligung</h2>'
    + '<p style="font-size:10pt;line-height:1.5">Die antragstellende Person hat die '
    + 'Datenschutzerklärung sowie Satzung und Beitragsordnung der Basketball Löwen '
    + 'Erfurt e.V. zur Kenntnis genommen und am ' + dateStr + ' online zugestimmt.</p>'
    + '<div class="footer">Basketball Löwen Erfurt e.V. &nbsp;·&nbsp; '
    + 'basketball-loewen.com &nbsp;·&nbsp; Erstellt am ' + dateStr
    + '</div></body></html>';
}

function buildMemberEmail(d, fullName, dateStr, typ, anrede, cfg) {
  const gebDatum = (d.geburtsdatum||'').split('-').reverse().join('.');
  const row = (l, v, shade) =>
    '<tr style="' + (shade ? 'background:#fafafa' : '') + '">'
    + '<td style="padding:5px 10px;color:#555;width:42%">' + l + '</td>'
    + '<td style="padding:5px 10px">' + v + '</td></tr>';
  return '<div style="font-family:Arial,sans-serif;max-width:600px;color:#111">'
    + '<p style="font-size:13pt;font-weight:bold;border-bottom:2px solid #1B2D5E;'
    + 'padding-bottom:6px;color:#1B2D5E">Basketball Löwen Erfurt e.V.</p>'
    + '<p>' + anrede + ' ' + (d.vorname||fullName) + ',</p>'
    + '<p>vielen Dank für deinen Mitgliedsantrag bei den '
    + '<strong>Basketball Löwen Erfurt e.V.</strong> '
    + 'Wir haben deine Daten erhalten und werden deinen Antrag zeitnah bearbeiten.</p>'
    + '<p>Im Anhang findest du eine Kopie deines Antrags als PDF.</p>'
    + '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:10pt">'
    + '<tr style="background:#f5f5f5"><th colspan="2" style="text-align:left;padding:8px 10px;'
    + 'font-size:9pt;text-transform:uppercase;letter-spacing:.05em;color:#555">'
    + 'Deine Daten</th></tr>'
    + row('Name', fullName)
    + row('Geburtsdatum', gebDatum, true)
    + row('Mitgliedschaft', typ)
    + row('Antragsdatum', dateStr, true)
    + '</table>'
    + '<p>Bei Fragen erreichst du uns unter '
    + '<a href="mailto:' + cfg.adminEmail + '" style="color:#E8761A">'
    + cfg.adminEmail + '</a>.</p>'
    + '<p>Wir freuen uns auf dich!<br><br>'
    + '<strong style="color:#1B2D5E">Basketball Löwen Erfurt e.V.</strong><br>'
    + '<a href="https://basketball-loewen.com" style="color:#E8761A">'
    + 'basketball-loewen.com</a></p>'
    + '<p style="font-size:8pt;color:#aaa;border-top:1px solid #eee;'
    + 'margin-top:20px;padding-top:8px">Diese E-Mail wurde automatisch generiert.</p>'
    + '</div>';
}

function buildAdminEmail(d, fullName, mandateRef, dateStr, typ, ibanMasked, contactId, cfg) {
  const gebDatum = (d.geburtsdatum||'').split('-').reverse().join('.');
  const r = (l, v, shade) =>
    '<tr style="' + (shade ? 'background:#f5f5f5' : '') + '">'
    + '<td style="padding:5px 10px;color:#555;width:40%;font-weight:bold">' + l + '</td>'
    + '<td style="padding:5px 10px">' + (v||'–') + '</td></tr>';
  return '<div style="font-family:Arial,sans-serif;max-width:620px;color:#111">'
    + '<p style="font-size:13pt;font-weight:bold;border-bottom:2px solid #1B2D5E;'
    + 'padding-bottom:6px;color:#1B2D5E">Basketball Löwen – Neuer Mitgliedsantrag</p>'
    + '<p>Ein neuer Mitgliedsantrag ist eingegangen und wurde in campai angelegt.</p>'
    + '<table style="width:100%;border-collapse:collapse;font-size:10pt;margin:16px 0">'
    + r('Typ', typ, true)
    + r('Antragsdatum', dateStr)
    + r('campai-ID', contactId, true)
    + r('Name', fullName)
    + r('Geburtsdatum', gebDatum, true)
    + r('E-Mail', d.email)
    + r('Telefon', d.telefon, true)
    + r('Adresse', (d.strasse ? d.strasse + ', ' : '') + (d.plz||'') + ' ' + (d.ort||''))
    + r('Kontoinhaber', d.kontoinhaber, true)
    + r('IBAN', ibanMasked)
    + r('Mandatsreferenz', mandateRef, true)
    + '</table>'
    + '<p style="font-size:9pt;color:#888">Im Anhang befindet sich der Antrag als PDF.<br>'
    + 'Bitte überprüfe und bestätige das Mitglied in campai.</p></div>';
}

// ============================================================
// GET – Health-Check
// ============================================================
function doGet() {
  return jsonResponse({ status: 'BL Mitgliedsantrag v2.0 aktiv' });
}

// ============================================================
// POST – Hauptlogik
// ============================================================
function doPost(e) {
  try {
    const cfg = getCFG();
    const d   = JSON.parse(e.postData.contents);

    const botErr = validateBotToken(d);
    if (botErr) return jsonResponse({ success: false, error: botErr });

    const base = ['memberType', 'vorname', 'nachname', 'iban', 'kontoinhaber'];
    for (const f of base) {
      if (!d[f]) return jsonResponse({ success: false, error: 'Pflichtfeld fehlt: ' + f });
    }

    const emailForRL = d.email || d.vorname + d.nachname;
    const rlErr = checkRateLimit(emailForRL);
    if (rlErr) return jsonResponse({ success: false, error: rlErr });

    if (Math.random() < 0.1) cleanupRateLimitKeys();

    let result;
    switch (d.memberType) {
      case 'fan':     result = handleFan(d, cfg);     break;
      case 'spieler': result = handleSpieler(d, cfg);  break;
      case 'schule':  result = handleSchule(d, cfg);   break;
      case 'foerder': result = handleFoerder(d, cfg);  break;
      default:
        return jsonResponse({
          success: false,
          error:   'Unbekannter Mitgliedschaftstyp: ' + d.memberType,
        });
    }
    return jsonResponse(result);

  } catch(err) {
    Logger.log('❌ Exception: ' + err.message + '\n' + err.stack);
    return jsonResponse({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// ============================================================
// TEST
// ============================================================
// Listet alle Mandanten der Finance API auf
function testListMandates() {
  const p = PropertiesService.getScriptProperties();
  const finKey = p.getProperty('CAMPAI_FINANCE_API_KEY');
  const finOrg = p.getProperty('CAMPAI_FINANCE_ORG_ID');
  Logger.log('Finance API-Key: ' + (finKey ? finKey.substring(0, 8) + '...' : 'FEHLT'));
  Logger.log('Finance Org-ID:  ' + (finOrg || 'FEHLT'));

  // Versuche auch mit alter Org-ID falls Finance Org-ID nicht funktioniert
  const orgId = finOrg;
  const altOrgId = p.getProperty('CAMPAI_ORG_ID');
  Logger.log('Alt Org-ID: ' + (altOrgId || 'FEHLT'));

  // Test mit Finance Org-ID
  const res = UrlFetchApp.fetch(
    'https://cloud.campai.com/api/organizations/' + altOrgId + '/mandates/list',
    {
      method: 'post',
      headers: { 'X-API-Key': finKey, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ limit: 50, returnCount: true }),
      muteHttpExceptions: true,
    }
  );
  Logger.log('HTTP ' + res.getResponseCode());
  Logger.log(res.getContentText().substring(0, 1000));
}

function testResetRateLimit() {
  cleanupRateLimitKeys();
  // Alle heutigen Keys auch löschen
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let del = 0;
  for (const key in all) {
    if (key.indexOf('rl_') === 0) { props.deleteProperty(key); del++; }
  }
  Logger.log('🧹 Alle Rate-Limit-Keys gelöscht: ' + del);
}

function testDoPost() {
  const ts = Math.floor(Date.now() / 1000) - 15;
  const tk = Utilities.base64Encode(String(ts * 7 + BOT.tokenSalt));
  const result = doPost({ postData: { contents: JSON.stringify({
    memberType:   'fan',
    vorname:      'Max',
    nachname:     'Mustermann',
    geburtsdatum: '1990-05-15',
    geschlecht:   'malePerson',
    email:        'max@beispiel.de',
    telefon:      '0361 123456',
    strasse:      'Musterstraße 1',
    plz:          '99085',
    ort:          'Erfurt',
    kontoinhaber: 'Max Mustermann',
    iban:         'DE89370400440532013000',
    faxNummer:    '',
    familyMembers: [],
    _ts: ts, _tk: tk,
  })}});
  Logger.log('Test: ' + result.getContent());
}
