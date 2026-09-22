// postinstall banner: print only, never prompt, never fail.
// Skipped in CI and non-TTY installs.
try {
  if (!process.env.CI && process.stdout.isTTY) {
    console.log('');
    console.log('  mmit - AI-powered git workflow');
    console.log('  Get started:  mmit init        (connect your AI provider)');
    console.log('  Then:         git add . && mmit');
    console.log('  Check setup anytime:  mmit doctor');
    console.log('');
  }
} catch {
  // never break `npm install`
}
process.exit(0);
