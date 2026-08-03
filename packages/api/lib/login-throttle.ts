/**
 * Locking out after too many wrong passwords - by address, and only then by name.
 *
 * Without this the form answers as fast as it is asked - 20 attempts a second,
 * measured - which makes guessing a password a matter of patience rather than of
 * luck, and makes every attempt cost the directory a bind.
 *
 * Counting per login name alone would stop the guessing and hand out a new
 * weapon: anyone who knows a name could keep that account locked for as long as
 * they cared to. So the count that matters is per *address*, and the name is
 * only locked when the failures came from several addresses at once:
 *
 *   address  five failures inside five minutes are allowed, whatever names they
 *            were aimed at; the sixth locks that address for five minutes. This
 *            is the defence - it stops the person guessing, and touches nobody
 *            else.
 *
 *   name     locked only once failures for it have come from more than five
 *            *different* addresses inside the window - the same allowance the
 *            address gets, counted in sources rather than in attempts. A single
 *            source can only ever contribute one address, so no one attacker can
 *            lock a real user out. It takes a genuinely distributed attempt -
 *            which is exactly when locking the name is the right answer.
 *
 * While either lock stands the password is not checked at all, so a lock cannot
 * be extended by hammering it and a locked request costs no LDAP round trip. The
 * locks run out on their own; there is nothing for an administrator to clear.
 *
 * Kept in memory on purpose. It is a speed bump, not a security boundary: a
 * restart forgets every lock, and a second instance would keep its own count.
 * Both are acceptable for what this defends against; a durable store would mean
 * a table, a migration and a write on every failed sign-in.
 */

//====================================
// TYPES
//====================================

type AddressState = {
  /** When the recent failures happened, oldest first. */
  failures: number[];
  /** Unix milliseconds until which the address is locked, or 0. */
  lockedUntil: number;
};

type NameState = {
  /** Each address that has failed for this name, and when it last did. */
  addresses: Map<string, number>;
  /** Unix milliseconds until which the name is locked, or 0. */
  lockedUntil: number;
};

export type ThrottleLimits = {
  /** How far back a failure still counts. */
  windowMs: number;
  /** How long a lock lasts. */
  lockMs: number;
  /** Failures tolerated from one address inside the window - the next one locks. */
  maxFailuresPerAddress: number;
  /** Distinct addresses that may fail for one name before the name is locked. */
  maxAddressesPerName: number;
};

export const DEFAULT_LIMITS: ThrottleLimits = {
  windowMs: 5 * 60_000,
  lockMs: 5 * 60_000,
  maxFailuresPerAddress: 5,
  maxAddressesPerName: 5,
};

/**
 * How many entries to track per map before sweeping. Someone cycling through
 * invented names or forged addresses would otherwise grow them without limit,
 * and the memory of a defensive measure must not itself become the way in.
 */
const SWEEP_AT = 1024;

//====================================
// THE THROTTLE
//====================================

export class LoginThrottle {
  private readonly addresses = new Map<string, AddressState>();
  private readonly names = new Map<string, NameState>();

  constructor(private readonly limits: ThrottleLimits = DEFAULT_LIMITS) {}

  private key(value: string) {
    return value.trim().toLowerCase();
  }

  /**
   * Milliseconds left before this name may be tried from this address again,
   * counting whichever lock has longer to run.
   *
   * `now` is a parameter rather than a call to `Date.now()` inside, so the tests
   * can let five minutes pass without waiting five minutes.
   */
  lockedFor(username: string, address: string, now: number = Date.now()): number {
    return Math.max(
      this.remaining(this.names, this.key(username), now),
      this.remaining(this.addresses, this.key(address), now),
    );
  }

  /**
   * Records one wrong password and returns the lock now in force, or 0.
   *
   * Call this only for an actually wrong password. An unreachable directory is
   * not the user's mistake, and counting it would lock everyone out of a site
   * that is merely having a bad day.
   */
  recordFailure(username: string, address: string, now: number = Date.now()): number {
    const name = this.key(username);
    const from = this.key(address);
    if (!name || !from) return 0;

    // Already locked: leave both deadlines where they are. The route refuses
    // before ever getting here, and this is what makes that guarantee
    // independent of the route remembering to.
    const standing = this.lockedFor(username, address, now);
    if (standing > 0) return standing;

    if (this.addresses.size >= SWEEP_AT) this.sweepAddresses(now);
    if (this.names.size >= SWEEP_AT) this.sweepNames(now);

    return Math.max(
      this.countAddress(from, now),
      this.countName(name, from, now),
    );
  }

  /** A successful sign-in clears both counts. */
  recordSuccess(username: string, address: string) {
    const name = this.key(username);
    const from = this.key(address);
    if (name) this.names.delete(name);
    if (from) this.addresses.delete(from);
  }

  //====================================
  // COUNTING
  //====================================

  /** Failures from one address, whatever name they were aimed at. */
  private countAddress(from: string, now: number): number {
    const previous = this.addresses.get(from);
    const failures = (previous?.failures ?? []).filter(
      (at) => now - at < this.limits.windowMs,
    );
    failures.push(now);

    if (failures.length > this.limits.maxFailuresPerAddress) {
      this.addresses.set(from, { failures: [], lockedUntil: now + this.limits.lockMs });
      return this.limits.lockMs;
    }
    this.addresses.set(from, { failures, lockedUntil: 0 });
    return 0;
  }

  /**
   * How many *different* addresses have failed for this name. Attempts are not
   * counted, addresses are - that is the whole difference between a defence and
   * a way to lock somebody out.
   */
  private countName(name: string, from: string, now: number): number {
    const previous = this.names.get(name);
    const addresses = new Map<string, number>();
    for (const [seen, at] of previous?.addresses ?? []) {
      if (now - at < this.limits.windowMs) addresses.set(seen, at);
    }
    addresses.set(from, now);

    if (addresses.size > this.limits.maxAddressesPerName) {
      this.names.set(name, { addresses: new Map(), lockedUntil: now + this.limits.lockMs });
      return this.limits.lockMs;
    }
    this.names.set(name, { addresses, lockedUntil: 0 });
    return 0;
  }

  //====================================
  // BOOKKEEPING
  //====================================

  /** Milliseconds left on an entry's lock, forgetting it once it has run out. */
  private remaining(
    map: Map<string, { lockedUntil: number }>,
    key: string,
    now: number,
  ): number {
    if (!key) return 0;
    const entry = map.get(key);
    if (!entry) return 0;
    if (entry.lockedUntil > now) return entry.lockedUntil - now;
    // The lock has run out: forget the entry, so the next five minutes start
    // with a full allowance rather than one attempt.
    if (entry.lockedUntil > 0) map.delete(key);
    return 0;
  }

  private sweepAddresses(now: number) {
    for (const [key, entry] of this.addresses) {
      const newest = entry.failures[entry.failures.length - 1] ?? 0;
      if (entry.lockedUntil <= now && now - newest >= this.limits.windowMs) {
        this.addresses.delete(key);
      }
    }
    this.evictSoonest(this.addresses);
  }

  private sweepNames(now: number) {
    for (const [key, entry] of this.names) {
      const newest = Math.max(0, ...entry.addresses.values());
      if (entry.lockedUntil <= now && now - newest >= this.limits.windowMs) {
        this.names.delete(key);
      }
    }
    this.evictSoonest(this.names);
  }

  /**
   * Last resort when sweeping freed nothing: drop the locks that expire soonest.
   * Ending a lock early only restores normal service to whoever it applied to,
   * so this cannot be turned into a way past the throttle.
   */
  private evictSoonest(map: Map<string, { lockedUntil: number }>) {
    if (map.size < SWEEP_AT) return;
    const bySoonest = [...map.entries()].sort(
      (a, b) => a[1].lockedUntil - b[1].lockedUntil,
    );
    for (const [key] of bySoonest.slice(0, map.size - SWEEP_AT + 1)) {
      map.delete(key);
    }
  }

  /** How much is being tracked. For the tests and nothing else. */
  get size() {
    return this.addresses.size + this.names.size;
  }
}

/** The instance the login route uses. */
export const loginThrottle = new LoginThrottle();
