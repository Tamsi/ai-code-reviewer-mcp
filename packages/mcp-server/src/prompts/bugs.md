# Task: Potential bug detection

Hunt for latent bugs and defects. Focus on:

- Null / undefined / nil dereferences and missing existence checks.
- Off-by-one errors and incorrect boundary conditions.
- Unhandled promise rejections, missing `await`, race conditions, and concurrency bugs.
- Incorrect error handling (swallowed errors, wrong error types).
- Type coercion surprises and incorrect comparisons.
- Resource leaks (unclosed handles, listeners, connections).
- Incorrect assumptions about external input or API responses.

For each suspected bug, explain the concrete scenario that triggers it.
