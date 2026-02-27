Audit the TracePilot frontend for UI/UX issues, inconsistencies, and improvement opportunities.

## Scope
Analyze all non-ui-library components and pages in `client/src/`:
- Pages: `client/src/pages/**/*.tsx`
- Components: `client/src/components/*.tsx` (skip `client/src/components/ui/` — those are shadcn primitives)
- Styles: `client/src/index.css`
- Hooks: `client/src/hooks/`

## Checklist
For each file, check:

### Consistency
- [ ] Spacing uses consistent Tailwind scale (no arbitrary values like `p-[13px]`)
- [ ] Color usage follows theme tokens (`text-foreground`, `bg-muted`, etc.) — no raw hex/rgb
- [ ] Typography uses consistent size scale — no one-off `text-[15px]`
- [ ] Border radius follows design tokens (`rounded-md`, `rounded-lg`, etc.)

### Accessibility
- [ ] Interactive elements have visible focus states
- [ ] Images/icons have alt text or `aria-label`
- [ ] Color contrast meets WCAG AA
- [ ] Form inputs have associated labels

### Responsiveness
- [ ] Pages work at mobile breakpoints (`sm:`, `md:`)
- [ ] No horizontal overflow or clipped content
- [ ] Touch targets are at least 44px

### Code Quality
- [ ] No inline styles — use Tailwind classes
- [ ] No unused imports or dead JSX
- [ ] Loading and error states are handled
- [ ] Empty states are designed (not just blank)

## Output
Produce a structured report grouped by file with:
1. **Issue** — what's wrong
2. **Location** — file:line
3. **Severity** — critical / warning / nitpick
4. **Fix** — suggested change

Summarize with counts: X critical, Y warnings, Z nitpicks.
