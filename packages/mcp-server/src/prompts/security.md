# Task: Security analysis

Identify security vulnerabilities and weaknesses. Focus on:

- Injection: SQL, command, path traversal, SSRF, template/code injection.
- Authentication and authorization flaws (missing checks, IDOR, broken access control).
- Hardcoded secrets, credentials, tokens, or private keys committed to the repo.
- Unsafe deserialization, prototype pollution, and unsafe `eval`/dynamic execution.
- Cross-site scripting and missing output encoding.
- Sensitive data exposure (logging secrets, weak crypto, insecure randomness).
- Dependency and supply-chain risks visible in manifests.
- Missing input validation on trust boundaries.

Map findings to the relevant weakness class (e.g. CWE name) in the `category` field
when applicable. Be explicit about the attack vector.
