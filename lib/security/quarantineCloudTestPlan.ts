import { createHash } from "node:crypto";
import { digest } from "./reconciliation";
import { buildFourFileQuarantineRules } from "./fileQuarantineRules";
export const CLOUD_QUARANTINE_RUN = "q4-20261019-9e64c1b7";
export const CLOUD_QUARANTINE_SOURCES = [
  `spaces/quarantine-rehearsal-${CLOUD_QUARANTINE_RUN}/reading-a.wav`,
  `spaces/quarantine-rehearsal-${CLOUD_QUARANTINE_RUN}/reading-b.wav`,
  `spaces/quarantine-rehearsal-${CLOUD_QUARANTINE_RUN}/podcast.wav`,
  `covers/quarantine-rehearsal-${CLOUD_QUARANTINE_RUN}/image.png`,
];
// Synthetic targets are fixed before upload. Production's generation-derived mapping is not reused.
export const CLOUD_QUARANTINE_TARGETS = CLOUD_QUARANTINE_SOURCES.map(p => `private-file-quarantine/${digest([CLOUD_QUARANTINE_RUN,p])}`);
export const CLOUD_QUARANTINE_PRIVATE_CONTROL = `private-file-quarantine/${digest([CLOUD_QUARANTINE_RUN,"control"])}`;
export const CLOUD_QUARANTINE_PUBLIC_CONTROL = `covers/quarantine-rehearsal-${CLOUD_QUARANTINE_RUN}/public-control.png`;
export const CLOUD_QUARANTINE_BOARD = `spaces/quarantine-rehearsal-${CLOUD_QUARANTINE_RUN}/board/state`;
export const CLOUD_QUARANTINE_OPEN_RULES = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{object=**} {
      allow read: if resource.name in ${JSON.stringify([...CLOUD_QUARANTINE_SOURCES,CLOUD_QUARANTINE_PUBLIC_CONTROL])};
      allow write: if false;
    }
  }
}
`;
export const CLOUD_QUARANTINE_LOCKED_RULES = buildFourFileQuarantineRules(CLOUD_QUARANTINE_OPEN_RULES, CLOUD_QUARANTINE_SOURCES);
function tone(frequency: number) {
  const b = Buffer.alloc(844); b.write("RIFF"); b.writeUInt32LE(b.length-8,4); b.write("WAVEfmt ",8); b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(8000,24); b.writeUInt32LE(16000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34);
  b.write("data",36); b.writeUInt32LE(800,40);
  for(let i=0;i<400;i++) b.writeInt16LE(Math.round(1000*Math.sin(2*Math.PI*frequency*i/8000)),44+i*2);
  return b;
}
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=","base64");
export const CLOUD_QUARANTINE_FIXTURES = [tone(220),tone(330),tone(440),png].map((bytes,i)=>({bytes,size:bytes.length,contentType:i===3?"image/png":"audio/wav",
  md5Hash:createHash("md5").update(bytes).digest("base64"),sha256:createHash("sha256").update(bytes).digest("hex")}));
export const CLOUD_QUARANTINE_BLUEPRINT = {
  runId:CLOUD_QUARANTINE_RUN, projectId:"testbilde-5683f",projectNumber:"220379724471",bucket:"testbilde-5683f.firebasestorage.app",
  principal:"school321-cloud-test@testbilde-5683f.iam.gserviceaccount.com", region:"europe-west1",softDeleteSeconds:"604800",
  sources:CLOUD_QUARANTINE_SOURCES,targets:CLOUD_QUARANTINE_TARGETS,privateControl:CLOUD_QUARANTINE_PRIVATE_CONTROL,publicControl:CLOUD_QUARANTINE_PUBLIC_CONTROL,board:CLOUD_QUARANTINE_BOARD,
  fixtures:CLOUD_QUARANTINE_FIXTURES.map(({size,contentType,md5Hash,sha256})=>({size,contentType,md5Hash,sha256})),
  storageBaselineSha256:"e656d238ee388d951268ca38d1eca2dbf2f5fdc55ef4b20e22911413d36c935b",
  firestoreBaselineSha256:"ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb",
  openedRulesSha256:createHash("sha256").update(CLOUD_QUARANTINE_OPEN_RULES).digest("hex"),lockedRulesSha256:createHash("sha256").update(CLOUD_QUARANTINE_LOCKED_RULES).digest("hex"),
  maxMutations:25,maxRejectedWriteProbes:4,sourceRetirementCount:4,cleanupOtherObjects:false,deleteDocuments:false,deleteRulesets:false,createUsers:false,changeFirestoreRules:false,changeIam:false,
};
export const CLOUD_QUARANTINE_BLUEPRINT_DIGEST = digest(CLOUD_QUARANTINE_BLUEPRINT);

export const CLOUD_QUARANTINE_BASELINE_RULES = "rules_version = '2';\n\n// Craft rules based on data in your Firestore database\n// allow write: if firestore.get(\n//    /databases/(default)/documents/users/$(request.auth.uid)).data.isAdmin;\nservice firebase.storage {\n  match /b/{bucket}/o {\n    match /{allPaths=**} {\n      allow read, write: if false;\n    }\n  }\n}";
export const CLOUD_QUARANTINE_FIRESTORE_RULES = "rules_version = '2';\n\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if false;\n    }\n  }\n}";
