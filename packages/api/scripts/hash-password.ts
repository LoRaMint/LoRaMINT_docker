/**
 * Turns a password into the hash `ADMIN_PASSWORD_HASH` expects.
 *
 * Asked for rather than taken as an argument, and read without echo. A password
 * on the command line ends up in the shell history and, for as long as the
 * process lives, in the output of `ps` for every other user on the machine -
 * which would defeat the point of not putting it in the environment.
 *
 *     bun scripts/hash-password.ts
 *     docker exec -it loramint-app-1 bun scripts/hash-password.ts
 *
 * Argon2id, through Bun's own implementation. The hash carries its parameters,
 * so a future change of cost does not invalidate what is already configured.
 */

const prompt = async (label: string): Promise<string> => {
  process.stdout.write(label);

  // Raw mode turns off the terminal's own echo, so nothing appears while typing
  // and nothing is left on the screen afterwards. Without a terminal - a pipe,
  // a CI job - there is nothing to turn off and the line is simply read.
  const stdin = process.stdin;
  const interactive = stdin.isTTY === true;
  if (interactive) stdin.setRawMode(true);

  let value = "";
  for await (const chunk of stdin) {
    for (const byte of chunk as Uint8Array) {
      // Enter
      if (byte === 0x0d || byte === 0x0a) {
        if (interactive) stdin.setRawMode(false);
        process.stdout.write("\n");
        return value;
      }
      // Ctrl-C
      if (byte === 0x03) {
        if (interactive) stdin.setRawMode(false);
        process.stdout.write("\nAbgebrochen.\n");
        process.exit(1);
      }
      // Backspace / Delete
      if (byte === 0x7f || byte === 0x08) {
        value = value.slice(0, -1);
        continue;
      }
      value += String.fromCharCode(byte);
    }
    if (!interactive) break;
  }

  if (interactive) stdin.setRawMode(false);
  return value.replace(/\r?\n$/, "");
};

const password = await prompt("Passwort für das Einrichtungskonto: ");
if (password.length === 0) {
  console.error("Kein Passwort eingegeben.");
  process.exit(1);
}
if (password.length < 12) {
  // Refused rather than warned about: this account holds admin rights and its
  // password sits in a place that is easy to copy around by accident.
  console.error(
    `Zu kurz (${password.length} Zeichen). Mindestens 12 – dieses Konto hat ` +
      `Administratorrechte.`,
  );
  process.exit(1);
}

const again = await prompt("Zur Bestätigung noch einmal:  ");
if (again !== password) {
  console.error("Die beiden Eingaben stimmen nicht überein.");
  process.exit(1);
}

const hash = await Bun.password.hash(password, { algorithm: "argon2id" });

console.log("\nIn die Umgebung eintragen:\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log(
  "\nDer Klartext taucht nirgends auf – weder hier, noch in der Shell-Historie,\n" +
    "noch in der Prozessliste. Ist ADMIN_PW gesetzt, kann es jetzt weg.",
);
process.exit(0);
