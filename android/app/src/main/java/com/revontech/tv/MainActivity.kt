package com.revontech.tv

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.ImageButton
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var auth: FirebaseAuth
    private lateinit var headerBar: View
    private lateinit var btnLogout: ImageButton
    private lateinit var btnNotifications: ImageButton
    private lateinit var bottomNavigation: BottomNavigationView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize Firebase
        FirebaseApp.initializeApp(this)
        auth = FirebaseAuth.getInstance()

        // Check for updates
        checkAppVersion()

        headerBar = findViewById(R.id.header_bar)
        btnLogout = findViewById(R.id.btn_logout)
        btnNotifications = findViewById(R.id.btn_notifications)
        bottomNavigation = findViewById(R.id.bottom_navigation)

        btnLogout.setOnClickListener {
            auth.signOut()
            Toast.makeText(this, "Umetoka kwenye akaunti", Toast.LENGTH_SHORT).show()
            checkAuthAndLoadView()
        }

        btnNotifications.setOnClickListener {
            loadNotificationsFragment()
        }

        setupBottomNavigation()

        // Check authentication state on start
        checkAuthAndLoadView()

        // Handle deep link from intent if any
        handleDeepLink(intent)

        setupBackNavigation()
    }

    private fun checkAppVersion() {
        val firestore = FirebaseFirestore.getInstance()
        firestore.collection("settings").document("general_settings")
            .get()
            .addOnSuccessListener { doc ->
                if (isFinishing || isDestroyed) return@addOnSuccessListener
                if (doc.exists()) {
                    val latestVersionCode = doc.getLong("latest_version_code") ?: 0L
                    val latestVersionName = doc.getString("latest_version_name") ?: ""
                    val updateUrl = doc.getString("update_url") ?: ""
                    val forceUpdate = doc.getBoolean("force_update") ?: false
                    val updateNotes = doc.getString("update_notes") ?: ""
                    val oneSignalAppId = doc.getString("onesignal_app_id") ?: ""

                    if (oneSignalAppId.isNotEmpty()) {
                        initOneSignal(oneSignalAppId)
                    }

                    try {
                        val pInfo = packageManager.getPackageInfo(packageName, 0)
                        val currentVersionCode = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                            pInfo.longVersionCode
                        } else {
                            @Suppress("DEPRECATION")
                            pInfo.versionCode.toLong()
                        }

                        if (latestVersionCode > currentVersionCode && updateUrl.isNotEmpty()) {
                            showUpdateDialog(latestVersionName, updateUrl, forceUpdate, updateNotes)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }
    }

    private fun initOneSignal(appId: String) {
        try {
            com.onesignal.OneSignal.initWithContext(this.applicationContext, appId)
            // Ask for push notification permission
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Main).launch {
                try {
                    com.onesignal.OneSignal.Notifications.requestPermission(true)
                } catch (ex: Exception) {
                    ex.printStackTrace()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun showUpdateDialog(latestVersionName: String, updateUrl: String, forceUpdate: Boolean, updateNotes: String) {
        val builder = MaterialAlertDialogBuilder(this)
            .setTitle("Sasisho la Toleo Jipya")
            .setMessage("Toleo jipya la RevonTV ($latestVersionName) linapatikana.\n\nMaelezo ya sasisho:\n${updateNotes.ifEmpty { "Maboresho ya jumla na marekebisho ya hitilafu." }}")
            .setPositiveButton("Sasisha Sasa") { _, _ ->
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(updateUrl))
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this, "Imeshindikana kufungua kiungo cha sasisho!", Toast.LENGTH_SHORT).show()
                }
                if (forceUpdate) {
                    finish()
                }
            }

        if (forceUpdate) {
            builder.setCancelable(false)
        } else {
            builder.setNegativeButton("Baadaye") { dialog, _ ->
                dialog.dismiss()
            }
            builder.setCancelable(true)
        }

        val dialog = builder.create()
        if (forceUpdate) {
            dialog.setCanceledOnTouchOutside(false)
            dialog.setOnCancelListener {
                finish()
            }
        }
        dialog.show()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val route = intent?.getStringExtra("route")
        if (route == "payment" && auth.currentUser != null) {
            bottomNavigation.selectedItemId = R.id.nav_payment
            loadPaymentFragment()
        }
    }

    private fun setupBottomNavigation() {
        bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> {
                    loadHomeFragment()
                    true
                }
                R.id.nav_movies -> {
                    loadMoviesFragment()
                    true
                }
                R.id.nav_payment -> {
                    loadPaymentFragment()
                    true
                }
                R.id.nav_profile -> {
                    loadProfileFragment()
                    true
                }
                else -> false
            }
        }
    }

    fun checkAuthAndLoadView() {
        val currentUser = auth.currentUser
        if (currentUser == null) {
            // Hide custom header and bottom navigation in Login view
            headerBar.visibility = View.GONE
            bottomNavigation.visibility = View.GONE
            loadLoginFragment()
        } else {
            // Show custom header and bottom navigation in Catalog/Catalog view
            headerBar.visibility = View.VISIBLE
            bottomNavigation.visibility = View.VISIBLE
            
            // Default select Home item
            bottomNavigation.selectedItemId = R.id.nav_home
            loadHomeFragment()
        }
    }

    private fun loadLoginFragment() {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, LoginFragment())
            .commit()
    }

    fun loadHomeFragment() {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, HomeFragment())
            .commit()
    }

    fun loadMoviesFragment() {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, MoviesFragment())
            .commit()
    }

    fun loadPaymentFragment() {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, PaymentFragment())
            .commit()
    }

    fun loadNotificationsFragment() {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, NotificationsFragment())
            .commit()
    }

    fun loadProfileFragment() {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, ProfileFragment())
            .commit()
    }

    fun loadAboutFragment() {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, AboutFragment())
            .commit()
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val currentFragment = supportFragmentManager.findFragmentById(R.id.fragment_container)
                if (currentFragment is LoginFragment) {
                    finish()
                } else if (currentFragment is HomeFragment) {
                    finish()
                } else if (currentFragment is AboutFragment) {
                    // Back from About Fragment returns to Profile Fragment
                    bottomNavigation.selectedItemId = R.id.nav_profile
                } else if (currentFragment is MovieDetailFragment) {
                    // Back from Movie Detail returns to Movies Fragment
                    bottomNavigation.selectedItemId = R.id.nav_movies
                } else {
                    // If on profile, payment, notifications, or movies, back returns to native homepage
                    bottomNavigation.selectedItemId = R.id.nav_home
                }
            }
        })
    }
}
