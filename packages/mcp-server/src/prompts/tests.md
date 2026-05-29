# Task: Missing test suggestions

Identify gaps in test coverage and propose concrete tests. Focus on:

- Critical paths, branches, and edge cases that appear untested.
- Error and failure handling that lacks tests.
- Boundary values and input validation.
- Regression risks in complex or recently changed logic.
- Public API contracts that should be pinned by tests.

For each gap, the `suggestion` field should contain a concrete test skeleton (in the
codebase's language and test framework when identifiable) that the developer can adapt.
Set `severity` to reflect the risk of the untested code, not the test itself.
