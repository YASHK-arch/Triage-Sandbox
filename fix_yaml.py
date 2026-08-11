labels = '{"spam":"\u26a0\ufe0f scam","invalid":"\u26a0\ufe0f invalid","ai-slop":"\U0001f6a8 ai-slop","prompt-injection":"\U0001f6a8 prompt-injection","needs-triage":"needs-triage","duplicate":"duplicate","possible-duplicate":"possible-duplicate","security":"security"}'

yaml = """name: RepoOwl PR Analyzer

on:
  pull_request_target:
    types: [opened, ready_for_review]
  issue_comment:
    types: [created]

permissions:
  pull-requests: write
  issues: write
  contents: read

jobs:
  analyze-pr:
    if: >
      github.event_name == 'pull_request_target' ||
      (github.event.issue.pull_request && (contains(github.event.comment.body, '/analyze') || contains(github.event.comment.body, '/analyse')))

    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run RepoOwl PR Analysis
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number || github.event.issue.number }}
          REPOSITORY: ${{ github.repository }}
          CORE_TRIAGE_LABELS: 'LABELS_PLACEHOLDER'
        run: node .github/scripts/analyze-pr.js
""".replace('LABELS_PLACEHOLDER', labels)

with open('.github/workflows/repoowl-analyze.yml', 'w', encoding='utf-8') as f:
    f.write(yaml)
print('Written OK')
print('Label line:', [l for l in yaml.splitlines() if 'CORE_TRIAGE' in l][0])
