plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
    application
}

group = "com.simjury"
version = "0.1.0-pilot"

repositories {
    mavenCentral()
}

dependencies {
    implementation(project(":case-model"))
    implementation(project(":deliberation-core"))
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    testImplementation(kotlin("test"))
    testImplementation(project(":case-model"))
    testImplementation(project(":deliberation-core"))
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("simjury.pilot.MainKt")
}

tasks.test {
    useJUnitPlatform()
}
