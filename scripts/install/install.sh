#!/usr/bin/env bash
# Guided Zencast setup for Linux and macOS:
#   curl -fsSL https://raw.githubusercontent.com/Noelithub77/zencast/master/scripts/install/install.sh | bash
# Finds the Zen profile, installs Sine with its official installer when missing, installs Zencast
# from the release branch, registers it for Sine's auto-updates and, with consent, turns on
# "Allow unsafe JS". Windows: install.ps1 beside this file.
set -euo pipefail

REPO="Noelithub77/zencast"
BRANCH="release"
HOMEPAGE="https://github.com/$REPO/tree/$BRANCH"
MOD_ID="zencast"

# Everything lives in main so a partly downloaded script never runs.
main() {
  local profile="" yes=false uninstall=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile) profile="${2:?--profile needs a directory}"; shift ;;
      --yes|-y) yes=true ;;
      --uninstall) uninstall=true ;;
      -h|--help) usage; return 0 ;;
      *) fail "Unknown option: $1 (see --help)" ;;
    esac
    shift
  done
  YES=$yes

  title "Zencast setup"
  need curl; need tar; need perl

  [[ -n "$profile" ]] || profile=$(pick_profile)
  [[ -d "$profile" ]] || fail "No profile at $profile"
  step "Profile" "$profile"

  wait_for_zen_closed "$profile"

  if $uninstall; then
    remove_mod "$profile"
    done_line "Removed Zencast. Sine and its settings are unchanged."
    return 0
  fi

  ensure_sine "$profile"
  install_mod "$profile"
  ensure_unsafe_js "$profile"

  printf '\n'
  done_line "Zencast is ready. Open Zen and press Ctrl+K; Ctrl+, opens its settings."
  muted "  Updates arrive through Sine. Source and issues: https://github.com/$REPO"
}

usage() {
  cat <<EOF
Usage: install.sh [--profile <dir>] [--yes] [--uninstall]

  --profile <dir>  Zen profile to set up (default: ask, or the profile Zen opens by default)
  --yes            Accept every prompt (installs Sine and turns on "Allow unsafe JS")
  --uninstall      Remove Zencast from the profile
EOF
}

# ---------- output and prompts ----------

if [[ -t 2 ]]; then BOLD=$'\e[1m'; DIM=$'\e[2m'; PEACH=$'\e[38;2;255;199;153m'; MINT=$'\e[38;2;153;255;228m'; ROSE=$'\e[38;2;255;128;128m'; RESET=$'\e[0m'
else BOLD=""; DIM=""; PEACH=""; MINT=""; ROSE=""; RESET=""; fi

title() { printf '\n%s%s%s\n\n' "$BOLD$PEACH" "$1" "$RESET" >&2; }
step() { printf '%s●%s %-9s %s\n' "$MINT" "$RESET" "$1" "$2" >&2; }
muted() { printf '%s%s%s\n' "$DIM" "$1" "$RESET" >&2; }
note() { printf '\n%s\n' "$1" >&2; }
done_line() { printf '%s✓%s %s\n' "$MINT" "$RESET" "$1" >&2; }
fail() { printf '%s✗%s %s\n' "$ROSE" "$RESET" "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required but not installed"; }

# Prompts read the terminal, since stdin is the script itself under curl | bash.
ask() {
  local question=$1 default=${2:-y} answer hint="[Y/n]"
  [[ $default == n ]] && hint="[y/N]"
  if $YES; then return 0; fi
  [[ -r /dev/tty ]] || fail "No terminal to ask \"$question\"; rerun with --yes or follow the README"
  printf '%s?%s %s %s ' "$PEACH" "$RESET" "$question" "$hint" >&2
  read -r answer </dev/tty || answer=""
  answer=${answer:-$default}
  [[ $answer =~ ^[Yy] ]]
}

pause() {
  [[ -r /dev/tty ]] || return 0
  printf '%s›%s %s ' "$PEACH" "$RESET" "$1" >&2
  read -r _ </dev/tty || true
}

# ---------- profiles ----------

zen_roots() {
  case "$(uname -s)" in
    Darwin) printf '%s\n' "$HOME/Library/Application Support/zen" ;;
    *)
      printf '%s\n' "${XDG_CONFIG_HOME:-$HOME/.config}/zen" "$HOME/.zen" \
        "$HOME/.var/app/app.zen_browser.zen/config/zen" "$HOME/.var/app/app.zen_browser.zen/.zen"
      ;;
  esac
}

# Prints "path<TAB>name<TAB>default" for every profile in profiles.ini.
list_profiles() {
  local root
  while IFS= read -r root; do
    [[ -f "$root/profiles.ini" ]] || continue
    local default=""
    [[ -f "$root/installs.ini" ]] && default=$(sed -n 's/^Default=//p' "$root/installs.ini" | head -n1 | tr -d '\r')
    ROOT="$root" DEFAULT="$default" perl -ne '
      chomp; s/\r$//;
      if (/^\[/) { emit(); %p = (); next }
      $p{$1} = $2 if /^(\w+)=(.*)$/;
      END { emit() }
      sub emit {
        return unless defined $p{Path};
        my $path = $p{IsRelative} ? "$ENV{ROOT}/$p{Path}" : $p{Path};
        my $default = ($p{Path} eq $ENV{DEFAULT} || ($ENV{DEFAULT} eq "" && $p{Default})) ? 1 : 0;
        print join("\t", $path, $p{Name} // $p{Path}, $default), "\n" if -d $path;
      }' "$root/profiles.ini"
  done < <(zen_roots)
}

pick_profile() {
  local rows=() row
  while IFS= read -r row; do rows+=("$row"); done < <(list_profiles)
  [[ ${#rows[@]} -gt 0 ]] || fail "No Zen profile found. Open Zen once, then run this again, or pass --profile <dir>"

  local chosen=0 i
  for i in "${!rows[@]}"; do [[ ${rows[$i]##*$'\t'} == 1 ]] && chosen=$i; done
  if [[ ${#rows[@]} -gt 1 ]] && ! $YES && [[ -r /dev/tty ]]; then
    note "Zen profiles:"
    for i in "${!rows[@]}"; do
      local mark=" "; [[ $i == "$chosen" ]] && mark="${MINT}●${RESET}"
      IFS=$'\t' read -r path name _ <<<"${rows[$i]}"
      printf '  %s %d  %s %s(%s)%s\n' "$mark" $((i + 1)) "$name" "$DIM" "$path" "$RESET" >&2
    done
    local answer
    printf '%s?%s Profile number [%d] ' "$PEACH" "$RESET" $((chosen + 1)) >&2
    read -r answer </dev/tty || answer=""
    if [[ $answer =~ ^[0-9]+$ ]] && ((answer >= 1 && answer <= ${#rows[@]})); then chosen=$((answer - 1)); fi
  fi
  printf '%s\n' "${rows[$chosen]%%$'\t'*}"
}

# ---------- Zen ----------

zen_running() {
  local profile=$1 lock pid
  # Linux: the lock symlink points at "ip:+pid" while Zen holds the profile.
  if lock=$(readlink "$profile/lock" 2>/dev/null); then
    pid=${lock##*+}
    [[ $pid =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null && return 0
  fi
  [[ "$(uname -s)" == Darwin ]] && pgrep -xq zen && return 0
  return 1
}

# Zen rewrites prefs.js and reloads mods.json on exit, so every write happens while it is closed.
wait_for_zen_closed() {
  local profile=$1
  zen_running "$profile" || return 0
  note "Zen is open. Quit it fully (all windows) so setup can write to the profile."
  $YES && fail "Zen is running; quit it and run again"
  while zen_running "$profile"; do pause "Press Enter once Zen is closed"; done
}

# ---------- Sine ----------

sine_installed() { [[ -f "$1/chrome/JS/sine.sys.mjs" ]]; }

ensure_sine() {
  local profile=$1
  if sine_installed "$profile"; then step "Sine" "installed"; return; fi

  note "Zencast runs on ${BOLD}Sine${RESET}, the mod manager that lets Zen load script mods."
  muted "  Its official installer will ask which browser and profile to use: choose Zen and this profile."
  muted "  It may ask for your password to add Sine's loader to Zen's program folder."
  muted "  https://github.com/CosmoCreeper/Sine"
  ask "Download and run the Sine installer now?" || fail "Sine is required. Install it from https://github.com/CosmoCreeper/Sine/releases/latest, then run this again"

  local os arch asset tmp
  case "$(uname -s)" in Darwin) os=osx ;; Linux) os=linux ;; *) fail "Unsupported system: $(uname -s)" ;; esac
  case "$(uname -m)" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; *) fail "Unsupported CPU: $(uname -m)" ;; esac
  asset="sine-$os-$arch"
  tmp=$(mktemp -d)
  curl -fL --progress-bar "https://github.com/CosmoCreeper/Sine/releases/latest/download/$asset" -o "$tmp/$asset" \
    || fail "Could not download $asset"
  chmod +x "$tmp/$asset"
  if [[ $os == osx ]]; then
    # Sine's documented steps for its unsigned macOS binary.
    xattr -d com.apple.quarantine "$tmp/$asset" 2>/dev/null || true
    codesign --force --deep --sign - "$tmp/$asset" 2>/dev/null || sudo codesign --force --deep --sign - "$tmp/$asset"
  fi
  (cd "$tmp" && "./$asset" </dev/tty) || fail "The Sine installer did not finish"
  rm -rf "$tmp"

  sine_installed "$profile" || fail "Sine is not in $profile yet. Rerun the Sine installer, choose this profile, then run this again"
  step "Sine" "installed"
  # The Sine installer may open Zen when it finishes.
  wait_for_zen_closed "$profile"
}

# ---------- Zencast ----------

install_mod() {
  local profile=$1 mods="$1/chrome/sine-mods" tmp
  tmp=$(mktemp -d)
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$tmp" \
    || fail "Could not download Zencast from $HOMEPAGE"
  local src="$tmp/zencast-$BRANCH"
  [[ -f "$src/theme.json" && -f "$src/zencast.uc.mjs" ]] || fail "The download is missing theme.json or zencast.uc.mjs"

  mkdir -p "$mods"
  rm -rf "${mods:?}/$MOD_ID"
  cp -R "$src" "$mods/$MOD_ID"
  register "$mods" "$src/theme.json"
  rm -rf "$tmp"
  step "Zencast" "$(version "$mods/$MOD_ID/theme.json") installed"
}

version() { perl -MJSON::PP -0777 -ne 'print decode_json($_)->{version} // "?"' "$1"; }

# Adds the mod to Sine's registry like a URL install, so Sine keeps it updated from the release branch.
register() {
  local mods=$1 theme=$2
  MODS="$mods/mods.json" THEME="$theme" HOMEPAGE="$HOMEPAGE" ID="$MOD_ID" perl -MJSON::PP -e '
    sub slurp { local $/; open my $f, "<", $_[0] or return undef; my $s = <$f>; close $f; $s }
    my $json = JSON::PP->new->canonical;
    my $list = -s $ENV{MODS} ? $json->decode(slurp($ENV{MODS})) : {};
    my $theme = $json->decode(slurp($ENV{THEME}));
    my $previous = $list->{$ENV{ID}} // {};
    $theme->{homepage} = $ENV{HOMEPAGE};
    $theme->{createdAt} = $previous->{createdAt} // $theme->{updatedAt};
    # Keep a mod the user disabled in Sine disabled.
    $theme->{enabled} = exists $previous->{enabled} ? $previous->{enabled} : JSON::PP::true;
    $theme->{"no-updates"} = JSON::PP::false;
    $list->{$ENV{ID}} = $theme;
    open my $out, ">", "$ENV{MODS}.zencast-tmp" or die "Cannot write $ENV{MODS}: $!";
    print $out $json->encode($list);
    close $out;
    rename "$ENV{MODS}.zencast-tmp", $ENV{MODS} or die "Cannot replace $ENV{MODS}: $!";
  ' || fail "Could not update $mods/mods.json"
}

remove_mod() {
  local mods="$1/chrome/sine-mods"
  rm -rf "${mods:?}/$MOD_ID"
  [[ -f "$mods/mods.json" ]] || return 0
  MODS="$mods/mods.json" ID="$MOD_ID" perl -MJSON::PP -0777 -i -ne '
    my $json = JSON::PP->new->canonical; my $list = $json->decode($_);
    delete $list->{$ENV{ID}}; print $json->encode($list)' "$mods/mods.json"
}

# ---------- Allow unsafe JS ----------

pref_value() {
  local profile=$1 name=$2 value="" file
  # user.js is applied after prefs.js, so its value wins.
  for file in prefs.js user.js; do
    [[ -f "$profile/$file" ]] || continue
    local found
    found=$(sed -n "s/^user_pref(\"${name//./\\.}\", *\(.*\));.*/\1/p" "$profile/$file" | tail -n1)
    [[ -n $found ]] && value=$found
  done
  printf '%s' "$value"
}

ensure_unsafe_js() {
  local profile=$1 pref="sine.allow-unsafe-js"
  if [[ "$(pref_value "$profile" "$pref")" == true ]]; then step "Scripts" "allowed"; return; fi

  note "${BOLD}One switch left: Sine's \"Allow unsafe JS\".${RESET}"
  muted "  Zencast is not in the Sine store yet. Sine runs JavaScript only from store mods unless this"
  muted "  is on. With it on, any mod you install from a URL or folder runs with full browser access,"
  muted "  so only install mods you trust. Zencast is open source: https://github.com/$REPO"
  muted "  You can turn it off any time in Zen settings › Sine."
  if ! ask "Turn on \"Allow unsafe JS\" for this profile?"; then
    note "Zencast stays inactive until you turn it on: Zen settings › Sine › \"Enable installing JS from unofficial sources\", then restart Zen."
    return
  fi
  if [[ -f "$profile/user.js" ]] && grep -q "\"$pref\"" "$profile/user.js"; then
    fail "$profile/user.js pins $pref; change it there to true"
  fi
  local prefs="$profile/prefs.js"
  touch "$prefs"
  grep -v "\"$pref\"" "$prefs" >"$prefs.zencast-tmp" || true
  printf 'user_pref("%s", true);\n' "$pref" >>"$prefs.zencast-tmp"
  mv "$prefs.zencast-tmp" "$prefs"
  step "Scripts" "allowed"
}

main "$@"
