# LDAP test directory

A throwaway OpenLDAP server for developing and testing the login. It is defined
as the `openldap` service in `compose.dev.yml`, behind a profile so it does not
start with the usual dev stack.

**Everything in here is a fixture.** The passwords are in the clear in
`seed.ldif` and are public by design — never point a deployment at this
directory.

## Starting it

```bash
docker compose -f compose.dev.yml --profile ldap up -d openldap
```

## It is also the test fixture

`services/ldap.integration.test.ts` runs against this directory, and the
expectations in it encode `seed.ldif` — change one and you have to change the
other. With the container up, `bun test` exercises both bind strategies; without
it, those tests skip themselves and print how to start it, so `bun test` still
works without Docker.

CI starts the container and sets `LDAP_TESTS_REQUIRED=1`, which turns an
unreachable directory into a failure instead of a silent skip. Point the tests
at a different directory with `LDAP_TEST_URL`.

It listens on `localhost:1389` (plain LDAP, no TLS) and loads `seed.ldif` on
first start. To pick up changes to the fixture, recreate the container:

```bash
docker compose -f compose.dev.yml --profile ldap up -d --force-recreate openldap
```

## What is in it

Base DN `dc=loramint,dc=test`, admin `cn=admin,dc=loramint,dc=test` / `adminpw`.

| Login       | Password       | In `loramint` group | Notes                          |
| ----------- | -------------- | ------------------- | ------------------------------ |
| `mruf`      | `geheim123`    | yes                 | has `displayName`              |
| `aschmidt`  | `passwort456`  | yes                 | has `displayName`              |
| `nodisplay` | `passwort789`  | yes                 | no `displayName` — tests the fallback to the login name |
| `extern`    | `extern999`    | **no**              | correct password, must still be rejected by a restricting filter |
| `we, ird*`  | `seltsam000`   | yes                 | DN and filter metacharacters — tests the escaping |

Groups (`ou=groups`, plain `groupOfNames`):

| Group                 | Members                        | Level      |
| --------------------- | ------------------------------ | ---------- |
| `loramint`            | everyone above except `extern` | read-only  |
| `loramint-management` | `aschmidt`                     | management |
| `loramint-admin`      | `mruf`                         | admin      |

Nobody is in more than one, on purpose: the levels form a ladder, so `mruf`
reaches management and reading through the admin group alone. That is what makes
the fixture a test of the ladder rather than of the directory.

Service account for search-and-bind:
`cn=service,ou=system,dc=loramint,dc=test` / `servicepw`.

## Pointing the app at it

Direct bind:

```bash
LDAP_URL=ldap://localhost:1389
LDAP_USER_DN_TEMPLATE='uid={username},ou=people,dc=loramint,dc=test'
SESSION_SECRET=0123456789abcdef0123456789abcdef
```

Search and bind, restricted to the group:

```bash
LDAP_URL=ldap://localhost:1389
LDAP_BIND_DN='cn=service,ou=system,dc=loramint,dc=test'
LDAP_BIND_PASSWORD=servicepw
LDAP_SEARCH_BASE='ou=people,dc=loramint,dc=test'
LDAP_SEARCH_FILTER='(&(uid={username})(employeeType=loramint))'
LDAP_DISPLAY_NAME_ATTRIBUTE=displayName
LDAP_GROUP_SEARCH_BASE='ou=groups,dc=loramint,dc=test'
LDAP_DATA_GROUP=loramint
LDAP_MANAGEMENT_GROUP=loramint-management
LDAP_ADMIN_GROUP=loramint-admin
SESSION_SECRET=0123456789abcdef0123456789abcdef
```

With those set:

| Login       | `/sql`            | `/management/*` |
| ----------- | ----------------- | --------------- |
| `mruf`      | writable          | yes             |
| `aschmidt`  | read-only         | yes             |
| `nodisplay` | read-only         | 404             |

## Why the filter uses `employeeType`, not `memberOf`

`memberOf` is the natural way to restrict access to a group, and it is what
Active Directory provides out of the box. In OpenLDAP it is not an attribute but
an *overlay* that has to be loaded, and the image used here ships neither
`memberof.so` nor a statically linked equivalent — adding the overlay fails with
`objectClass: value #1 invalid per syntax`.

So the fixture marks the permitted users with `employeeType: loramint` as well as
putting them in `cn=loramint,ou=groups`. The filter above restricts on that
attribute, which exercises exactly the same code path. Against a directory that
does provide `memberOf`, use it:

```
LDAP_SEARCH_FILTER='(&(uid={username})(memberOf=cn=loramint,ou=groups,dc=example,dc=org))'
```

## Poking at it directly

```bash
# Who is in the directory?
docker exec loramint_openldap ldapsearch -x -H ldap://localhost:1389 \
  -D 'cn=admin,dc=loramint,dc=test' -w adminpw \
  -b 'dc=loramint,dc=test' dn

# Do these credentials work?
docker exec loramint_openldap ldapwhoami -x -H ldap://localhost:1389 \
  -D 'uid=mruf,ou=people,dc=loramint,dc=test' -w geheim123
```
