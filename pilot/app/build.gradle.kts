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

val syncCaseAssets = tasks.register<Copy>("syncCaseAssets") {
    from("${rootProject.projectDir}/src/main/resources/cases")
    into("${project.projectDir}/src/main/assets/cases")
    include("**/*")
}

tasks.named("preBuild") {
    dependsOn(syncCaseAssets)
}

android {
    namespace = "simjury.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.simjury.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.2"
        buildConfigField("String", "APK_MANIFEST_URL", "\"$apkManifestUrl\"")
        buildConfigField("String", "PILOT_CASE_ID", "\"$pilotCaseId\"")
    }

    signingConfigs {
        getByName("debug")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
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
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
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
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
