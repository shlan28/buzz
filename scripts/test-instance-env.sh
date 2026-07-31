#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script="$repo_root/scripts/instance-env.sh"
test_root=$(mktemp -d)
trap 'rm -rf "$test_root"' EXIT

fail() {
    echo "test-instance-env: $*" >&2
    exit 1
}

assert_eq() {
    local expected=$1
    local actual=$2
    local label=$3
    [[ "$actual" == "$expected" ]] || fail "$label: expected '$expected', got '$actual'"
}

line_at() {
    local value=$1
    local line_number=$2
    printf '%s\n' "$value" | sed -n "${line_number}p"
}

mkdir -p "$test_root/bin" "$test_root/repo/desktop/src-tauri/icons"
printf '#!/usr/bin/env bash\nset -euo pipefail\ntouch "$3"\n' > "$test_root/bin/swift"
chmod +x "$test_root/bin/swift"
git -C "$test_root/repo" init -q
git -C "$test_root/repo" config user.email test@example.com
git -C "$test_root/repo" config user.name Test
touch "$test_root/repo/desktop/src-tauri/icons/icon.icns"
git -C "$test_root/repo" add .
git -C "$test_root/repo" commit -qm init

read_env() {
    local checkout=$1
    shift
    (
        cd "$checkout"
        unset NO_PROXY no_proxy BUZZ_DEV_INSTANCE_SLUG BUZZ_INSTANCE_SLUG
        unset BUZZ_WORKTREE_LABEL VITE_DEV_BRANCH BUZZ_TAURI_CONFIG
        export PATH="$test_root/bin:$PATH"
        while (($#)); do
            export "$1"
            shift
        done
        source "$script" >&2
        printf '%s\n%s\n%s\n%s\n%s\n' \
            "$NO_PROXY" \
            "$no_proxy" \
            "$BUZZ_TAURI_CONFIG" \
            "${BUZZ_INSTANCE_SLUG:-}" \
            "$BUZZ_DEV_KEYRING_SERVICE"
    )
}

canonical=$(read_env "$test_root/repo")
assert_eq "localhost,127.0.0.1,::1" "$(line_at "$canonical" 1)" "default NO_PROXY"
assert_eq "$(line_at "$canonical" 1)" "$(line_at "$canonical" 2)" "proxy casing parity"
[[ "$(line_at "$canonical" 3)" == *'"identifier":"xyz.block.buzz.app.dev"'* ]] || fail "canonical identifier changed"
assert_eq "" "$(line_at "$canonical" 4)" "canonical slug"
assert_eq "buzz-desktop-dev.main" "$(line_at "$canonical" 5)" "canonical keyring service"

preserved=$(read_env "$test_root/repo" "NO_PROXY=example.com,localhost")
assert_eq "example.com,localhost,127.0.0.1,::1" "$(line_at "$preserved" 1)" "preserved NO_PROXY"
assert_eq "$(line_at "$preserved" 1)" "$(line_at "$preserved" 2)" "preserved proxy casing parity"

lowercase=$(read_env "$test_root/repo" "no_proxy=lower.example")
assert_eq "lower.example,localhost,127.0.0.1,::1" "$(line_at "$lowercase" 1)" "lowercase no_proxy fallback"
assert_eq "$(line_at "$lowercase" 1)" "$(line_at "$lowercase" 2)" "lowercase proxy casing parity"

explicit=$(read_env "$test_root/repo" "BUZZ_DEV_INSTANCE_SLUG=dev")
[[ "$(line_at "$explicit" 3)" == *'"identifier":"xyz.block.buzz.app.dev.dev"'* ]] || fail "explicit identifier missing"
assert_eq "dev" "$(line_at "$explicit" 4)" "explicit slug"
assert_eq "buzz-desktop-dev.dev" "$(line_at "$explicit" 5)" "explicit keyring service"

if read_env "$test_root/repo" "BUZZ_DEV_INSTANCE_SLUG=Bad/Slug" >/dev/null 2>&1; then
    fail "invalid explicit slug was accepted"
fi

git -C "$test_root/repo" branch worktree-test
git -C "$test_root/repo" worktree add -q "$test_root/worktree" worktree-test
worktree=$(read_env "$test_root/worktree")
[[ "$(line_at "$worktree" 3)" == *'"identifier":"xyz.block.buzz.app.dev.worktree-test"'* ]] || fail "worktree identifier missing"
assert_eq "worktree-test" "$(line_at "$worktree" 4)" "worktree slug"
assert_eq "buzz-desktop-dev.worktree-test" "$(line_at "$worktree" 5)" "worktree keyring service"

echo "test-instance-env: ok"
