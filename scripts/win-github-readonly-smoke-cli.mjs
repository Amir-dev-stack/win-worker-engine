import {
  createGitHubReadOnlySmokeHarness,
  smokeConfigurationFromEnvironment
} from "./win-github-readonly-smoke.mjs";

const harness = createGitHubReadOnlySmokeHarness(
  smokeConfigurationFromEnvironment(process.env)
);
process.stdout.write(`${JSON.stringify(await harness.run())}\n`);
