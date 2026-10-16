# W3C accessible-name conformance tests

The `accname/name` tests from web-platform-tests, at commit
`2a5ac6d83892b21a681ccbddcb47171b431d6c65` (https://github.com/web-platform-tests/wpt/tree/2a5ac6d/accname/name),
under the WPT licence in LICENSE.md. Each element with `data-expectedlabel` states the name the
W3C algorithm gives it.

`../../accname_test.ts` (in tranquil-test-suite, so these third-party files never ship with the app)
scores the SDK's name computation against them offline (on deno-dom,
which has no stylesheets, so cases that need CSS cannot pass here) and fails if the score drops.
To update: copy the folder from a newer WPT checkout and adjust the floors in that test.
