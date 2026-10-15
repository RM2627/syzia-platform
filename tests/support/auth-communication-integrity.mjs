// Narrow authorization layer for the audited authentication/communication patch.
// Historical manifests and their pins remain unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const raw=readFileSync(new URL('../../docs/auth-communication/authorized-hashes.json',import.meta.url),'utf8').replaceAll('\r\n','\n');
assert.equal(createHash('sha256').update(raw).digest('hex'),'e52c4c8ddbd7344f3a50e88e04dd4802532a587b9d6cf8929fa017914fbbfea0','auth-communication authorization manifest changed');
const transitions=JSON.parse(raw);
const authorized=new Set(["server/enterprise-access.mjs", "src/FoundationApp.tsx", "src/access/EnterpriseAccess.tsx", "src/acquisition/SelfService.tsx", "src/main.tsx", "src/operations/Operations.tsx", "tests/syzia-033-server.test.mjs"]);
assert.equal(Object.keys(transitions).length,7,'unexpected authorization count');
for (const [path,row] of Object.entries(transitions)) {
  assert.ok(authorized.has(path),'unauthorized auth-communication path: '+path);
  assert.match(row.before,/^[a-f0-9]{64}$/);
  assert.match(row.after,/^[a-f0-9]{64}$/);
}
export function authCommunicationExpectedHash(path,expected) {
  const row=transitions[path];
  if (!row) return expected;
  assert.equal(expected,row.before,'auth-communication unexpected predecessor: '+path);
  return row.after;
}
