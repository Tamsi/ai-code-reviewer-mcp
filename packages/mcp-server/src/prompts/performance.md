# Task: Performance analysis

Find performance problems and inefficiencies. Focus on:

- Algorithmic complexity: nested loops, accidental O(n^2), repeated work.
- N+1 queries and chatty I/O that should be batched.
- Blocking calls on hot paths and missing concurrency/parallelism.
- Unnecessary allocations, copies, and large in-memory buffers.
- Missing or misused caching and memoization.
- Inefficient data structures for the access pattern.
- Repeated expensive computation that could be hoisted.

Prioritize issues on hot paths or those that scale with input size. Explain the
expected impact (e.g. "scales linearly with number of users").
