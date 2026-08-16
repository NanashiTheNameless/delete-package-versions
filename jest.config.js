module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'mjs', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testRunner: 'jest-circus/runner',
  transform: {
    '^.+\\.(ts|js|mjs)$': ['ts-jest', {isolatedModules: true}]
  },
  // msw@2, @octokit/* and several of their dependencies ship as ES modules
  // only. Transform them (instead of ignoring node_modules wholesale) so they
  // can run under Jest's CommonJS runtime.
  transformIgnorePatterns: [
    '/node_modules/(?!(msw|@mswjs|@open-draft|@bundled-es-modules|rettime|until-async|headers-polyfill|tough-cookie|strict-event-emitter|outvariant|is-node-process|@octokit|before-after-hook|universal-user-agent|fast-content-type-parse)/)'
  ],
  verbose: true
}
