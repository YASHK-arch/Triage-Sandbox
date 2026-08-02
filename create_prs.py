import os
import subprocess
import time

def run(cmd):
    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)

def create_pr(branch, commit_msg, pr_title, pr_body, file_changes):
    # checkout main
    run(["git", "checkout", "main"])
    
    # check if branch exists and delete it locally and remotely if it does
    try:
        subprocess.run(["git", "branch", "-D", branch], stderr=subprocess.DEVNULL)
        subprocess.run(["git", "push", "origin", f"--delete", branch], stderr=subprocess.DEVNULL)
    except:
        pass
        
    # create new branch
    run(["git", "checkout", "-b", branch])
    
    # apply file changes
    for file_path, content in file_changes.items():
        # create directory if it doesn't exist
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        run(["git", "add", file_path])
    
    # commit
    run(["git", "commit", "-m", commit_msg])
    
    # push
    run(["git", "push", "-u", "origin", branch])
    
    # create PR
    print(f"Creating PR for {branch}...")
    res = subprocess.run(["gh", "pr", "create", "--title", pr_title, "--body", pr_body], capture_output=True, text=True)
    if res.returncode == 0:
        print(f"Success: {res.stdout.strip()}")
    else:
        print(f"Error: {res.stderr}")
    
    time.sleep(2)

prs = [
    {
        "branch": "fix-readme-node",
        "commit_msg": "docs: add node.js requirement to backend",
        "pr_title": "docs: update node.js version requirement",
        "pr_body": "This PR adds the missing Node.js 18+ requirement to the backend section as reported in #10. Closes #10.",
        "file_changes": {
            "dummy_readme.txt": "Node.js 18+ is required for backend scripts."
        }
    },
    {
        "branch": "feat-dark-mode",
        "commit_msg": "feat: add dark mode support",
        "pr_title": "feat: add dark mode support to webview",
        "pr_body": "This adds CSS variables from VS Code to support dark mode. Closes #1.",
        "file_changes": {
            "vscode-extension/dark-mode.css": ":root { --bg-color: var(--vscode-editor-background); }"
        }
    },
    {
        "branch": "feat-dark-mode-alt",
        "commit_msg": "feat: hardcoded dark mode",
        "pr_title": "feat: implement dark theme using custom CSS",
        "pr_body": "I decided to use a custom CSS approach instead of VS Code's variables to implement dark mode, as it gives us more control. Closes #1.",
        "file_changes": {
            "vscode-extension/custom-dark-theme.css": "body { background-color: #1e1e1e; color: #d4d4d4; }"
        }
    },
    {
        "branch": "feat-dark-mode-dup",
        "commit_msg": "feat: add dark mode",
        "pr_title": "Add dark mode support",
        "pr_body": "Uses VS code CSS variables for dark mode. Closes #1.",
        "file_changes": {
            "vscode-extension/dark-mode2.css": ":root { --bg-color: var(--vscode-editor-background); }"
        }
    },
    {
        "branch": "spam-pr-branch",
        "commit_msg": "earn money",
        "pr_title": "EARN 5000 DOLLARS FAST!!!",
        "pr_body": "Click here to earn money!!! http://spam-website.example.com",
        "file_changes": {
            "free-money.txt": "Check out my link: http://spam-website.example.com"
        }
    },
    {
        "branch": "ai-slop-refactor",
        "commit_msg": "refactor: optimize frame extractor using AI",
        "pr_title": "Refactor: Advanced AI-powered memory optimization for frame extraction",
        "pr_body": "As an AI language model, I have optimized this code. This paradigm-shifting refactor leverages synergistic memory streams to proactively eliminate MemoryError. Closes #11.",
        "file_changes": {
            "backend/pipeline/ai_optimization.py": "# As an AI language model...\nclass SynergisticMemoryStream:\n    pass\n"
        }
    }
]

for pr in prs:
    try:
        create_pr(pr["branch"], pr["commit_msg"], pr["pr_title"], pr["pr_body"], pr["file_changes"])
    except Exception as e:
        print(f"Failed to process PR on branch {pr['branch']}: {e}")

# Return to main
run(["git", "checkout", "main"])
