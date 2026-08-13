plugins {
    kotlin("jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "dev.pubgrade"
version = "2.1.2"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        // Community edition is the smallest thing that still proves the plugin
        // works in Android Studio, because Android Studio is this same platform.
        intellijIdeaCommunity("2024.2.5")
        instrumentationTools()
    }
    // Bundled into the plugin on purpose: the IntelliJ runtime does not ship
    // Gson, so picking it up off the compile classpath would work here and fail
    // in a real IDE. It is the only third-party dependency the plugin has.
    implementation("com.google.code.gson:gson:2.11.0")

    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(21)
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "242"
            untilBuild = provider { null }
        }
    }
    buildSearchableOptions = false
}

tasks.test {
    useJUnitPlatform()
}
