# STEP 0 - Type Error Mapping

## Type Definition File
- **File**: `shared/schema.ts`
- **Type Names**: 
  - `SeedEvalCase` (lines 811-847) - discriminated union for seed data
  - `RuntimeEvalCase` (lines 851-889) - discriminated union for runtime evaluation
- **Structure**: Both are discriminated unions with `type: "QNA" | "ACTION"` as discriminant
  - QNA cases: `mustCite?: boolean`, `expectedSourceIds?: string[]`, `expectedDetection?: boolean`, and other fields
  - ACTION cases: `expectedTool?: string`, `requiredFields?: string[]`, `expectedDetection?: boolean`, `mustCite?: never`, and other fields

## Case Array Files

1. **File**: `script/seed-evals.ts`
   - **Lines**: 11-719 (seedEvalCases array)
   - **Type**: `SeedEvalSuite[]` where `cases: SeedEvalCase[]`
   - **Usage**: Seeding database with test cases

2. **File**: `server/routes.ts`
   - **Lines**: 1658-1714 (cases array construction)
   - **Type**: `RuntimeEvalCase[]` (explicitly typed)
   - **Source**: `suiteData.cases` (typed as `Array<any>`) mapped to `RuntimeEvalCase[]`
   - **Usage**: Creating cases array from database JSON to pass to `runEvalCases`

3. **File**: `server/routes.ts`
   - **Line**: 779
   - **Type**: `EvalCaseJson[]` (from `evalSuiteJsonSchema`) cast to `RuntimeEvalCase[]`
   - **Usage**: Legacy endpoint using type assertion

## Access Sites for Properties

### Property: `mustCite`
- **File**: `server/routes.ts`
- **Line**: 2307
- **Context**: Inside `if (evalCase.type === "QNA")` block in `runEvalCases` function
- **Access**: `evalCase.mustCite` (should be properly narrowed by discriminated union)
- **Note**: `evalCase` parameter is `RuntimeEvalCase` which IS a discriminated union

- **File**: `server/routes.ts`
- **Line**: 1701
- **Context**: Inside `if (caseType === "QNA")` block in cases mapping
- **Access**: `c.mustCite ?? expectedJson.mustCite`
- **Note**: `c` is `any` (from `suiteData.cases: Array<any>`)

### Property: `expectedDetection`
- **File**: `server/routes.ts`
- **Line**: 1693
- **Context**: In `baseFields` object construction (used for both QNA and ACTION)
- **Access**: `c.expectedDetection ?? expectedJson.expectedDetection`
- **Note**: `c` is `any` (from `suiteData.cases: Array<any>`)

- **File**: `server/routes.ts`
- **Line**: 2457-2465 (injection detection logic)
- **Context**: Used in `runEvalCases` after type narrowing
- **Note**: Should be accessible on both QNA and ACTION cases

## Type Analysis

1. **RuntimeEvalCase IS a discriminated union** (defined correctly in schema.ts)
2. **runEvalCases parameter IS RuntimeEvalCase[]** (line 2223)
3. **Type narrowing SHOULD work** at line 2307 (inside `if (evalCase.type === "QNA")`)
4. **Potential issue**: `suiteData.cases` is typed as `Array<any>` at line 1658, so property access on `c` doesn't benefit from type checking

## Potential Issues

1. The mapping at lines 1679-1714 uses `Array<any>` as source, so TypeScript can't validate property access
2. The type assertion at line 779 (`as RuntimeEvalCase[]`) may hide type errors
3. However, `RuntimeEvalCase` is already a proper discriminated union, so narrowing should work in `runEvalCases`
