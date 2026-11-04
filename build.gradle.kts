plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.horizon.apex.cotizador"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.horizon.apex.cotizador"
        minSdk = 26
        targetSdk = 34
        versionCode = 13
        versionName = "1.3.9"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Para uso interno: firma el release con la clave de debug así el APK se instala directo.
            // (Si algún día se publica en Play Store, hay que crear una clave propia.)
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.11.0")
}
