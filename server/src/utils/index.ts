// This is a "barrel file" - it re-exports things from other files in this folder so that
// other parts of the app can import from a single, short path (e.g. `from "../utils"`)
// instead of having to know/remember the exact file each thing lives in
// (e.g. `from "../utils/AppError.js"` and `from "../utils/asyncHandler.js"` separately).

// Re-export the custom AppError class (see AppError.ts) so consumers can do
// `import { AppError } from "../utils"`.
export { AppError } from "./AppError.js"
// Re-export the asyncHandler wrapper (see asyncHandler.ts) so consumers can do
// `import { asyncHandler } from "../utils"`.
export { asyncHandler } from "./asyncHandler.js"
// Re-export escapeRegex (see regex.ts) so consumers can do
// `import { escapeRegex } from "../utils"`.
export { escapeRegex } from "./regex.js"
// Re-export withTimeout (see withTimeout.ts) so consumers can do
// `import { withTimeout } from "../utils"`.
export { withTimeout } from "./withTimeout.js"
// Re-export the shared objectId Zod validator (see validation.ts) so consumers can do
// `import { objectId } from "../utils"`.
export { objectId } from "./validation.js"
// Re-export the shared report date-bucket map (see dateBucket.ts) so consumers can do
// `import { DATE_FORMATS } from "../utils"`.
export { DATE_FORMATS, type DateBucket } from "./dateBucket.js"
// Re-export the shared lazy-client factory (see lazyClient.ts) so consumers can do
// `import { lazyClient } from "../utils"`.
export { lazyClient } from "./lazyClient.js"
// Re-export the shared report department/store scope resolver (see reportScope.ts) so
// consumers can do `import { resolveReportScope } from "../utils"`.
export { resolveReportScope, resolveDepartmentIdsForStore, type ReportScope } from "./reportScope.js"
