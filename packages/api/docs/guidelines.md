# Coding Guidelines for LLMs

This document defines the coding standards for this codebase. Follow these rules strictly when generating or modifying code.

---

## Fundamental Principles

These three principles override everything else. When in doubt, apply them in this order:

### 1. YAGNI (You Aren't Gonna Need It)

**Don't build for hypothetical future requirements.**

- Only implement what is explicitly needed RIGHT NOW
- No "just in case" abstractions, parameters, or features
- Delete code that isn't used — don't comment it out "for later"
- If a feature might be needed "someday", wait until someday arrives

```typescript
// BAD - building for hypothetical future
const createUser = async (data: CreateUser, options?: {
  sendWelcomeEmail?: boolean;    // "might need this later"
  assignDefaultRole?: boolean;   // "could be useful"
  notifyAdmins?: boolean;        // "just in case"
}): Promise<User> => { ... };

// GOOD - only what's needed now
const createUser = async (data: CreateUser): Promise<User> => { ... };
```

### 2. DRY (Don't Repeat Yourself)

**Every piece of knowledge should have a single, authoritative source.**

- Extract repeated code into functions ONLY when used 3+ times
- Don't DRY prematurely — duplication is better than wrong abstraction
- Types, constants, and business logic should exist in ONE place

```typescript
// BAD - same validation logic in multiple places
const createNote = async (data) => {
  if (!data.title || data.title.length > 255) throw new Error("Invalid title");
  // ...
};
const updateNote = async (data) => {
  if (!data.title || data.title.length > 255) throw new Error("Invalid title");
  // ...
};

// GOOD - single source of truth
const validateTitle = (title: string): boolean => 
  title.length > 0 && title.length <= 255;
```

### 3. KISS (Keep It Simple, Stupid)

**The simplest solution that works is the best solution.**

- Prefer boring, obvious code over clever code
- If a junior developer can't understand it in 30 seconds, simplify it
- Avoid premature optimization — make it work, then make it fast (if needed)
- Fewer abstractions = fewer bugs

```typescript
// BAD - over-engineered
const processItems = <T, R>(
  items: T[],
  transformer: (item: T) => R,
  filter: (item: R) => boolean,
  reducer: (acc: R[], item: R) => R[]
): R[] => items.map(transformer).filter(filter).reduce(reducer, []);

// GOOD - simple and obvious
const getActiveUserNames = (users: User[]): string[] =>
  users.filter(u => u.isActive).map(u => u.name);
```

---

## Supporting Principles

| Principle | Rule |
|-----------|------|
| **Predictability** | Same input → same output. Avoid hidden state and side effects. |
| **Explicitness** | No magic. Make dependencies and data flow visible. |
| **Maintainability** | Code is read more than written. Optimize for readability. |

---

## Language & Runtime

- **TypeScript only** — no `.js` files
- **Bun.js runtime** — use Bun APIs where available
- **ES2022+** — use modern syntax (optional chaining, nullish coalescing, etc.)
- **Hono** for HTTP APIs
- **Solid.js** for frontend (SSR + Islands architecture)

---

## Type System

### Use `type`, not `interface`

```typescript
// GOOD
type User = {
  id: string;
  name: string;
};

// BAD
interface User {
  id: string;
  name: string;
}
```

### Let TypeScript infer return types

If your code is type-safe, TypeScript will infer the correct return type. Explicit return types are redundant and violate DRY.

```typescript
// GOOD - TypeScript infers Promise<User | null>
export const getUser = async (id: string) => {
  const user = await db.get<User>(id);
  return user ?? null;
};

// UNNECESSARY - redundant type annotation
export const getUser = async (id: string): Promise<User | null> => { ... };
```

Exception: Add explicit return types only when TypeScript inference fails or produces an overly broad type.

### Use `null` for missing values, never empty strings

```typescript
// GOOD
type Note = {
  parentId: string | null;
  content: string | null;
};

// BAD
type Note = {
  parentId: string; // "" for no parent
  content: string;  // "" for no content
};
```

---

## Function Style

### Arrow functions, no `function` keyword

```typescript
// GOOD
const add = (a: number, b: number): number => a + b;

const fetchUser = async (id: string): Promise<User | null> => {
  const user = await db.get(id);
  return user ?? null;
};

// BAD
function add(a: number, b: number): number {
  return a + b;
}
```

### Single responsibility

Each function does ONE thing. If you need "and" to describe it, split it.

```typescript
// GOOD
const validateEmail = (email: string): boolean => { ... };
const sendEmail = async (to: string, body: string): Promise<void> => { ... };

// BAD
const validateAndSendEmail = async (email: string, body: string): Promise<void> => { ... };
```

### Pure functions when possible

- No side effects (DB writes, mutations, logging)
- Same input always produces same output
- If side effects are necessary, document them clearly

```typescript
// GOOD - pure
const calculateTotal = (items: Item[]): number =>
  items.reduce((sum, item) => sum + item.price, 0);

// GOOD - side effect documented
/** Saves snapshot to database. Mutates `active.isDirty`. */
const saveSnapshot = async (noteId: string): Promise<void> => { ... };
```

---

## Async Patterns

### `async/await` over `.then()` chains

```typescript
// GOOD
const loadUser = async (id: string): Promise<User | null> => {
  const data = await fetch(`/api/users/${id}`);
  const user = await data.json();
  return user;
};

// BAD
const loadUser = (id: string): Promise<User | null> => {
  return fetch(`/api/users/${id}`)
    .then(data => data.json())
    .then(user => user);
};
```

### Handle errors explicitly

```typescript
// GOOD
const result = await doSomething();
if (!result.ok) {
  return { ok: false, error: result.error };
}

// BAD - swallowing errors
try {
  await doSomething();
} catch {
  // ignore
}
```

---

## State Management

### Immutable by default

```typescript
// GOOD
const addItem = (items: Item[], newItem: Item): Item[] => [...items, newItem];

// BAD
const addItem = (items: Item[], newItem: Item): void => {
  items.push(newItem); // mutates input
};
```

### Pass state explicitly, avoid globals

```typescript
// GOOD
const processNote = (note: Note, config: Config): Result => { ... };

// BAD
let globalConfig: Config;
const processNote = (note: Note): Result => {
  // uses globalConfig implicitly
};
```

---

## Documentation

### When to document

| Scenario | Document? |
|----------|-----------|
| Complex algorithm | Yes |
| Non-obvious side effects | Yes |
| Security considerations | Yes |
| Edge cases | Yes |
| Simple getter/setter | No |
| Self-explanatory function | No |

### Documentation style

- Concise, action-oriented
- Start with verb (Returns, Saves, Validates, etc.)
- No redundant type information (TypeScript provides this)
- Use `@example` to show usage
- Use `@security` or `@note` for important warnings

```typescript
// GOOD
/**
 * Encrypt data using AES-GCM
 * @example
 * const encrypted = await encrypt({ payload: "secret", key: "password" });
 * @security Uses PBKDF2 for password stretching (100k iterations)
 */
const encrypt = async (data: { payload: string; key: string }) => { ... };

// BAD - too verbose, redundant type info
/**
 * This function encrypts data using AES-GCM.
 * @param data - The data object
 * @param data.payload - The payload string to encrypt
 * @param data.key - The key string for encryption
 * @returns Promise<string> - The encrypted string
 */
const encrypt = async (data: { payload: string; key: string }): Promise<string> => { ... };
```

### Document side effects explicitly

```typescript
/** 
 * Unloads document from memory. 
 * Side effects: Saves final snapshot, destroys Y.Doc, removes from activeDocuments map.
 */
const unloadDocument = async (noteId: string) => { ... };
```

---

## Error Handling

### Use Result types for expected failures

```typescript
type MutationResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

// GOOD
const updateNote = async (id: string, data: UpdateData): Promise<MutationResult<Note>> => {
  const note = await get(id);
  if (!note) return { ok: false, error: "Note not found", status: 404 };
  // ...
  return { ok: true, data: updated };
};
```

### Throw only for unexpected errors (bugs)

```typescript
// Expected failure → return error
if (!user) return { ok: false, error: "User not found", status: 404 };

// Unexpected failure (bug) → throw
if (!activeDocuments.has(noteId)) {
  throw new Error(`Document not loaded: ${noteId}`);
}
```

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables/Functions | camelCase | `getUserById`, `isActive` |
| Types | PascalCase | `User`, `NoteTreeNode` |
| Constants | SCREAMING_SNAKE_CASE | `SNAPSHOT_INTERVAL`, `MAX_RETRIES` |
| Files | kebab-case or camelCase | `user-service.ts`, `yjsManager.ts` |
| Boolean variables | is/has/can prefix | `isLocked`, `hasChildren`, `canWrite` |

### Be specific

```typescript
// GOOD
const activeDocuments = new Map<string, ActiveDocument>();
const snapshotInterval = 10_000;

// BAD
const docs = new Map();
const interval = 10000;
```

---

## File Organization

### One concern per file

```
service/
├── notes.ts        # Note CRUD operations
├── notebooks.ts    # Notebook CRUD operations
├── yjs-manager.ts  # Yjs document lifecycle
└── index.ts        # Re-exports
```

### Consistent section ordering

```typescript
// 1. Imports
import { sql } from "bun";

// 2. Types
type Note = { ... };

// 3. Constants
const SNAPSHOT_INTERVAL = 10_000;

// 4. Private helpers (not exported)
const mapToNote = (row: DbNote): Note => { ... };

// 5. Public API (exported)
export const get = async (id: string) => { ... };
export const create = async (data: CreateNote) => { ... };
```

### Section dividers for long files

Use visual dividers to separate logical sections in files > 100 lines:

```typescript
//====================================
// TYPES
//====================================

type User = { ... };

//====================================
// HELPERS
//====================================

const validate = (data: unknown) => { ... };

//====================================
// PUBLIC API
//====================================

export const create = async (data: CreateUser) => { ... };
```

### Grouped exports (namespace pattern)

For utility modules, export related functions as a single object:

```typescript
// GOOD - grouped exports
const hash = async (s: string) => { ... };
const randomId = () => { ... };
const generateKey = () => { ... };

export const crypto = { hash, randomId, generateKey };

// Usage: crypto.hash("hello")

// AVOID - many individual exports for related utilities
export const hash = ...;
export const randomId = ...;
export const generateKey = ...;
```

This provides:
- Clear namespace (no import conflicts)
- Discoverability (autocomplete shows all methods)
- Easier mocking in tests

---

## SQL & Database

### Use tagged template literals

```typescript
// GOOD
const [user] = await sql<DbUser[]>`
  SELECT * FROM users WHERE id = ${id}::uuid
`;

// BAD
const [user] = await sql(`SELECT * FROM users WHERE id = '${id}'`);
```

### Return mapped types, not raw DB rows

```typescript
// GOOD
export const get = async (id: string): Promise<Note | null> => {
  const [row] = await sql<DbNote[]>`SELECT ... WHERE id = ${id}::uuid`;
  return row ? mapToNote(row) : null;
};

// BAD - exposes DB structure
export const get = async (id: string): Promise<DbNote | null> => { ... };
```

---

## Frontend (Solid.js)

### Islands for interactivity

- `.island.tsx` = client-side hydrated component
- Regular `.tsx` = server-rendered only

### Props: Max 5, then use context or props object

Island components should have **at most 5 props**. Beyond that:
- Use a **context** if components are nested within a parent island
- Use a **props object** to group related data

```typescript
// BAD - too many props (8)
const ItemDetailPanel = (props: {
  item: SpaceItem;
  columns: SpaceColumn[];
  labels: SpaceLabel[];
  spaceId: string;
  baseUrl: string;
  currentUserId: string;
  comments: SpaceComment[];
  canEdit: boolean;
}) => { ... };

// GOOD - grouped into context object
type ItemDetailContext = {
  item: SpaceItem;
  columns: SpaceColumn[];
  labels: SpaceLabel[];
  comments: SpaceComment[];
};

const ItemDetailPanel = (props: {
  ctx: ItemDetailContext;
  spaceId: string;
  baseUrl: string;
  canEdit: boolean;
}) => { ... };

// BETTER - use Solid context for deeply nested components
const SpaceContext = createContext<SpaceContextValue>();

const SpacePage = () => (
  <SpaceContext.Provider value={{ columns, labels, settings }}>
    <Sidebar />
    <ItemList />
    <DetailPanel />
  </SpaceContext.Provider>
);

// Child accesses via context
const ItemRow = () => {
  const ctx = useContext(SpaceContext);
  // No prop drilling needed
};
```

### URL Query Params: Centralize in helper module

**Never** manipulate URL params directly in components. Create a central helper:

```typescript
// BAD - scattered URL logic in components
const SearchInput = () => {
  const handleSearch = (value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("q", value);
    url.searchParams.delete("page"); // Easy to forget!
    window.location.href = url.toString();
  };
};

// GOOD - centralized URL helper
// src/apps/myapp/frontend/lib/url.ts
export const QueryParams = {
  SEARCH: "q",
  PAGE: "page",
  VIEW: "view",
  SORT: "sort",
} as const;

export const buildUrl = (base: string, params: Partial<FilterState>) => {
  const url = new URL(base, window.location.origin);
  
  // Only set non-default values
  if (params.search) url.searchParams.set(QueryParams.SEARCH, params.search);
  if (params.page && params.page > 1) url.searchParams.set(QueryParams.PAGE, String(params.page));
  // ...
  
  return url.pathname + url.search;
};

export const parseUrl = (url: URL): FilterState => {
  return {
    search: url.searchParams.get(QueryParams.SEARCH) ?? "",
    page: parseInt(url.searchParams.get(QueryParams.PAGE) ?? "1", 10),
    // ...
  };
};

// Component uses helper
const SearchInput = () => {
  const handleSearch = (value: string) => {
    window.location.href = buildUrl(props.baseUrl, { search: value, page: 1 });
  };
};
```

Benefits:
- Query param names defined once (no typos)
- Default handling in one place
- Easy to add/remove params globally

### Cookies: Centralize in settings store

Similar to URL params, cookie handling should be centralized:

```typescript
// BAD - direct cookie manipulation
document.cookie = `view=${view}; path=/; max-age=31536000`;

// GOOD - centralized cookie store
// src/apps/myapp/frontend/lib/settings-store.ts
const COOKIE_NAME = "settings-app-myapp";

type AppSettings = {
  view: ViewType;
  sortOrder: SortOrder;
};

const DEFAULT_SETTINGS: AppSettings = {
  view: "list",
  sortOrder: "desc",
};

// Server-side: parse from cookie header
export const parseSettings = (cookieHeader: string | undefined): AppSettings => {
  if (!cookieHeader) return DEFAULT_SETTINGS;
  try {
    const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (match) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(decodeURIComponent(match[1]!)) };
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
};

// Client-side: read
export const readSettings = (): AppSettings => {
  try {
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${COOKIE_NAME}=`));
    if (cookie) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(decodeURIComponent(cookie.split("=")[1]!)) };
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
};

// Client-side: write
export const writeSettings = (settings: Partial<AppSettings>) => {
  const current = readSettings();
  const updated = { ...current, ...settings };
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(updated))}; path=/; max-age=31536000; SameSite=Lax`;
};
```

### Query params override cookies

For user preferences, use a two-tier system:
1. **Cookie** = user's default preference
2. **URL param** = temporary override (shareable links)

```typescript
// In page.tsx (server-side)
const cookieSettings = parseSettings(c.req.header("Cookie"));
const viewParam = c.req.query("view");

// URL param overrides cookie if present
const currentView = isValidView(viewParam) ? viewParam : cookieSettings.view;
```

---

## Dependencies

### Always ask before installing

Never add dependencies without explicit user approval. Prefer:
1. Built-in Bun/Node APIs
2. Existing dependencies in package.json
3. Simple custom implementation

---

## Code Smells to Avoid

| Smell | Fix |
|-------|-----|
| Function > 50 lines | Split into smaller functions |
| > 3 levels of nesting | Extract to helper or early return |
| Boolean parameters | Use options object or separate functions |
| Comments explaining "what" | Rename to be self-documenting |
| `any` type | Use proper types or `unknown` |
| Mutable default parameters | Use immutable defaults |
| Side effects in getters | Move to explicit mutation function |

---

## Checklist Before Committing

- [ ] No `any` types
- [ ] No `function` keyword (use arrow functions)
- [ ] No `.then()` chains (use async/await)
- [ ] No empty string for missing values (use `null`)
- [ ] No implicit return types on exported functions
- [ ] Side effects are documented
- [ ] Complex logic has brief documentation
- [ ] No console.log (use proper logging)
