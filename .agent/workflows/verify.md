---
description: How to format, lint, and build the application
---

This workflow is required by the project guidelines to ensure the code follows Biome's formatting rules, passes all lint checks, and successfully compiles to a production build. Always run this workflow before considering a task complete.

// turbo-all

1. Format the codebase
```bash
npm run format
```

2. Run lint checks
```bash
npm run check
```

3. Create the production build
```bash
npm run prod
```
