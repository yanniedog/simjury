plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

group = "com.simjury"
version = "0.1.0"

repositories {
    google()
    mavenCentral()
}

val apkManifestUrl: String =
    (project.findProperty("apkManifestUrl") as String?)
        ?: "https://github.com/yanniedog/simjury/releases/download/app-apk-latest/app-apk-latest.json"

val pilotCaseId: String = (project.findProperty("pilotCaseId") as String?) ?: "c_000"

val generatedAssetsRoot = layout.buildDirectory.dir("generated/caseAssets")
val generatedCasesDir = layout.buildDirectory.dir("generated/caseAssets/cases")

val syncCaseAssets = tasks.register<Copy>("syncCaseAssets") {
    from("${rootProject.projectDir}/src/main/resources/cases")
    into(generatedCasesDir)
    include("**/*")
}

android {
    namespace = "simjury.app"
    compileSdk = 35

    sourceSets {
        getByName("main") {
            assets.srcDir(generatedAssetsRoot)
        }
    }

    defaultConfig {
        applicationId = "com.simjury.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.19"
        buildConfigField("String", "APK_MANIFEST_URL", "\"$apkManifestUrl\"")
        buildConfigField("String", "PILOT_CASE_ID", "\"$pilotCaseId\"")
    }

    // Release signing is driven by CI secrets, surfaced as env vars in the
    // pilot-android-apk workflow (KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS,
    // KEY_PASSWORD). All four must be present to sign; when none are set (local
    // dev) we fall back to debug signing. A partial set is treated as a
    // misconfiguration and fails fast rather than silently shipping a
    // debug-signed or broken release.
    fun signingEnv(name: String): String? = System.getenv(name)?.takeIf { it.isNotBlank() }
    val releaseSigningEnv = listOf("KEYSTORE_PATH", "KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD")
    val presentSigningEnv = releaseSigningEnv.filter { signingEnv(it) != null }
    val hasReleaseSigning = presentSigningEnv.size == releaseSigningEnv.size
    if (presentSigningEnv.isNotEmpty() && !hasReleaseSigning) {
        throw org.gradle.api.GradleException(
            "Incomplete release signing config: set all of ${releaseSigningEnv.joinToString()} " +
                "or none. Missing: ${(releaseSigningEnv - presentSigningEnv.toSet()).joinToString()}",
        )
    }

    signingConfigs {
        getByName("debug")
        create("release") {
            if (hasReleaseSigning) {
                storeFile = file(signingEnv("KEYSTORE_PATH")!!)
                storePassword = signingEnv("KEYSTORE_PASSWORD")
                keyAlias = signingEnv("KEY_ALIAS")
                keyPassword = signingEnv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        getByName("debug") {
            buildConfigField("boolean", "SHOW_CASE_PICKER", "true")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("boolean", "SHOW_CASE_PICKER", "false")
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
}

afterEvaluate {
    tasks.matching { it.name.contains("merge") && it.name.contains("Assets") }.configureEach {
        dependsOn(syncCaseAssets)
    }
    tasks.matching { it.name.contains("Lint", ignoreCase = true) }.configureEach {
        dependsOn(syncCaseAssets)
    }
}

dependencies {
    implementation(project(":case-model"))
    implementation(project(":deliberation-core"))
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("io.coil-kt:coil-compose:2.7.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test.ext:junit:1.2.1")
    testImplementation(platform("androidx.compose:compose-bom:2024.10.01"))
    testImplementation("androidx.compose.ui:ui-test")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("androidx.compose.ui:ui-test-manifest")
}
