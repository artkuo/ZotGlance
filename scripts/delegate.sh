#!/usr/bin/env bash
# Run one coding task with Command Code, headless, in its own git worktree.
#
#   scripts/delegate.sh <task> [base-branch] [model]
#
# <task> names tasks/<task>.md. The work happens on branch task/<task> in
# ../zotQL-worktrees/<task>. The full agent log goes to .delegate-logs/<task>.log;
# only a short report is printed, so the orchestrator reads little.
set -uo pipefail

task=${1:?usage: delegate.sh <task> [base-branch] [model]}
base=${2:-main}
model=${3:-${DELEGATE_MODEL:-}}

repo=$(git rev-parse --show-toplevel)
spec="$repo/tasks/$task.md"
[[ -f $spec ]] || { echo "no task file: $spec" >&2; exit 2; }

wt="$(dirname "$repo")/zotQL-worktrees/$task"
branch="task/$task"
logdir="$repo/.delegate-logs"
log="$logdir/$task.log"
mkdir -p "$logdir"

if [[ ! -d $wt ]]; then
  git -C "$repo" worktree add -q -b "$branch" "$wt" "$base" || exit 2
fi

prompt="$(cat "$repo/AGENTS.md")

---

# Your task

$(cat "$spec")

Work only inside $wt. When done, make sure the checks listed in the task pass,
then print your summary (files changed, decisions, anything unresolved)."

args=(-p "$prompt" --yolo --skip-onboarding --max-turns "${DELEGATE_MAX_TURNS:-80}"
      --add-dir "$(dirname "$repo")/zotquicksearch")
[[ -n $model ]] && args+=(-m "$model")

echo "== delegating '$task' (branch $branch${model:+, model $model})"
start=$(date +%s)
(cd "$wt" && commandcode "${args[@]}") >"$log" 2>&1
status=$?
echo "== agent exit $status after $(( $(date +%s) - start ))s; full log: $log"

echo "== agent summary (last 30 lines)"
tail -n 30 "$log"

echo "== checks"
cd "$wt"
[[ -d node_modules ]] || npm install --silent >/dev/null 2>&1
for check in build test:unit; do
  if npm run -s "$check" >"$logdir/$task.$check.log" 2>&1; then
    echo "PASS $check"
  else
    echo "FAIL $check (see $logdir/$task.$check.log)"; tail -n 15 "$logdir/$task.$check.log"
  fi
done

git add -A
git -c core.hooksPath=/dev/null commit -q -m "$task (Command Code)" && echo "== committed on $branch"
echo "== diff vs $base"
git diff --stat "$base"..HEAD | tail -n 25
