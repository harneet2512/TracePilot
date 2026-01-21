# Type Fix Mapping - STEP 0 Output

## Type Definition File
- **File**: `shared/schema.ts`
- **Type Name**: `SeedEvalCase` (lines 811-847)
- **Structure**: Discriminated union with `type: "QNA" | "ACTION"` as discriminant
  - QNA cases: `mustCite?: boolean`, `expectedSourceIds?: string[]`, `mustCite?: never` on ACTION
  - ACTION cases: `expectedTool?: string`, `requiredFields?: string[]`, `mustCite?: never` on ACTION
  - Both types: `expectedDetection?: boolean` (exists on both)

## Case Array Files
1. **File**: `script/seed-evals.ts`
   - **Line**: 11-719
   - **Type**: `SeedEvalSuite[]` where `cases: SeedEvalCase[]`
   - **Usage**: Seeding database with test cases

2. **File**: `server/routes.ts`
   - **Line**: 1677-1699
   - **Type**: Array created from database `EvalCase` records
   - **Usage**: Creating cases array from database data to pass to `runEvalCases`

## Access Sites Causing Errors

### Property: `mustCite`
- **File**: `server/routes.ts`
- **Line**: 2310
- **Context**: Inside `if (evalCase.type === "QNA")` block
- **Issue**: Parameter type of `runEvalCases` is NOT a discriminated union, so TypeScript cannot narrow `mustCite` properly even with the type guard

### Property: `expectedDetection`
- **File**: `server/routes.ts`
- **Line**: 1696 (assignment), 2224 (type definition)
- **Context**: Used in cases mapping and type definition
- **Issue**: Property exists on both QNA and ACTION in `SeedEvalCase`, but parameter type doesn't use discriminated union

## Root Cause
The `runEvalCases` function (lines 2206-2229) uses a plain object type with all fields optional instead of a discriminated union type. This prevents TypeScript from properly narrowing when accessing type-specific properties like `mustCite` (which should only exist on QNA cases according to `SeedEvalCase`).

## Solution Strategy
1. Create a discriminated union type `EvalCase` for `runEvalCases` parameter (similar to `SeedEvalCase` but adapted for runtime data)
2. Update `runEvalCases` parameter type to use the discriminated union
3. Ensure access sites use proper type narrowing (already in place, but type needs to support it)
