# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Ownership**: Every `Subject`, `Week`, and `Lecture` document must contain `ownerId == request.auth.uid` from a verified user (`request.auth.token.email_verified == true`), and `ownerId` is immutable after creation.
2. **Relational Hierarchy**:
   - A `Week` cannot exist without an existing parent `Subject` owned by the same user (`subject.ownerId == request.auth.uid`).
   - A `Lecture` cannot exist without both an existing parent `Subject` and parent `Week` owned by the same user where `week.subjectId == lecture.subjectId`.
   - Parent links (`subjectId`, `weekId`) are immutable after creation.
3. **Temporal & Structural Integrity**:
   - `createdAt` must equal `request.time` on creation and remain immutable on update.
   - `updatedAt` must equal `request.time` on both creation and update.
   - Every document enforces strict `hasAll` and `hasOnly` field allowlists, string length limits, bounded array limits, and valid document IDs (`^[a-zA-Z0-9_\-]+$`, max 128 chars).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Create a `Subject` with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Create a `Subject` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: Create a `Subject` with `ownerId: "victim-uid"` while authenticated as `"attacker-uid"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Create a `Subject` including an undeclared field `{ ..., isAdmin: true }` -> `PERMISSION_DENIED`.
5. **Orphaned Week Write**: Create a `Week` referencing a non-existent or victim-owned `subjectId` -> `PERMISSION_DENIED`.
6. **Orphaned Lecture Write**: Create a `Lecture` referencing a `weekId` belonging to another `subjectId` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: Create a `Subject` whose document ID contains spaces, slashes, or exceeds 128 characters -> `PERMISSION_DENIED`.
8. **Client Timestamp Forgery**: Create or update a `Lecture` with a backdated `createdAt` or `updatedAt` instead of `request.time` -> `PERMISSION_DENIED`.
9. **Owner Hijack on Update**: Update a `Lecture` attempting to reassign `ownerId` or mutate `createdAt` -> `PERMISSION_DENIED`.
10. **Array Exhaustion**: Update a `Lecture` with 11+ items in `tags` (max 10) or 61+ items in `notesBullets` (max 60) -> `PERMISSION_DENIED`.
11. **Value Type Poisoning**: Update a `Lecture` setting `notesBullets` to `[123]` or `revisionReady` to `"yes"` -> `PERMISSION_DENIED`.
12. **Blanket List Query**: Execute a `list` query on `/lectures` without `where("ownerId", "==", auth.uid)` -> `PERMISSION_DENIED`.
