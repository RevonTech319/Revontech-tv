# Add project-specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified in
# C:\Users\RUKN AL BAB\AppData\Local\Android\Sdk/tools/proguard/proguard-android.txt
# You can edit the include path and force proguard to use other files.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep WebView JavaScript interfaces
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep webview components
-keep class android.webkit.** { *; }

# Keep system classes
-keep class androidx.swiperefreshlayout.widget.SwipeRefreshLayout { *; }
