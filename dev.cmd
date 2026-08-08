@echo off
REM Local dev server for chasebonfiglio.com
REM Static serve + live reload. Does NOT run contact-form-process.php (no PHP locally).
REM assets/imgs is a junction to C:\portfolio-media\imgs and is deliberately NOT watched.
cd /d "%~dp0"
browser-sync start ^
  --server . ^
  --port 3000 ^
  --no-notify ^
  --no-open ^
  --files "*.html,assets/css/*.css,assets/js/*.js,arc-agi-3/**/*.html,arc-agi-3/**/*.css,arc-agi-3/**/*.js"
