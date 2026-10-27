# Keep the build-host identity in ignored local configuration.
md_require_docker_host() {
  local expected="${MD_EXPECTED_HOST:-}"
  if [[ -z "$expected" && -f .local/host-name ]]; then
    IFS= read -r expected < .local/host-name
  fi
  if [[ -z "$expected" ]]; then
    echo 'Set MD_EXPECTED_HOST or .local/host-name before running remote checks.' >&2
    return 1
  fi
  if [[ "$(docker info --format '{{.Name}}')" != "$expected" ]]; then
    echo 'Docker is not connected to the configured build host.' >&2
    return 1
  fi
}
