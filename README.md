# 🔢 Versioning Number Generator – GitHub Action

A GitHub Action to generate **semantic version tags and build numbers**, either sequentially or based on the current date.

Supports the following modes:
- `patch`, `minor`, `major`, `bug`, `feature`
- `no change` or `none` → no new tag, just keeps the latest
- `build number only` or `build` → bumps build number without changing version

---

## 📦 Tag Format

Tags are generated in the format:

```
<prefix>-auto-v<version>-<build>
```

- If no prefix is provided, it defaults to `auto-v<version>-<build>`.
- Examples:
  - `auto-v1.0.0-1`
  - `staging-auto-v2.3.1-5`
  - `prod-auto-v3.0.0-2025042401`

---

## 🚀 Usage

### Step 1: Add to your workflow

```yaml
jobs:
  versioning:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Version generator
        uses: your-org/generate-versionning@v2.1
        with:
          token: \${{ secrets.GITHUB_TOKEN }}
          increment: patch
          build_number_mode: sequential
          prefix: staging
```

### Step 2 (recommended): share one build counter across workflows

The action computes the next **build number** from every `(<prefix>-)?auto-v*-*` tag in the repository — not just tags matching the current `prefix`. So two workflows using different prefixes (e.g. `staging` and production with no prefix) automatically share a single monotonic counter.

However, if both workflows run in parallel on the same repo, each may read the tags before the other has pushed its new tag, and produce **the same build number**. To guarantee strictly sequential numbers, serialise the versioning step with GitHub Actions' [`concurrency`](https://docs.github.com/en/actions/using-jobs/using-concurrency) keyword on the **job that calls this action** (not the whole workflow, so the heavy build steps stay parallel):

```yaml
# .github/workflows/deploy-staging.yml
jobs:
  versioning:
    runs-on: ubuntu-latest
    concurrency:
      group: android-versioning       # same group name in every workflow sharing the counter
      cancel-in-progress: false       # queue, do not cancel
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/generate-versionning@v2.1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          prefix: staging
          increment: patch

  build:
    needs: versioning                  # heavy build runs outside the concurrency group
    runs-on: ubuntu-latest
    steps: [ ... ]
```

Apply the exact same `group:` name in the production workflow (with its own `prefix:` — empty, `prod`, etc.). GitHub will then queue a second `versioning` job behind the first; once the first creates its tag and exits, the second re-reads the tags and picks the next number.

Typical timeline with staging firing 2s before prod:

1. **T+0s** — staging enters `versioning`, reads `max(build) = 42`, creates `staging-auto-v1.0.0-43`, exits.
2. **T+2s** — prod arrives; GitHub queues it behind staging.
3. **T+~8s** — prod resumes, now sees build 43, creates `auto-v1.0.0-44`.

Without `concurrency`, both could read 42 and both end up at 43 — fine if you want mutualised numbers, but not strictly sequential.

### Available Inputs

| Name                  | Description                                                                                        |
|-----------------------|----------------------------------------------------------------------------------------------------|
| `token`               | GitHub Token to create/delete refs (typically `secrets.GITHUB_TOKEN`)                              |
| `prefix`              | Optional string to prefix tag (e.g., `staging`, `prod`). Empty by default                          |
| `increment`           | One of: `patch`, `minor`, `major`, `feature`, `bug`, `no change` / `none`, `build number only` / `build` |
| `build_number_mode`   | `sequential` (default) or `date` — defines the build number strategy                               |
| `build_number_reinit` | `true` to reset the build number to 1 for the current version (sequential mode only)               |
| `dry_run`             | If `true`, simulates the run without creating or deleting tags                                     |

---

## ✅ Outputs

| Name             | Description                       |
|------------------|-----------------------------------|
| `version_number` | The next semantic version         |
| `build_number`   | The next build number             |
| `tag_label`      | The new tag name (if generated)   |
| `old_tag_label`  | The previous tag (if exists)      |

> **Deprecation (v2.1)** — `previous_tag_label` is still emitted as an alias of `old_tag_label` for backwards compatibility, but it is **scheduled for removal in v3**. If your workflows read `${{ steps.<id>.outputs.previous_tag_label }}`, migrate them to `${{ steps.<id>.outputs.old_tag_label }}` before upgrading to v3.

---

## 💻 Development

Install and test locally:

```bash
npm install
npm test
```

To compile for GitHub Actions:

```bash
npm build
```

---

## 🧪 Test Coverage

This action is fully tested with [Vitest](https://vitest.dev/) and covers:
- All increment types
- Both sequential and date-based modes
- Edge cases (no tags, broken tags, reinit behavior)
- Prefix and no-prefix scenarios
- Cross-prefix build number sharing (staging + prod pools merged for the counter, kept separate for tag lifecycle)

---

## 📝 License

MIT © Nicolas Deleplace