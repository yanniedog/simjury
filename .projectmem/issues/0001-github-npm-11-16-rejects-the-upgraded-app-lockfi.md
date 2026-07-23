# #0001 GitHub npm 11.16 rejects the upgraded app lockfile because @emnapi optional native packages are missing

- 2026-07-23T10:56:54Z `issue`: GitHub npm 11.16 rejects the upgraded app lockfile because @emnapi optional native packages are missing [site/app/package-lock.json]
- 2026-07-23T10:57:28Z `attempt`: Regenerated package-lock.json with GitHub CI’s npm 11.16.0; npm reported zero vulnerabilities [site/app/package-lock.json] (partial)
- 2026-07-23T10:58:30Z `attempt`: npm 11.16 clean install passed, followed by 166 tests, lint, typecheck, build, and zero-vulnerability audit [site/app/package-lock.json] (worked)
- 2026-07-23T10:58:30Z `fix`: Toolchain lockfile is synchronized with GitHub’s npm 11.16 and passes the exact clean-install gate [site/app/package-lock.json]
