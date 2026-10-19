#!/usr/bin/env bash
# Computes the next semver tag from Conventional Commit subjects since the
# last v* tag and publishes a GitHub Release with grouped notes.
#
#   feat!: / BREAKING CHANGE  -> major
#   feat:                     -> minor
#   fix: / perf: / refactor:  -> patch
#   anything else             -> no release (rides along in the next one)
#
# Env: TARGET_SHA (commit to tag, default HEAD), FORCE=true (release even when
# only chore/docs/ci commits landed), DRY_RUN=true (print, publish nothing).
set -euo pipefail

target="${TARGET_SHA:-$(git rev-parse HEAD)}"
repo_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-bryanrmq/oca-generator}"

last_tag="$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' "$target" 2>/dev/null || true)"
if [[ -n "$last_tag" ]]; then
  range="$last_tag..$target"
  version="${last_tag#v}"
else
  range="$target"
  version=""
fi

subjects="$(git log --no-merges --format='%s' "$range")"
if [[ -z "$subjects" ]]; then
  echo "No commits since $last_tag, nothing to release."
  exit 0
fi

breaking_re='^[a-z]+(\([^)]*\))?!:'
feat_re='^feat(\([^)]*\))?:'
fix_re='^(fix|perf)(\([^)]*\))?:'

# Breaking commits are flagged either with "!" in the subject or with a
# BREAKING CHANGE footer in the body.
breaking="$(
  {
    grep -E "$breaking_re" <<<"$subjects" || true
    git log --no-merges --format='%x1e%s%n%b' "$range" |
      awk 'BEGIN { RS = "\x1e" } NF && /\nBREAKING[ -]CHANGE:/ { sub(/\n.*/, ""); print }'
  } | awk 'NF && !seen[$0]++'
)"
others="$(grep -vxF -f <(printf '%s\n' "$breaking") <<<"$subjects" || true)"
[[ -z "$breaking" ]] && others="$subjects"

bump=none
if [[ -n "$breaking" ]]; then
  bump=major
elif grep -qE '^feat(\([^)]*\))?:' <<<"$subjects"; then
  bump=minor
elif grep -qE '^(fix|perf|refactor)(\([^)]*\))?:' <<<"$subjects"; then
  bump=patch
fi

if [[ "$bump" == none ]]; then
  if [[ "${FORCE:-false}" != true ]]; then
    echo "Only chore/docs/ci-style commits since ${last_tag:-the start}, skipping release."
    exit 0
  fi
  bump=patch
fi

if [[ -z "$version" ]]; then
  # First release: use the version already in package.json.
  next="$(node -p 'require("./package.json").version')"
else
  IFS=. read -r major minor patch <<<"$version"
  case "$bump" in
    major) if (( major == 0 )); then next="0.$((minor + 1)).0"; else next="$((major + 1)).0.0"; fi ;;
    minor) next="$major.$((minor + 1)).0" ;;
    patch) next="$major.$minor.$((patch + 1))" ;;
  esac
fi
tag="v$next"

# Prints one notes section, stripping the type prefix and linking the
# "(#123)" suffix that squash merges add.
section() {
  local title="$1" lines="$2"
  [[ -z "$lines" ]] && return 0
  printf '### %s\n\n' "$title"
  sed -E \
    -e 's/^[a-z]+(\(([^)]*)\))?!?: */- **\2:** /' \
    -e 's/^- \*\*:\*\* /- /' \
    -e '/^- /!s/^/- /' \
    -e "s|\(#([0-9]+)\)\$|([#\\1]($repo_url/pull/\\1))|" <<<"$lines"
  printf '\n'
}

notes="$(
  section 'Breaking changes' "$breaking"
  section 'Features' "$(grep -E "$feat_re" <<<"$others" || true)"
  section 'Fixes' "$(grep -E "$fix_re" <<<"$others" || true)"
  section 'Other changes' "$(grep -vE "$feat_re|$fix_re" <<<"$others" || true)"
  if [[ -n "$last_tag" ]]; then
    printf '**Full changelog:** %s/compare/%s...%s\n' "$repo_url" "$last_tag" "$tag"
  fi
)"

echo "Next release: $tag ($bump bump from ${last_tag:-nothing})"
echo
echo "$notes"

if [[ "${DRY_RUN:-false}" == true ]]; then
  exit 0
fi

gh release create "$tag" --target "$target" --title "$tag" --notes "$notes"
