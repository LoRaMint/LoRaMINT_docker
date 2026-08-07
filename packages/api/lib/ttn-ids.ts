/**
 * The identifiers a device is registered with, and what counts as one.
 *
 * Kept separate from services/ttn.ts so it stays pure and testable: that module
 * imports the config, which reads environment variables, and it talks to the
 * network. Nothing here does either.
 *
 * Every value in here arrives by copy rather than by typing. The LA66 modules
 * ship with DevEUI, AppEUI and AppKey printed on them and the TTN console shows
 * them in byte pairs - `A8 40 41 D6 C1 84 DB 82` - so that is the shape people
 * have in their clipboard. Refusing it over the spaces would be pedantry with a
 * retype as the punishment, so the separators are simply dropped.
 */

/**
 * Hex with the separators people paste along removed, upper case.
 *
 * Spaces, dashes and colons all appear in the wild depending on where the value
 * was copied from. Anything else stays in the string and makes the length or the
 * character check below fail, which is the point: this drops formatting, it does
 * not salvage a value that is wrong.
 */
const stripSeparators = (raw: string) => raw.replace(/[\s:-]/g, "").toUpperCase();

const hexOfLength = (raw: string, digits: number) => {
  const value = stripSeparators(raw);
  return value.length === digits && /^[0-9A-F]+$/.test(value) ? value : null;
};

/**
 * A DevEUI or JoinEUI/AppEUI: eight bytes. Upper case on the way out, because
 * that is how TTN writes them in the JSON and how `measurements.device_eui`
 * already holds them, and a device whose EUI matches only in case would show up
 * as two rows on the overview.
 */
export const normaliseEui = (raw: string): string | null => hexOfLength(raw, 16);

/** An AppKey: sixteen bytes. */
export const normaliseAppKey = (raw: string): string | null => hexOfLength(raw, 32);

/**
 * The Things Stack's rule for identifiers: lower case letters, digits and
 * dashes, starting and ending on a letter or digit, no two dashes in a row, 3 to
 * 36 characters. Checked here so a rejected id is a sentence under the field
 * rather than a 400 from TTN with a gRPC field path in it.
 */
const DEVICE_ID = /^[a-z0-9](?:-?[a-z0-9]){2,35}$/;

export const normaliseDeviceId = (raw: string): string | null => {
  const value = raw.trim().toLowerCase();
  return DEVICE_ID.test(value) ? value : null;
};

/**
 * The id to offer for a device whose DevEUI is already typed in.
 *
 * `eui-` plus the DevEUI is what the TTN console itself suggests, and it is the
 * one scheme that cannot collide: the EUI is unique by construction. It is only
 * a proposal - the field stays editable, and a name like `klasse-8b-fenster`
 * says far more at a glance.
 */
export const suggestDeviceId = (rawEui: string): string | null => {
  const eui = normaliseEui(rawEui);
  return eui ? `eui-${eui.toLowerCase()}` : null;
};

/**
 * Hex in byte pairs, the way the TTN console shows it. Used for EUIs and, on the
 * one page that may show it, for an AppKey - a 32-digit string in one piece is
 * unreadable and impossible to compare against a sticker.
 */
export const formatHex = (value: string): string =>
  stripSeparators(value).replace(/(.{2})(?=.)/g, "$1 ");

/** An EUI in byte pairs. */
export const formatEui = (eui: string): string => formatHex(eui);

//====================================
// THE FORM
//====================================

/** What the registration form collects, exactly as it was submitted. */
export type DeviceInput = {
  deviceId: string;
  name: string;
  devEui: string;
  joinEui: string;
  appKey: string;
};

/** The same, once every value has been found acceptable. */
export type NormalisedDevice = {
  deviceId: string;
  name: string;
  devEui: string;
  joinEui: string;
  appKey: string;
};

/**
 * How long a device name may be. TTN allows far more; this is about the
 * overview staying readable.
 */
export const MAX_NAME_LENGTH = 50;

/**
 * Checks the whole form and answers with one sentence per field that is wrong,
 * keyed by field name - the same shape the management pages already use for
 * their cell-level problems, so the pages can render it the same way.
 *
 * Every field is checked, not just the first one to fail: sending someone back
 * four times for four fields of one form is four round trips for information we
 * had all along.
 */
export const deviceProblems = (input: DeviceInput): Record<string, string> => {
  const problems: Record<string, string> = {};

  if (normaliseDeviceId(input.deviceId) === null) {
    problems.deviceId =
      "Die Geräte-ID darf nur Kleinbuchstaben, Ziffern und Bindestriche " +
      "enthalten, muss mit einem Buchstaben oder einer Ziffer beginnen und " +
      "enden und zwischen 3 und 36 Zeichen lang sein.";
  }
  if (input.name.trim().length === 0) {
    problems.name = "Bitte einen Namen angeben – er steht später in der Übersicht.";
  } else if (input.name.trim().length > MAX_NAME_LENGTH) {
    problems.name = `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`;
  }
  if (normaliseEui(input.devEui) === null) {
    problems.devEui = "Die DevEUI besteht aus 16 Hexzeichen (8 Bytes).";
  }
  if (normaliseEui(input.joinEui) === null) {
    problems.joinEui = "Die AppEUI/JoinEUI besteht aus 16 Hexzeichen (8 Bytes).";
  }
  if (normaliseAppKey(input.appKey) === null) {
    problems.appKey = "Der AppKey besteht aus 32 Hexzeichen (16 Bytes).";
  }

  return problems;
};

/**
 * The form's values in the shape the TTN calls want, or null when anything is
 * wrong. Callers are expected to have asked `deviceProblems` first; this returns
 * null rather than throwing so that a caller who forgets cannot register a
 * device with a half-parsed identifier.
 */
export const normaliseDevice = (input: DeviceInput): NormalisedDevice | null => {
  const deviceId = normaliseDeviceId(input.deviceId);
  const devEui = normaliseEui(input.devEui);
  const joinEui = normaliseEui(input.joinEui);
  const appKey = normaliseAppKey(input.appKey);
  const name = input.name.trim();

  if (!deviceId || !devEui || !joinEui || !appKey) return null;
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;

  return { deviceId, name, devEui, joinEui, appKey };
};
