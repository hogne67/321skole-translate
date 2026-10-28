import { digest } from "./reconciliation";
export const CLOUD_QUARANTINE_RECOVERY_PLAN = {
  "phaseId": "q4-20261019-9e64c1b7-recovery01",
  "parentRunId": "q4-20261019-9e64c1b7",
  "project": "testbilde-5683f",
  "bucket": "testbilde-5683f.firebasestorage.app",
  "parentJournalSha256": "ec6c0707fd7cbfe48f08f6670c095e2392ab52d22ac58f6abb2e8cb4c4497010",
  "objects": [
    {
      "path": "spaces/quarantine-rehearsal-q4-20261019-9e64c1b7/reading-a.wav",
      "status": 200,
      "testRunMatches": true,
      "generation": "1792424219925822",
      "metageneration": "1",
      "size": 844,
      "md5Hash": "y1lq2HuMPerz3WNyF0Zweg==",
      "tokenCount": 1
    },
    {
      "path": "spaces/quarantine-rehearsal-q4-20261019-9e64c1b7/reading-b.wav",
      "status": 200,
      "testRunMatches": true,
      "generation": "1792424220069869",
      "metageneration": "1",
      "size": 844,
      "md5Hash": "snTmdbshuYqalbY4uFoxGg==",
      "tokenCount": 1
    },
    {
      "path": "spaces/quarantine-rehearsal-q4-20261019-9e64c1b7/podcast.wav",
      "status": 200,
      "testRunMatches": true,
      "generation": "1792424220226513",
      "metageneration": "1",
      "size": 844,
      "md5Hash": "LYXziH2pnGFhpW6oQHu/zQ==",
      "tokenCount": 1
    },
    {
      "path": "covers/quarantine-rehearsal-q4-20261019-9e64c1b7/image.png",
      "status": 200,
      "testRunMatches": true,
      "generation": "1792424220364124",
      "metageneration": "1",
      "size": 68,
      "md5Hash": "p12yw+He7UDYB+jSZWZ0zQ==",
      "tokenCount": 1
    },
    {
      "path": "private-file-quarantine/e240bbed201df6eb8b28a75393d631d0f8c47758fa941cfa2227d20262463d3d",
      "status": 200,
      "testRunMatches": true,
      "generation": "1792424220497974",
      "metageneration": "1",
      "size": 68,
      "md5Hash": "p12yw+He7UDYB+jSZWZ0zQ==",
      "tokenCount": 0
    },
    {
      "path": "covers/quarantine-rehearsal-q4-20261019-9e64c1b7/public-control.png",
      "status": 200,
      "testRunMatches": true,
      "generation": "1792424220648144",
      "metageneration": "1",
      "size": 68,
      "md5Hash": "p12yw+He7UDYB+jSZWZ0zQ==",
      "tokenCount": 0
    }
  ],
  "emptyTargets": [
    "private-file-quarantine/f52a2ebae5517c297ca1b4abfd297019882025aceb1b797b80a55d34ac4d0262",
    "private-file-quarantine/5cbe21dcc4fe3fb310b3ac9ceb45489d86413a98c642ac751f69ef84cf32d23e",
    "private-file-quarantine/947ddb2ed890df7d27b8e5db9e4d26123e94785f25be1c07700f51aaa001fa7a",
    "private-file-quarantine/ba634fa61d49ed477eb8b9464dfcdf4b3339b4c08671d850b0b69b7c7a27e037"
  ],
  "board": {
    "status": 200,
    "testRunMatches": true,
    "imageReferenceUnchanged": true,
    "controlFieldUnchanged": true,
    "updateTime": "2026-10-19T15:37:00.918105Z"
  },
  "rules": {
    "storage": {
      "rulesetName": "projects/testbilde-5683f/rulesets/c1a0387d-9151-4cb1-9f57-edd19b09d84e",
      "updateTime": "2026-10-16T07:45:39.255893Z",
      "sourceSha256": "e656d238ee388d951268ca38d1eca2dbf2f5fdc55ef4b20e22911413d36c935b",
      "baselineUnchanged": true
    },
    "firestore": {
      "rulesetName": "projects/testbilde-5683f/rulesets/df233b5e-6a45-4b23-a55d-fedc8afeb53b",
      "updateTime": "2026-10-16T12:52:38.241730Z",
      "sourceSha256": "ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb",
      "baselineUnchanged": true
    }
  },
  "maxMutations": 18,
  "maxRejectedWriteProbes": 4,
  "minIamAgeMs": 420000,
  "maxIamAgeMs": 1800000,
  "createSourceObjects": false,
  "createDocuments": false,
  "broaderRights": false,
  "productionChanges": false
};
export const CLOUD_QUARANTINE_RECOVERY_DIGEST = digest(CLOUD_QUARANTINE_RECOVERY_PLAN);
