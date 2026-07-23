# #0002 Android release CI lint model task reads generated case assets without depending on syncCaseAssets

- 2026-07-23T10:59:49Z `issue`: Android release CI lint model task reads generated case assets without depending on syncCaseAssets [pilot/app/build.gradle.kts]
- 2026-07-23T11:00:07Z `attempt`: Changed the Gradle dependency matcher to cover every lint-related task, including generateReleaseLintVitalReportModel [pilot/app/build.gradle.kts] (partial)
- 2026-07-23T11:00:29Z `attempt`: Reproduced the exact release lint-model task locally; sandbox blocked Gradle’s fileHashes lock before configuration [pilot/.gradle] (failed)
- 2026-07-23T11:01:22Z `attempt`: Elevated Gradle retry reached configuration but PowerShell split the -D Java-home argument into a task path [pilot/app/build.gradle.kts] (failed)
- 2026-07-23T11:02:34Z `attempt`: Correctly quoted Gradle retry reached task dependency resolution; the clean worktree lacked Android SDK configuration [pilot/app/build.gradle.kts] (failed)
- 2026-07-23T11:03:55Z `attempt`: Exact JDK 21 :app:generateReleaseLintVitalReportModel reproduction passed and executed syncCaseAssets first [pilot/app/build.gradle.kts] (worked)
- 2026-07-23T11:03:56Z `fix`: All Gradle lint-related tasks now depend on generated case assets, closing the Android release CI ordering failure [pilot/app/build.gradle.kts]
