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
        uses: your-org/generate-versionning@main
        with:
          token: \${{ secrets.GITHUB_TOKEN }}
          increment: patch
          mode: sequential
          prefix: staging
```

### Available Inputs

| Name     | Description                                                                 |
|----------|-----------------------------------------------------------------------------|
| `token`  | GitHub Token to create/delete refs (default: `GITHUB_TOKEN`)                |
| `increment` | One of: `patch`, `minor`, `major`, `feature`, `bug`, `no change`, `build number only` |
| `mode`   | `sequential` (default) or `date` – defines the build number strategy        |
| `reinit` | `true` to reset build number to 1                                           |
| `prefix` | Optional string to prefix tag (e.g., `staging`, `prod`)                     |
| `dry_run`| If true, doesn't push any new tag or delete old ones                        |

---

## ✅ Outputs

| Name           | Description                        |
|----------------|------------------------------------|
| `version_number` | The next semantic version         |
| `build_number`   | The next build number             |
| `tag_label`      | The new tag name (if generated)   |
| `old_tag_label`  | The previous tag (if exists)      |

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

---

## 📝 License

MIT © Nicolas Deleplace