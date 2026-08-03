import type { ResourceSpec } from "../../components/manage/spec";

/**
 * The managed datasets.
 *
 * One page serves all three; they differ only in these definitions. Adding
 * another is a column list, a filter list and three flags - not a new page, and
 * not a second place where access rules could drift apart.
 *
 * What is editable here only decides what the interface offers. The list that
 * actually governs writing is EDITABLE_COLUMNS in services/manage.ts, and it
 * does not read this file.
 */

//====================================
// MEASUREMENTS
//====================================

/**
 * The origin of a measurement - which device sent it, of what type, how its
 * timestamp came about - is deliberately not editable. Correcting a reading is
 * one thing; rewriting where it came from means the row is no longer that
 * measurement. Those columns are off by default in the picker for the same
 * reason: they are rarely what one is looking at.
 */
const measurements: ResourceSpec = {
  key: "measurements",
  path: "/management/data/measurements",
  title: "Messwerte",
  intro:
    "Fehlerhafte Messwerte korrigieren oder entfernen – etwa Ausreißer eines " +
    "defekten Sensors, Testmessungen vom Aufbau oder Werte mit einer falschen " +
    "Ortsangabe.",
  columns: [
    { key: "recorded_at", label: "Zeitpunkt", editable: true, kind: "datetime" },
    { key: "measurand", label: "Messgröße", editable: true },
    { key: "value", label: "Wert", editable: true, kind: "number" },
    { key: "unit", label: "Einheit", editable: true },
    { key: "sensor", label: "Sensor", editable: true },
    { key: "location", label: "Ort", editable: true },
    { key: "device_eui", label: "Gerät", secondary: true },
    { key: "datatype", label: "Datentyp", secondary: true },
    { key: "time_method", label: "Zeitverfahren", secondary: true },
    { key: "created_at", label: "Eingang", kind: "datetime", secondary: true },
    { key: "id", label: "ID", secondary: true },
  ],
  defaultColumns: ["recorded_at", "measurand", "value", "unit", "sensor", "location"],
  sortable: ["recorded_at", "created_at", "value", "measurand", "sensor", "location", "device_eui"],
  defaultSort: "recorded_at",
  filters: [
    { key: "device_eui", label: "Gerät", kind: "select" },
    { key: "sensor", label: "Sensor", kind: "select" },
    { key: "measurand", label: "Messgröße", kind: "select" },
    { key: "location", label: "Ort", kind: "select" },
    { key: "from", label: "von", kind: "date" },
    { key: "to", label: "bis", kind: "date" },
  ],
  capabilities: { edit: true, select: true, remove: true },
};

//====================================
// LOG ENTRIES
//====================================

/**
 * The message is correctable, the origin is not: which device sent it and when
 * it arrived are what make the entry an entry. Every correction is recorded in
 * the change log, so a rewritten message can still be traced back to what the
 * device actually sent.
 */
const logEntries: ResourceSpec = {
  key: "log-entries",
  path: "/management/data/log-entries",
  title: "Logeinträge",
  intro:
    "Meldungen der Geräte durchsehen, korrigieren und entfernen – etwa das " +
    "Rauschen eines Testaufbaus oder eine Meldung, die durch einen Fehler im " +
    "Sketch unbrauchbar formuliert war.",
  columns: [
    { key: "created_at", label: "Zeitpunkt", kind: "datetime" },
    { key: "device_eui", label: "Gerät" },
    { key: "message", label: "Meldung", editable: true },
    { key: "id", label: "ID", secondary: true },
  ],
  defaultColumns: ["created_at", "device_eui", "message"],
  sortable: ["created_at", "device_eui"],
  defaultSort: "created_at",
  filters: [
    { key: "device_eui", label: "Gerät", kind: "select" },
    { key: "q", label: "Suche", kind: "text", placeholder: "Text in der Meldung" },
    { key: "from", label: "von", kind: "date" },
    { key: "to", label: "bis", kind: "date" },
  ],
  capabilities: { edit: true, select: true, remove: true },
};

//====================================
// AUDIT LOG
//====================================

/**
 * Read-only, and not because the buttons were left out: the database role the
 * management pages write through holds no UPDATE or DELETE on this table. A log
 * that can be tidied up from the same interface it watches proves nothing.
 * Correcting an entry is possible only through the SQL console as an
 * administrator.
 */
const auditLog: ResourceSpec = {
  key: "audit",
  path: "/management/data/audit",
  title: "Änderungsprotokoll",
  intro:
    "Wer hat wann was geändert oder gelöscht – und mit Admin-Rechten lässt sich " +
    "ein Vorgang wieder zurücknehmen. Einträge verschwinden dabei nie: die " +
    "Rücknahme kommt als eigener Vorgang dazu.",
  columns: [
    { key: "occurred_at", label: "Zeitpunkt", kind: "datetime" },
    { key: "username", label: "Benutzer" },
    { key: "action", label: "Aktion" },
    { key: "table_name", label: "Datenmenge" },
    { key: "reason", label: "Grund" },
    { key: "row_id", label: "Zeile", secondary: true },
    { key: "batch_id", label: "Vorgang", secondary: true },
  ],
  defaultColumns: ["occurred_at", "username", "action", "table_name", "reason"],
  sortable: ["occurred_at", "username", "action"],
  defaultSort: "occurred_at",
  filters: [
    { key: "username", label: "Benutzer", kind: "text", placeholder: "Anmeldename" },
    { key: "action", label: "Aktion", kind: "select" },
    { key: "table_name", label: "Datenmenge", kind: "select" },
    { key: "from", label: "von", kind: "date" },
    { key: "to", label: "bis", kind: "date" },
  ],
  capabilities: { edit: false, select: false, remove: false },
};

//====================================
// PUBLIC API
//====================================

export const resources = { measurements, logEntries, auditLog };

/** The overview cards, in the order they are shown. */
export const allResources: ResourceSpec[] = [measurements, logEntries, auditLog];
